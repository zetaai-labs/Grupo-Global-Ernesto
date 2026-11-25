import { query, withTransaction } from '../config/database.js'
import { priceLine } from './commercial.service.js'
import { notifyRoles } from './notification.service.js'
import { writeAudit } from './audit.js'
import { insertInvoice } from '../zylax/special.controller.js'

/** Subscription billing: issues one invoice per period, tracks overdue accounts, and records online payments. */

export const PAYMENT_TERMS_DAYS = 14
const MAX_CATCH_UP_PERIODS = 12

const isoDate = (date) => date.toISOString().slice(0, 10)
export const today = () => isoDate(new Date())

/** Adds one billing interval, keeping month-end dates sensible (31 Jan + 1 month = 28/29 Feb). */
export function addInterval(dateString, interval) {
  const [year, month, day] = dateString.split('-').map(Number)
  const months = interval === 'YEAR' ? 12 : 1
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return isoDate(target)
}

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date)
}

/** Issues the invoice for one subscription period. Returns null if that period was already invoiced. */
export async function invoicePeriod(client, subscription, plan, periodStart, actorId = null) {
  const existing = await client.query(
    `SELECT invoice_id FROM zx_invoices WHERE subscription_id = $1 AND period_start = $2 AND kind = 'STANDARD'`,
    [subscription.subscription_id, periodStart],
  )
  if (existing.rows[0]) return null
  const periodEnd = addInterval(periodStart, plan.billing_interval)
  const line = {
    product_id: null,
    sku: plan.code,
    name: `${plan.name} (${periodStart} – ${periodEnd})`,
    qty: 1,
    unit_price_eur: plan.amount_eur,
    discount_pct: 0,
    tax_rate: plan.tax_rate,
    ...priceLine({ qty: 1, unit_price_eur: plan.amount_eur, tax_rate: plan.tax_rate }),
  }
  const total = (Number(line.net_eur) + Number(line.tax_eur)).toFixed(2)
  const invoice = await insertInvoice(client, {
    source: 'SUBSCRIPTION', customer_org_id: subscription.org_id, status: 'ISSUED',
    net_eur: line.net_eur, tax_eur: line.tax_eur, total_eur: total, created_by: actorId,
  }, [line])
  await client.query(
    'UPDATE zx_invoices SET subscription_id = $2, period_start = $3, due_date = $4 WHERE invoice_id = $1',
    [invoice.invoice_id, subscription.subscription_id, periodStart, addDays(periodStart, PAYMENT_TERMS_DAYS)],
  )
  return invoice
}

/**
 * Renews every subscription whose period has ended, and updates overdue status.
 * Safe to run often and from several servers: each subscription row is locked while it is renewed.
 */
