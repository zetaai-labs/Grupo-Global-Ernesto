import { query } from '../config/database.js'
import { STAFF_ROLES } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { suggest } from '../services/matchmaking.service.js'
import { computeRiskScores, latestRiskScores, MODEL_VERSION } from '../services/churnRisk.service.js'
import { BILLING_ROLES } from './billing.controller.js'

/** AI engine endpoints: B2B matchmaking suggestions and member renewal risk. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const fail = (status, message) => Object.assign(new Error(message), { status })
const EVENT_MANAGERS = ['admin', 'manager']

/**
 * People to meet. With ?event_id= : other confirmed participants of that event (the user must be
 * registered, or be an event manager). Without it: colleagues across the group (staff only).
 */
export async function matchSuggestions(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20)
  const raw = req.params.id || req.query.event_id
  const eventId = raw ? String(raw) : null
  let candidates
  if (eventId) {
    if (!UUID.test(eventId)) throw fail(400, 'Invalid id.')
    const regs = await query(
      `SELECT DISTINCT created_by AS id FROM zx_records
       WHERE module = 'events' AND entity = 'registrations' AND data->>'event' = $1 AND status IN ('CONFIRMED', 'COMPLETED')`,
      [eventId],
    )
    candidates = regs.rows.map((row) => row.id).filter(Boolean)
    if (!EVENT_MANAGERS.includes(req.user.role) && !candidates.includes(req.user.sub)) throw fail(403, 'Only confirmed participants can use B2B meetings.')
  } else {
    if (!STAFF_ROLES.includes(req.user.role)) throw fail(403, 'Staff only.')
    const staff = await query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.status = 'active' AND r.name = ANY($1::text[]) LIMIT 2000`,
      [STAFF_ROLES],
    )
    candidates = staff.rows.map((row) => row.id)
  }
  const data = await suggest(req.user.sub, candidates, limit)
  return res.json({ data })
}

export async function listRisk(req, res) {
  if (!BILLING_ROLES.includes(req.user.role)) throw fail(403, 'Only Finance and administrators can manage billing.')
  return res.json({ data: await latestRiskScores(), meta: { model_version: MODEL_VERSION } })
}

export async function runRisk(req, res) {
  if (!BILLING_ROLES.includes(req.user.role)) throw fail(403, 'Only Finance and administrators can manage billing.')
  const result = await computeRiskScores()
  await writeAudit(req.user.sub, 'CHURN_RISK_RUN', 'member_risk_scores', null, result)
  return res.json({ data: result, message: 'Renewal risk updated.' })
}
