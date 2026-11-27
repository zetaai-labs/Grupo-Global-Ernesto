import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { config } from '../config/env.js'
import { query, withTransaction } from '../config/database.js'
import { isExternal } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { addInterval, afterPayment, applyPayment, invoicePeriod, recurringRevenue, runBillingCycle, today } from '../services/billing.service.js'
import { membershipReport, revenueShareRows, syncRevenueShares } from '../services/membership.service.js'
import * as stripe from '../integrations/payments/stripe.js'
import * as paypal from '../integrations/payments/paypal.js'

/** Plans, subscriptions, online invoice payments and payment webhooks. */

export const BILLING_ROLES = ['admin', 'finance']
const httpError = (status, message) => Object.assign(new Error(message), { status })
const isId = (value) => z.string().uuid().safeParse(value).success
const parse = (schema, body) => {
  const result = schema.safeParse(body || {})
  if (!result.success) throw httpError(400, result.error.issues[0]?.message || 'Invalid data.')
  return result.data
}
const appUrl = () => config.frontendOrigin.split(',')[0].trim().replace(/\/$/, '')
const requireBilling = (req) => { if (!BILLING_ROLES.includes(req.user.role)) throw httpError(403, 'Only Finance and administrators can manage billing.') }

export function providers(_req, res) {
  return res.json({ data: { stripe: stripe.stripeConfigured(), paypal: paypal.paypalConfigured() } })
}

// ----- Plans -----

const planFields = {
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_-]+$/i, 'Code may only use letters, numbers, dash and underscore.'),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).nullable().optional(),
  billing_interval: z.enum(['MONTH', 'YEAR', 'YEARS_2', 'YEARS_3']),
  amount_eur: z.coerce.number().nonnegative().max(1e9),
  tax_rate: z.coerce.number().min(0).max(100),
  active: z.boolean(),
  // MEMBERSHIP plans are offered to companies on the public registration form.
  category: z.enum(['SERVICE', 'MEMBERSHIP']),
}
const planCreate = z.object({
  ...planFields, tax_rate: planFields.tax_rate.default(21), active: planFields.active.default(true), category: planFields.category.default('SERVICE'),
})
const planUpdate = z.object({ name: planFields.name, description: planFields.description, active: planFields.active }).partial()

export async function listPlans(req, res) {
  requireBilling(req)
  const { rows } = await query(
    `SELECT p.*, (SELECT count(*)::int FROM billing_subscriptions s WHERE s.plan_id = p.plan_id AND s.status <> 'CANCELED') AS live_subscriptions
     FROM billing_plans p ORDER BY p.active DESC, p.name`,
  )
  return res.json({ data: rows })
}