export async function runBillingCycle(on = today()) {
  const summary = { renewed: 0, invoices: 0, canceled: 0, past_due: 0, recovered: 0 }
  const due = await query(
    `SELECT subscription_id FROM billing_subscriptions WHERE status <> 'CANCELED' AND current_period_end <= $1 ORDER BY current_period_end`,
    [on],
  )
  for (const { subscription_id: id } of due.rows) {
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT s.*, s.current_period_end::text AS period_end_text, p.code, p.name, p.billing_interval, p.amount_eur, p.tax_rate
         FROM billing_subscriptions s JOIN billing_plans p ON p.plan_id = s.plan_id
         WHERE s.subscription_id = $1 AND s.status <> 'CANCELED' AND s.current_period_end <= $2 FOR UPDATE OF s SKIP LOCKED`,
        [id, on],
      )
      const sub = rows[0]
      if (!sub) return
      if (sub.cancel_at_period_end) {
        await client.query(`UPDATE billing_subscriptions SET status = 'CANCELED', canceled_at = now(), updated_at = now() WHERE subscription_id = $1`, [id])
        summary.canceled += 1
        return
      }
      let start = sub.period_end_text
      let periods = 0
      while (start <= on && periods < MAX_CATCH_UP_PERIODS) {
        if (await invoicePeriod(client, sub, sub, start)) summary.invoices += 1
        start = addInterval(start, sub.billing_interval)
        periods += 1
      }
      const previous = (await client.query(
        `SELECT max(period_start)::text AS last FROM zx_invoices WHERE subscription_id = $1 AND kind = 'STANDARD'`, [id],
      )).rows[0].last
      await client.query(
        'UPDATE billing_subscriptions SET current_period_start = $2, current_period_end = $3, updated_at = now() WHERE subscription_id = $1',
        [id, previous, start],
      )
      summary.renewed += 1
    })
  }

  const overdue = await query(
    `UPDATE billing_subscriptions s SET status = 'PAST_DUE', updated_at = now()
     WHERE s.status = 'ACTIVE' AND EXISTS (
       SELECT 1 FROM zx_invoices i WHERE i.subscription_id = s.subscription_id AND i.kind = 'STANDARD'
         AND i.status = 'ISSUED' AND i.due_date < $1
         AND NOT EXISTS (SELECT 1 FROM zx_invoices c WHERE c.corrects_invoice_id = i.invoice_id))
     RETURNING s.subscription_id`,
    [on],
  )
  summary.past_due = overdue.rowCount
  const recovered = await query(
    `UPDATE billing_subscriptions s SET status = 'ACTIVE', updated_at = now()
     WHERE s.status = 'PAST_DUE' AND NOT EXISTS (
       SELECT 1 FROM zx_invoices i WHERE i.subscription_id = s.subscription_id AND i.kind = 'STANDARD'
         AND i.status = 'ISSUED' AND i.due_date < $1
         AND NOT EXISTS (SELECT 1 FROM zx_invoices c WHERE c.corrects_invoice_id = i.invoice_id))
     RETURNING s.subscription_id`,
    [on],
  )
  summary.recovered = recovered.rowCount
  if (overdue.rowCount) {
    await notifyRoles(['finance', 'admin'], {
      type: 'billing', title: `${overdue.rowCount} subscription(s) are overdue`, body: 'An invoice is past its due date.', link: '/intranet/billing',
    })
  }
  return summary
}

/**
 * Applies a confirmed online payment. The invoice row is locked, so two confirmations for the same
 * invoice can never both mark it paid. Wrong amounts and double payments are flagged for Finance.
 */
export async function applyPayment(client, { invoiceId, provider, providerRef, amount, currency }) {
  const { rows } = await client.query('SELECT * FROM zx_invoices WHERE invoice_id = $1 FOR UPDATE', [invoiceId])
  const invoice = rows[0]
  if (!invoice) return { outcome: 'UNKNOWN_INVOICE' }
  const cents = (value) => Math.round(Number(value) * 100)
  const method = provider === 'PAYPAL' ? 'PAYPAL' : 'CARD'
  const record = async (status) => client.query(
    `INSERT INTO payments (invoice_id, provider, provider_ref, status, amount_eur, completed_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (provider, provider_ref) DO UPDATE SET status = EXCLUDED.status, amount_eur = EXCLUDED.amount_eur, completed_at = now()`,
    [invoiceId, provider, providerRef, status, Number(amount || 0).toFixed(2)],
  )

  const correct = String(currency || '').toUpperCase() === 'EUR' && cents(amount) === cents(invoice.total_eur)
  if (!correct) {
    await record('FAILED')
    return { outcome: 'AMOUNT_MISMATCH', invoice }
  }
  if (invoice.status !== 'ISSUED' || invoice.kind !== 'STANDARD') {
    await record('DUPLICATE')
    return { outcome: 'DUPLICATE', invoice }
  }
  await client.query(`UPDATE zx_invoices SET status = 'PAID', payment_method = $2, paid_at = now() WHERE invoice_id = $1`, [invoiceId, method])
  await record('COMPLETED')
  return { outcome: 'PAID', invoice }
}

/** Notifications and audit after a payment transaction has committed. */
export async function afterPayment(result, provider) {
  if (!result?.invoice) return
  const number = result.invoice.invoice_number
  if (result.outcome === 'PAID') {
    await writeAudit(null, 'BILLING_PAYMENT_RECEIVED', 'zx_invoices', result.invoice.invoice_id, { provider })
    await notifyRoles(['finance'], { type: 'billing', title: `Payment received for ${number}`, body: provider, link: '/intranet/billing' })
  } else {
    await writeAudit(null, `BILLING_PAYMENT_${result.outcome}`, 'zx_invoices', result.invoice.invoice_id, { provider })
    await notifyRoles(['finance', 'admin'], {
      type: 'billing',
      title: result.outcome === 'DUPLICATE' ? `Duplicate payment for ${number}: refund needed` : `Payment amount does not match ${number}`,
      body: `${provider}. Check the provider dashboard.`,
      link: '/intranet/billing',
    })
  }
}

/** Monthly and annual recurring revenue (without VAT) from live subscriptions. */
export async function recurringRevenue() {
  const { rows } = await query(
    `SELECT
       COALESCE(sum(CASE WHEN p.billing_interval = 'YEAR' THEN p.amount_eur / 12 ELSE p.amount_eur END), 0) AS mrr,
       count(*) FILTER (WHERE s.status = 'ACTIVE')::int AS active,
       count(*) FILTER (WHERE s.status = 'PAST_DUE')::int AS past_due
     FROM billing_subscriptions s JOIN billing_plans p ON p.plan_id = s.plan_id
     WHERE s.status IN ('ACTIVE', 'PAST_DUE')`,
  )
  const churn = await query(`SELECT count(*)::int AS total FROM billing_subscriptions WHERE status = 'CANCELED' AND canceled_at > now() - interval '30 days'`)
  const open = await query(`SELECT count(*)::int AS total, COALESCE(sum(total_eur), 0) AS amount FROM zx_invoices WHERE status = 'ISSUED' AND kind = 'STANDARD'`)
  const mrr = Math.round(Number(rows[0].mrr) * 100) / 100
  return {
    mrr_eur: mrr, arr_eur: Math.round(mrr * 12 * 100) / 100,
    active: rows[0].active, past_due: rows[0].past_due, canceled_30d: churn.rows[0].total,
    open_invoices: open.rows[0].total, open_amount_eur: Number(open.rows[0].amount),
  }
}
