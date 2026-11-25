import { query } from '../config/database.js'
import { notifyRoles } from './notification.service.js'

/**
 * Predictive retention (Technical Spec §2.2): renewal risk for every paying member organisation,
 * from engagement frequency, portal activity, course completions, event sign-ups and payment
 * behaviour.
 *
 * Model: a logistic score with fixed, documented weights ("weighted-v1"). There is no renewal
 * history yet to train a supervised model on; every run stores its input features, so once real
 * renewals and cancellations exist the same features can train one and replace these weights.
 */

export const MODEL_VERSION = 'weighted-v1'

// Positive weights raise the risk, negative weights lower it. Inputs are scaled to about 0..1.
const WEIGHTS = {
  bias: -1.2,
  cancelScheduled: 4.0, // the customer already asked to stop at the end of the period
  pastDue: 1.8, // subscription is past due
  overdueInvoices: 1.4, // share of open invoices older than 30 days (capped at 3)
  noActiveUsers: 1.5, // nobody signed in during the last 30 days
  loginDrop: 1.2, // fewer sign-ins than the 30 days before (0 = same or more, 1 = none at all)
  lowLogins: 0.8, // fewer than 4 sign-ins per active user in 30 days
  renewalSoon: 0.4, // renewal within 30 days (risk is most urgent then)
  courseCompletions: -0.6, // completed courses in the last 90 days (capped at 3)
  eventSignups: -0.6, // event registrations in the last 90 days (capped at 3)
}

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const logistic = (z) => 1 / (1 + Math.exp(-z))
export const levelOf = (score) => (score >= 65 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW')

/** Pure scoring step, so it can be tested and later swapped for a trained model. */
export function scoreFeatures(f) {
  const x = {
    cancelScheduled: f.cancel_at_period_end ? 1 : 0,
    pastDue: f.status === 'PAST_DUE' ? 1 : 0,
    overdueInvoices: clamp01(f.overdue_invoices / 3),
    noActiveUsers: f.active_users_30d === 0 ? 1 : 0,
    loginDrop: f.logins_prev_30d > 0 ? clamp01(1 - f.logins_30d / f.logins_prev_30d) : 0,
    lowLogins: f.active_users_30d > 0 && f.logins_30d / f.active_users_30d < 4 ? 1 : 0,
    renewalSoon: f.days_to_renewal !== null && f.days_to_renewal <= 30 ? 1 : 0,
    courseCompletions: clamp01(f.course_completions_90d / 3),
    eventSignups: clamp01(f.event_signups_90d / 3),
  }
  let z = WEIGHTS.bias
  const contributions = []
  for (const [key, value] of Object.entries(x)) {
    const part = WEIGHTS[key] * value
    z += part
    if (part !== 0) contributions.push({ key, part })
  }
  const score = Math.round(logistic(z) * 100)
  const reasons = contributions.sort((a, b) => Math.abs(b.part) - Math.abs(a.part)).slice(0, 4).map(({ key, part }) => ({
    code: key, direction: part > 0 ? 'up' : 'down', ...(([template, params]) => ({ template, params, text: fill(template, params) }))(REASONS[key](f)),
  }))
  return { score, level: levelOf(score), reasons }
}

// Each reason: English template + values, so screens can show it in every language.
const REASONS = {
  cancelScheduled: () => ['Cancellation scheduled at the end of the period', {}],
  pastDue: () => ['Subscription payment is past due', {}],
  overdueInvoices: (f) => ['{count} invoice(s) unpaid for more than 30 days', { count: f.overdue_invoices }],
  noActiveUsers: () => ['Nobody from the organisation signed in during the last 30 days', {}],
  loginDrop: (f) => ['Sign-ins fell from {before} to {now} compared with the previous 30 days', { before: f.logins_prev_30d, now: f.logins_30d }],
  lowLogins: () => ['Few sign-ins per active user', {}],
  renewalSoon: (f) => ['Renewal in {count} day(s)', { count: f.days_to_renewal }],
  courseCompletions: (f) => ['{count} course(s) completed in 90 days', { count: f.course_completions_90d }],
  eventSignups: (f) => ['{count} event registration(s) in 90 days', { count: f.event_signups_90d }],
}
const fill = (template, params) => template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match))

