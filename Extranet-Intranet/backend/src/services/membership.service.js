import { z } from 'zod'
import { query } from '../config/database.js'
import { addInterval, invoicePeriod, today } from './billing.service.js'

/**
 * Paid membership (client meeting, 26 Nov 2026): new member companies answer a short survey when they
 * register, choose a 1-, 2- or 3-year plan, and pay the first invoice by Stripe or PayPal once Compliance
 * approves them. Existing direct partners of Grupo Global do not pay. Every paid membership invoice is
 * split between the partners (50/50 unless MEMBERSHIP_REVENUE_SPLIT says otherwise).
 */

/** Survey shown on the registration form. Labels are English keys; the app translates them. */
export const MEMBERSHIP_SURVEY = [
  { key: 'company_size', label: 'Number of employees', type: 'select', required: true, options: ['1-10', '11-50', '51-250', '251-1000', '1000+'] },
  { key: 'annual_revenue', label: 'Annual revenue', type: 'select', required: true, options: ['Under €1M', '€1M-€10M', '€10M-€50M', 'Over €50M', 'Prefer not to say'] },
  { key: 'countries', label: 'Countries where you operate', type: 'text', required: true, max: 300 },
  {
    key: 'interests', label: 'What are you interested in?', type: 'multi', required: true,
    options: ['Business matchmaking', 'Investment opportunities', 'Projects and tenders', 'International expansion', 'Training and events'],
  },
  { key: 'heard_from', label: 'How did you hear about Grupo Global?', type: 'select', required: true, options: ['Grupo Global team', 'Partner referral', 'Event', 'Website', 'LinkedIn', 'Other'] },
  { key: 'referred_by', label: 'Who referred you? (optional)', type: 'text', required: false, max: 200 },
  { key: 'goals', label: 'What do you expect from the membership? (optional)', type: 'textarea', required: false, max: 1000 },
]

/** Turns the survey definition into a validator, so the server accepts only known questions and answers. */
function surveySchema() {
  const shape = {}
  for (const question of MEMBERSHIP_SURVEY) {
    let field
    if (question.type === 'select') field = z.enum(question.options)
    else if (question.type === 'multi') field = z.array(z.enum(question.options)).min(1).max(question.options.length)
    else field = z.string().trim().min(question.required ? 2 : 0).max(question.max || 500)
    shape[question.key] = question.required ? field : field.optional()
  }
  return z.object(shape).strict()
}

/** Returns the cleaned answers, or a readable reason they were refused. */
export function checkSurvey(answers) {
  const result = surveySchema().safeParse(answers || {})
  if (result.success) return { ok: true, answers: result.data }
  const question = MEMBERSHIP_SURVEY.find((item) => item.key === result.error.issues[0]?.path?.[0])
  return { ok: false, message: question ? `Answer the survey question: ${question.label}` : 'Please complete the membership survey.' }
}

/** Partners and their percentage of every paid membership, e.g. "Grupo Global:50,Zeta AI Labs:50". */
export function revenueSplit() {
  const fallback = [{ party: 'Grupo Global', pct: 50 }, { party: 'Zeta AI Labs', pct: 50 }]
  const raw = process.env.MEMBERSHIP_REVENUE_SPLIT
  if (!raw) return fallback
  const parts = raw.split(',').map((item) => {
    const index = item.lastIndexOf(':')
    return { party: item.slice(0, index).trim(), pct: Number(item.slice(index + 1)) }
  })
  const valid = parts.length >= 1 && parts.every((p) => p.party && p.party.length <= 120 && p.pct > 0 && p.pct <= 100)
    && Math.abs(parts.reduce((sum, p) => sum + p.pct, 0) - 100) < 0.001
  return valid ? parts : fallback
}

export async function membershipPlans({ activeOnly = true } = {}) {
  const { rows } = await query(
    `SELECT plan_id, code, name, description, billing_interval, amount_eur, tax_rate, active
     FROM billing_plans WHERE category = 'MEMBERSHIP' ${activeOnly ? 'AND active' : ''} ORDER BY amount_eur`,
  )
  return rows.map((plan) => ({
    ...plan,
    amount_eur: Number(plan.amount_eur),
    tax_rate: Number(plan.tax_rate),
    total_eur: Math.round(Number(plan.amount_eur) * (1 + Number(plan.tax_rate) / 100) * 100) / 100,
  }))
}

/** Starts the membership and issues its first invoice, inside the approval transaction. */
export async function startMembership(client, { orgId, planId, actorId }) {
  const plan = (await client.query(`SELECT * FROM billing_plans WHERE plan_id = $1 AND category = 'MEMBERSHIP' AND active`, [planId])).rows[0]
  if (!plan) return null
  const start = today()
  const { rows } = await client.query(
    `INSERT INTO billing_subscriptions (org_id, plan_id, current_period_start, current_period_end, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING RETURNING subscription_id, org_id`,
    [orgId, planId, start, addInterval(start, plan.billing_interval), actorId],
  )
  if (!rows[0]) return null
  const invoice = await invoicePeriod(client, rows[0], plan, start, actorId)
  return { subscription_id: rows[0].subscription_id, plan_code: plan.code, plan_name: plan.name, invoice_id: invoice?.invoice_id, invoice_number: invoice?.invoice_number, total_eur: invoice?.total_eur }
}