export async function createPlan(req, res) {
  requireBilling(req)
  const d = parse(planCreate, req.body)
  const { rows } = await query(
    `INSERT INTO billing_plans (code, name, description, billing_interval, amount_eur, tax_rate, active, created_by, category)
     VALUES (UPPER($1), $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [d.code, d.name, d.description ?? null, d.billing_interval, d.amount_eur, d.tax_rate, d.active, req.user.sub, d.category],
  ).catch((error) => { if (error.code === '23505') throw httpError(409, 'A plan with this code already exists.'); throw error })
  await writeAudit(req.user.sub, 'BILLING_PLAN_CREATED', 'billing_plans', rows[0].plan_id, { code: rows[0].code })
  return res.status(201).json({ data: rows[0] })
}

/** Price and interval cannot change once created, so existing subscriptions keep what was agreed. */
export async function updatePlan(req, res) {
  requireBilling(req)
  if (!isId(req.params.id)) throw httpError(400, 'Invalid id.')
  const d = parse(planUpdate, req.body)
  const keys = Object.keys(d)
  if (!keys.length) throw httpError(400, 'Nothing to update.')
  const { rows } = await query(
    `UPDATE billing_plans SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = now() WHERE plan_id = $1 RETURNING *`,
    [req.params.id, ...keys.map((key) => d[key])],
  )
  if (!rows[0]) throw httpError(404, 'Plan not found.')
  await writeAudit(req.user.sub, 'BILLING_PLAN_UPDATED', 'billing_plans', rows[0].plan_id, { fields: keys })
  return res.json({ data: rows[0] })
}

// ----- Subscriptions -----

const SUB_SELECT = `
  SELECT s.*, s.current_period_start::text AS current_period_start, s.current_period_end::text AS current_period_end,
         o.legal_name AS organization, p.code AS plan_code, p.name AS plan_name, p.billing_interval, p.amount_eur, p.tax_rate
  FROM billing_subscriptions s JOIN organizations o ON o.org_id = s.org_id JOIN billing_plans p ON p.plan_id = s.plan_id
`

export async function listSubscriptions(req, res) {
  requireBilling(req)
  const { rows } = await query(`${SUB_SELECT} ORDER BY s.status = 'CANCELED', o.legal_name LIMIT 1000`)
  return res.json({ data: rows })
}

const subscriptionBody = z.object({
  org_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid start date.').optional(),
})

/** Starts a subscription and issues the first period's invoice straight away. */
export async function createSubscription(req, res) {
  requireBilling(req)
  const d = parse(subscriptionBody, req.body)
  const start = d.start_date || today()
  if (Number.isNaN(Date.parse(start)) || start < today()) throw httpError(400, 'The start date cannot be in the past.')
  const created = await withTransaction(async (client) => {
    const plan = (await client.query('SELECT * FROM billing_plans WHERE plan_id = $1 AND active', [d.plan_id])).rows[0]
    if (!plan) throw httpError(404, 'Plan not found or inactive.')
    const org = (await client.query('SELECT org_type, verification_status, billing_address FROM organizations WHERE org_id = $1', [d.org_id])).rows[0]
    if (!org || ['PARENT', 'BUSINESS_UNIT'].includes(org.org_type)) throw httpError(404, 'Customer not found.')
    if (org.verification_status !== 'VERIFIED') throw httpError(409, 'The customer must pass KYC/KYB verification first.')
    if (!org.billing_address?.trim()) throw httpError(409, 'Add the customer billing address before invoicing.')
    const end = addInterval(start, plan.billing_interval)
    const { rows } = await client.query(
      `INSERT INTO billing_subscriptions (org_id, plan_id, current_period_start, current_period_end, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING subscription_id, org_id`,
      [d.org_id, d.plan_id, start, end, req.user.sub],
    ).catch((error) => { if (error.code === '23505') throw httpError(409, 'This customer already has this plan.'); throw error })
    const invoice = await invoicePeriod(client, rows[0], plan, start, req.user.sub)
    return { subscription_id: rows[0].subscription_id, invoice_number: invoice?.invoice_number }
  })
  await writeAudit(req.user.sub, 'BILLING_SUBSCRIPTION_CREATED', 'subscriptions', created.subscription_id, { invoice: created.invoice_number })
  return res.status(201).json({ data: created })
}

export async function cancelSubscription(req, res) {
  requireBilling(req)
  if (!isId(req.params.id)) throw httpError(400, 'Invalid id.')
  const immediately = req.body?.immediately === true
  const { rows } = await query(
    immediately
      ? `UPDATE billing_subscriptions SET status = 'CANCELED', canceled_at = now(), updated_at = now() WHERE subscription_id = $1 AND status <> 'CANCELED' RETURNING subscription_id`
      : `UPDATE billing_subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE subscription_id = $1 AND status <> 'CANCELED' RETURNING subscription_id`,
    [req.params.id],
  )
  if (!rows[0]) throw httpError(404, 'Subscription not found.')
  await writeAudit(req.user.sub, 'BILLING_SUBSCRIPTION_CANCELED', 'subscriptions', req.params.id, { immediately })
  return res.json({ data: { subscription_id: req.params.id, immediately } })
}

export async function metrics(req, res) {
  requireBilling(req)
  return res.json({ data: await recurringRevenue() })
}

export async function listPayments(req, res) {
  requireBilling(req)
  const { rows } = await query(
    `SELECT p.payment_id, p.provider, p.provider_ref, p.status, p.amount_eur, p.created_at, p.completed_at,
            i.invoice_number, o.legal_name AS organization
     FROM payments p JOIN zx_invoices i ON i.invoice_id = p.invoice_id LEFT JOIN organizations o ON o.org_id = i.customer_org_id
     ORDER BY p.created_at DESC LIMIT 500`,
  )
  return res.json({ data: rows })
}

// ----- Memberships and the partners' revenue split -----

export async function membershipOverview(req, res) {
  requireBilling(req)
  return res.json({ data: await membershipReport() })
}

const csvCell = (value) => {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '')
  // Leading = + - @ would run as a formula in Excel.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text
  return /[",\n;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** Every partner share, for the monthly settlement between Grupo Global and its partner. */
export async function membershipSharesCsv(req, res) {
  requireBilling(req)
  const rows = await revenueShareRows()
  const header = ['booked_at', 'invoice_number', 'member', 'kind', 'party', 'share_pct', 'invoice_net_eur', 'share_eur']
  const lines = rows.map((row) => [row.booked_at, row.invoice_number, row.legal_name, row.kind, row.party, row.share_pct, row.net_eur, row.amount_eur].map(csvCell).join(','))
  await writeAudit(req.user.sub, 'MEMBERSHIP_SHARES_EXPORTED', 'membership_revenue_shares', null, { rows: rows.length })
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="membership-revenue-shares.csv"')
  return res.send(`${String.fromCharCode(0xfeff)}${[header.join(','), ...lines].join('\r\n')}\r\n`)
}

export async function runCycle(req, res) {
  requireBilling(req)
  const summary = await runBillingCycle()
  await writeAudit(req.user.sub, 'BILLING_CYCLE_RUN', 'subscriptions', null, summary)
  return res.json({ data: summary })
}

// ----- Customer side -----

const payable = `i.status = 'ISSUED' AND i.kind = 'STANDARD' AND NOT EXISTS (SELECT 1 FROM zx_invoices c WHERE c.corrects_invoice_id = i.invoice_id)`

export async function myBilling(req, res) {
  if (!isExternal(req.user.role) || !req.user.org_id) throw httpError(403, 'Only customer accounts have billing here.')
  const [subs, invoices] = await Promise.all([
    query(`SELECT s.subscription_id, s.status, s.current_period_start::text AS current_period_start, s.current_period_end::text AS current_period_end,
                  s.cancel_at_period_end, p.name AS plan_name, p.billing_interval, p.amount_eur, p.tax_rate, p.category
           FROM billing_subscriptions s JOIN billing_plans p ON p.plan_id = s.plan_id WHERE s.org_id = $1 ORDER BY s.created_at DESC`, [req.user.org_id]),
    query(`SELECT i.invoice_id, i.invoice_number, i.kind, i.status, i.payment_method, i.total_eur, i.due_date::text AS due_date, i.created_at, i.paid_at,
                  (${payable}) AS payable
           FROM zx_invoices i WHERE i.customer_org_id = $1 ORDER BY i.created_at DESC LIMIT 200`, [req.user.org_id]),
  ])
  return res.json({ data: { subscriptions: subs.rows, invoices: invoices.rows, providers: { stripe: stripe.stripeConfigured(), paypal: paypal.paypalConfigured() } } })
}

export async function startCheckout(req, res) {
  if (!isExternal(req.user.role) || !req.user.org_id) throw httpError(403, 'Only the customer can pay this invoice.')
  if (!isId(req.params.id)) throw httpError(400, 'Invalid id.')
  const provider = String(req.body?.provider || '').toUpperCase()
  if (provider === 'STRIPE' && !stripe.stripeConfigured()) throw httpError(503, 'Card payments are not available yet.')
  if (provider === 'PAYPAL' && !paypal.paypalConfigured()) throw httpError(503, 'PayPal is not available yet.')
  if (!['STRIPE', 'PAYPAL'].includes(provider)) throw httpError(400, 'Choose a payment method.')

  const { rows } = await query(`SELECT i.* FROM zx_invoices i WHERE i.invoice_id = $1 AND i.customer_org_id = $2 AND ${payable}`, [req.params.id, req.user.org_id])
  const invoice = rows[0]
  if (!invoice) throw httpError(404, 'This invoice cannot be paid online.')
  if (!(Number(invoice.total_eur) > 0)) throw httpError(409, 'This invoice has nothing to pay.')

  const back = `${appUrl()}/extranet/billing`
  const key = randomUUID()
  const session = provider === 'STRIPE'
    ? await stripe.createCheckoutSession({ invoice, successUrl: `${back}?payment=stripe`, cancelUrl: `${back}?payment=cancelled`, idempotencyKey: key })
    : await paypal.createOrder({ invoice, returnUrl: `${back}?payment=paypal`, cancelUrl: `${back}?payment=cancelled`, requestId: key })
  await query(
    `INSERT INTO payments (invoice_id, provider, provider_ref, status, amount_eur, created_by) VALUES ($1, $2, $3, 'CREATED', $4, $5)`,
    [invoice.invoice_id, provider, session.id, invoice.total_eur, req.user.sub],
  )
  await writeAudit(req.user.sub, 'BILLING_CHECKOUT_STARTED', 'zx_invoices', invoice.invoice_id, { provider })
  return res.json({ data: { url: session.url } })
}

/** The customer returns from PayPal; the server captures the order itself and checks the amount. */
export async function capturePaypal(req, res) {
  if (!isExternal(req.user.role) || !req.user.org_id) throw httpError(403, 'Only the customer can pay this invoice.')
  if (!paypal.paypalConfigured()) throw httpError(503, 'PayPal is not available yet.')
  const orderId = String(req.body?.order_id || '')
  if (!/^[A-Z0-9-]{5,64}$/i.test(orderId)) throw httpError(400, 'Invalid PayPal order.')
  const { rows } = await query(
    `SELECT p.invoice_id FROM payments p JOIN zx_invoices i ON i.invoice_id = p.invoice_id
     WHERE p.provider = 'PAYPAL' AND p.provider_ref = $1 AND i.customer_org_id = $2`,
    [orderId, req.user.org_id],
  )
  if (!rows[0]) throw httpError(404, 'Payment not found.')
  const result = await settlePaypalOrder(orderId)
  if (result.outcome !== 'PAID' && result.outcome !== 'DUPLICATE') throw httpError(409, 'The PayPal payment was not completed.')
  return res.json({ data: { status: 'PAID' } })
}

async function settlePaypalOrder(orderId) {
  const capture = await paypal.captureOrder(orderId, `capture-${orderId}`)
  if (!capture.completed || !capture.invoiceId) return { outcome: 'NOT_COMPLETED' }
  const known = await query(`SELECT invoice_id FROM payments WHERE provider = 'PAYPAL' AND provider_ref = $1`, [orderId])
  if (known.rows[0]?.invoice_id !== capture.invoiceId) return { outcome: 'UNKNOWN_INVOICE' }
  const result = await withTransaction((client) => applyPayment(client, {
    invoiceId: capture.invoiceId, provider: 'PAYPAL', providerRef: orderId, amount: capture.amount, currency: capture.currency,
  }))
  await afterPayment(result, 'PAYPAL')
  syncRevenueShares().catch(() => {}) // book the partners' split as soon as a membership is paid
  return result
}

// ----- Webhooks (public, signature-checked) -----

async function once(provider, eventId, eventType, work) {
  return withTransaction(async (client) => {
    const fresh = await client.query(
      'INSERT INTO payment_events (provider, event_id, event_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING event_row_id',
      [provider, String(eventId).slice(0, 255), String(eventType).slice(0, 120)],
    )
    if (!fresh.rowCount) return null
    return work(client)
  })
}

/** Card-reader payments: succeeded marks the invoice paid (same checks as online payments); failed is recorded. */
async function terminalWebhook(event, intent, res) {
  const invoiceId = intent.metadata?.invoice_id
  if (!isId(invoiceId || '')) return res.json({ received: true })
  const result = await once('STRIPE', event.id, event.type, async (client) => {
    const known = await client.query(`SELECT invoice_id FROM payments WHERE provider = 'STRIPE' AND provider_ref = $1`, [String(intent.id)])
    if (known.rows[0]?.invoice_id !== invoiceId) return { outcome: 'UNKNOWN_INVOICE' }
    if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
      await client.query(`UPDATE payments SET status = 'FAILED', completed_at = now() WHERE provider = 'STRIPE' AND provider_ref = $1 AND status = 'CREATED'`, [String(intent.id)])
      return null
    }
    if (event.type !== 'payment_intent.succeeded') return null
    return applyPayment(client, { invoiceId, provider: 'STRIPE', providerRef: String(intent.id), amount: Number(intent.amount_received) / 100, currency: intent.currency })
  })
  await afterPayment(result, 'STRIPE_TERMINAL')
  syncRevenueShares().catch(() => {}) // book the partners' split as soon as a membership is paid
  return res.json({ received: true })
}

export async function stripeWebhook(req, res) {
  if (!stripe.stripeConfigured()) return res.status(503).json({ message: 'Not configured.' })
  const event = stripe.verifyWebhook(req.rawBody, req.get('stripe-signature'))
  if (!event?.id || !event.type) return res.status(400).json({ message: 'Invalid signature.' })
  const session = event.data?.object || {}
  if (event.type.startsWith('payment_intent.') && session.metadata?.channel === 'terminal') return terminalWebhook(event, session, res)
  const paid = (event.type === 'checkout.session.completed' && session.payment_status === 'paid') || event.type === 'checkout.session.async_payment_succeeded'
  const result = await once('STRIPE', event.id, event.type, async (client) => {
    if (!paid || !isId(session.metadata?.invoice_id || '')) return null
    const known = await client.query(`SELECT invoice_id FROM payments WHERE provider = 'STRIPE' AND provider_ref = $1`, [String(session.id)])
    if (known.rows[0]?.invoice_id !== session.metadata.invoice_id) return { outcome: 'UNKNOWN_INVOICE' }
    return applyPayment(client, {
      invoiceId: session.metadata.invoice_id, provider: 'STRIPE', providerRef: String(session.id),
      amount: Number(session.amount_total) / 100, currency: session.currency,
    })
  })
  await afterPayment(result, 'STRIPE')
  syncRevenueShares().catch(() => {}) // book the partners' split as soon as a membership is paid
  return res.json({ received: true })
}

export async function paypalWebhook(req, res) {
  if (!paypal.paypalConfigured()) return res.status(503).json({ message: 'Not configured.' })
  const event = req.body
  if (!event?.id || !event.event_type || !(await paypal.verifyWebhook(req.headers, event))) return res.status(400).json({ message: 'Invalid signature.' })
  const resource = event.resource || {}
  const orderId = event.event_type === 'CHECKOUT.ORDER.APPROVED' ? resource.id : resource.supplementary_data?.related_ids?.order_id
  const fresh = await query(
    'INSERT INTO payment_events (provider, event_id, event_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING event_row_id',
    ['PAYPAL', String(event.id).slice(0, 255), String(event.event_type).slice(0, 120)],
  )
  if (fresh.rowCount && orderId && ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED'].includes(event.event_type)) {
    try {
      await settlePaypalOrder(String(orderId))
    } catch {
      // Let PayPal retry: forget the event so the next delivery is processed.
      await query(`DELETE FROM payment_events WHERE provider = 'PAYPAL' AND event_id = $1`, [String(event.id).slice(0, 255)])
      return res.status(502).json({ message: 'Try again.' })
    }
  }
  return res.json({ received: true })
}