/** Input features for every organisation with a live subscription. */
async function memberFeatures() {
  const { rows } = await query(
    `SELECT s.subscription_id, s.org_id, o.legal_name, s.status, s.cancel_at_period_end,
            (s.current_period_end - CURRENT_DATE)::int AS days_to_renewal,
            (SELECT COUNT(*)::int FROM audit_logs a JOIN users u ON u.id = a.user_id
              WHERE u.org_id = s.org_id AND a.action = 'LOGIN_SUCCESS' AND a.created_at >= now() - interval '30 days') AS logins_30d,
            (SELECT COUNT(*)::int FROM audit_logs a JOIN users u ON u.id = a.user_id
              WHERE u.org_id = s.org_id AND a.action = 'LOGIN_SUCCESS'
                AND a.created_at >= now() - interval '60 days' AND a.created_at < now() - interval '30 days') AS logins_prev_30d,
            (SELECT COUNT(DISTINCT a.user_id)::int FROM audit_logs a JOIN users u ON u.id = a.user_id
              WHERE u.org_id = s.org_id AND a.action = 'LOGIN_SUCCESS' AND a.created_at >= now() - interval '30 days') AS active_users_30d,
            (SELECT COUNT(*)::int FROM course_enrollments e JOIN users u ON u.id = e.user_id
              WHERE u.org_id = s.org_id AND e.status = 'COMPLETED' AND e.completed_at >= now() - interval '90 days') AS course_completions_90d,
            (SELECT COUNT(*)::int FROM zx_records r JOIN users u ON u.id = r.created_by
              WHERE u.org_id = s.org_id AND r.module = 'events' AND r.entity = 'registrations' AND r.created_at >= now() - interval '90 days') AS event_signups_90d,
            (SELECT COUNT(*)::int FROM zx_invoices i
              WHERE i.customer_org_id = s.org_id AND i.status = 'ISSUED' AND i.kind = 'STANDARD' AND i.created_at < now() - interval '30 days') AS overdue_invoices
     FROM billing_subscriptions s JOIN organizations o ON o.org_id = s.org_id
     WHERE s.status IN ('ACTIVE', 'PAST_DUE')`,
  )
  return rows
}

/** Scores every member, stores the run and alerts Finance about members that became high-risk. */
export async function computeRiskScores() {
  const members = await memberFeatures()
  const previous = await query(
    `SELECT DISTINCT ON (org_id) org_id, level FROM member_risk_scores ORDER BY org_id, computed_at DESC`,
  )
  const before = new Map(previous.rows.map((row) => [row.org_id, row.level]))
  const newlyHigh = []
  for (const member of members) {
    const { subscription_id: subscriptionId, org_id: orgId, legal_name: name, ...features } = member
    const result = scoreFeatures(features)
    await query(
      `INSERT INTO member_risk_scores (org_id, subscription_id, score, level, features, reasons, model_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orgId, subscriptionId, result.score, result.level, JSON.stringify(features), JSON.stringify(result.reasons), MODEL_VERSION],
    )
    if (result.level === 'HIGH' && before.get(orgId) !== 'HIGH') newlyHigh.push(name)
  }
  if (newlyHigh.length) {
    await notifyRoles(['finance', 'admin'], {
      type: 'billing',
      title: `Renewal risk: ${newlyHigh.length} member(s) now high risk`,
      body: newlyHigh.slice(0, 5).join(', '),
      link: '/intranet/billing',
    })
  }
  return { members: members.length, high: newlyHigh.length }
}

/** Latest score per member, highest risk first. */
export async function latestRiskScores() {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT DISTINCT ON (r.org_id) r.org_id, o.legal_name, r.score, r.level, r.reasons, r.features, r.model_version, r.computed_at
       FROM member_risk_scores r JOIN organizations o ON o.org_id = r.org_id
       ORDER BY r.org_id, r.computed_at DESC
     ) latest ORDER BY score DESC, legal_name`,
  )
  return rows
}