/** Splits an amount in cents so the parts always add up exactly (the last partner gets the rounding). */
function splitCents(cents, split) {
  let given = 0
  return split.map((part, index) => {
    const share = index === split.length - 1 ? cents - given : Math.round((cents * part.pct) / 100)
    given += share
    return share
  })
}

/**
 * Records each partner's share of every paid membership invoice, and a reversal when one is refunded.
 * Safe to run any number of times: rows already recorded are skipped.
 */
export async function syncRevenueShares() {
  const split = revenueSplit()
  const sales = await query(
    `SELECT i.invoice_id, i.customer_org_id, i.net_eur, COALESCE(i.paid_at, i.refunded_at, now()) AS booked_at FROM zx_invoices i
     JOIN billing_subscriptions s ON s.subscription_id = i.subscription_id
     JOIN billing_plans p ON p.plan_id = s.plan_id AND p.category = 'MEMBERSHIP'
     WHERE i.kind = 'STANDARD' AND (i.status = 'PAID' OR i.refunded_at IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM membership_revenue_shares r WHERE r.invoice_id = i.invoice_id AND r.kind = 'SALE')`,
  )
  const refunds = await query(
    `SELECT i.invoice_id, i.customer_org_id, i.net_eur, i.refunded_at AS booked_at FROM zx_invoices i
     WHERE i.refunded_at IS NOT NULL
       AND EXISTS (SELECT 1 FROM membership_revenue_shares r WHERE r.invoice_id = i.invoice_id AND r.kind = 'SALE')
       AND NOT EXISTS (SELECT 1 FROM membership_revenue_shares r WHERE r.invoice_id = i.invoice_id AND r.kind = 'REFUND')`,
  )
  let written = 0
  for (const [rows, kind, sign] of [[sales.rows, 'SALE', 1], [refunds.rows, 'REFUND', -1]]) {
    for (const invoice of rows) {
      const cents = Math.round(Number(invoice.net_eur) * 100)
      const shares = splitCents(cents, split)
      for (const [index, part] of split.entries()) {
        const result = await query(
          `INSERT INTO membership_revenue_shares (invoice_id, org_id, party, kind, share_pct, net_eur, amount_eur, booked_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (invoice_id, party, kind) DO NOTHING`,
          [invoice.invoice_id, invoice.customer_org_id, part.party, kind, part.pct, ((sign * cents) / 100).toFixed(2), ((sign * shares[index]) / 100).toFixed(2), invoice.booked_at],
        )
        written += result.rowCount
      }
    }
  }
  return written
}

/** Members, what each paid, and each partner's share, for the Billing page. */
export async function membershipReport() {
  await syncRevenueShares()
  const members = await query(
    `SELECT o.org_id, o.legal_name, o.country, p.code AS plan_code, p.name AS plan_name, s.status, s.subscription_id,
            s.current_period_start::text AS period_start, s.current_period_end::text AS period_end, s.cancel_at_period_end,
            (SELECT count(*)::int FROM zx_invoices i WHERE i.subscription_id = s.subscription_id AND i.status = 'PAID') AS paid_invoices,
            (SELECT i.invoice_number FROM zx_invoices i WHERE i.subscription_id = s.subscription_id AND i.kind = 'STANDARD' AND i.status = 'ISSUED'
               ORDER BY i.period_start LIMIT 1) AS unpaid_invoice
     FROM billing_subscriptions s
     JOIN billing_plans p ON p.plan_id = s.plan_id AND p.category = 'MEMBERSHIP'
     JOIN organizations o ON o.org_id = s.org_id
     ORDER BY s.status = 'CANCELED', s.created_at DESC LIMIT 2000`,
  )
  const totals = await query(
    `SELECT party,
            COALESCE(sum(amount_eur), 0) AS total_eur,
            COALESCE(sum(amount_eur) FILTER (WHERE booked_at >= date_trunc('year', now())), 0) AS this_year_eur
     FROM membership_revenue_shares GROUP BY party ORDER BY party`,
  )
  const gross = await query(
    `SELECT COALESCE(sum(net_eur) FILTER (WHERE kind = 'SALE'), 0) - COALESCE(sum(-net_eur) FILTER (WHERE kind = 'REFUND'), 0) AS net
     FROM (SELECT DISTINCT ON (invoice_id, kind) invoice_id, kind, net_eur FROM membership_revenue_shares) d`,
  )
  return {
    split: revenueSplit(),
    members: members.rows,
    totals: totals.rows.map((row) => ({ party: row.party, total_eur: Number(row.total_eur), this_year_eur: Number(row.this_year_eur) })),
    net_revenue_eur: Number(gross.rows[0].net),
    active_members: members.rows.filter((row) => row.status !== 'CANCELED').length,
  }
}

/** Every share row, for the CSV export Finance sends to both partners. */
export async function revenueShareRows() {
  await syncRevenueShares()
  const { rows } = await query(
    `SELECT r.booked_at, i.invoice_number, o.legal_name, r.kind, r.party, r.share_pct, r.net_eur, r.amount_eur
     FROM membership_revenue_shares r JOIN zx_invoices i ON i.invoice_id = r.invoice_id LEFT JOIN organizations o ON o.org_id = r.org_id
     ORDER BY r.booked_at, i.invoice_number, r.party`,
  )
  return rows
}
