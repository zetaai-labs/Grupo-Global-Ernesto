import { query } from '../config/database.js'
import { auditStore } from '../integrations/aws/s3Storage.js'
import { writeAudit } from '../services/audit.js'
import { anchorAuditChain, verifyAuditChain } from '../services/auditIntegrity.service.js'

/**
 * Areas of activity the administrator can filter by. Each audit action starts with one of these words
 * (LOGIN_SUCCESS, BILLING_PAYMENT_RECEIVED, PRIVACY_ACCEPTED…), so new actions fall into place by themselves.
 */
export const AUDIT_AREAS = {
  sign_in: ['LOGIN', 'LOGOUT', 'SSO', 'MFA', 'PASSWORD', 'WEBAUTHN', 'SESSION'],
  users: ['USER', 'PROVISIONING', 'PROFILE', 'ROLE', 'ONBOARDING'],
  privacy: ['PRIVACY', 'GDPR', 'OWN', 'CONSENT'],
  compliance: ['KYC', 'ORGANIZATION', 'NDA', 'ETHICS', 'SANCTION', 'AML', 'DIRECTORY'],
  money: ['BILLING', 'MEMBERSHIP', 'PAYMENT', 'INVOICE', 'POS'],
  business: ['ZX', 'CRM', 'PROJECT', 'COURSE', 'CALENDAR', 'ATTENDANCE', 'EVENT', 'COMMUNITY', 'VIDEO', 'CHAT'],
  documents: ['FILE', 'FOLDER', 'ITEM', 'SHARED', 'METALINK', 'EMAIL', 'DATA', 'RECEIVED', 'WORKFLOW'],
  vault: ['VAULT'],
  ai: ['AI', 'ASSISTANT', 'TRANSLATION'],
  system: ['AUDIT', 'WEBHOOK', 'BACKUP', 'PUSH', 'SUPPORT', 'INTEGRATION', 'COURSE_PACKAGE', 'FLEET'],
}
const PROBLEM_PATTERN = '(FAIL|REJECT|DENIED|BLOCKED|INVALID|MISMATCH|DUPLICATE|LOCKED|SUSPEND|WITHDRAWN|EXPELLED)'
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(value))

/** Builds the WHERE clause shared by the list and the CSV export. */
function auditFilter(q) {
  const where = []
  const params = []
  const add = (sql, value) => { params.push(value); where.push(sql.replaceAll('?', `$${params.length}`)) }
  const text = String(q.q || '').trim().slice(0, 100)
  if (text) {
    add(`(a.action ILIKE ? OR a.entity ILIKE ? OR a.entity_id ILIKE ? OR u.name ILIKE ? OR u.email ILIKE ?)`, `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  }
  if (AUDIT_AREAS[q.area]) add(`split_part(a.action, '_', 1) = ANY(?::text[])`, AUDIT_AREAS[q.area])
  if (q.only === 'problems') add(`a.action ~ ?`, PROBLEM_PATTERN)
  if (/^\d+$/.test(String(q.user_id || ''))) add('a.user_id = ?', Number(q.user_id))
  if (isDate(q.from)) add(`a.created_at >= (?::date AT TIME ZONE 'Europe/Madrid')`, q.from)
  if (isDate(q.to)) add(`a.created_at < ((?::date + 1) AT TIME ZONE 'Europe/Madrid')`, q.to)
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

/** Newest first, 100 per page; `before` (an id) loads the next page. */
export async function listAuditLogs(req, res) {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const { where, params } = auditFilter(req.query)
  const before = /^\d+$/.test(String(req.query.before || '')) ? Number(req.query.before) : null
  const pageWhere = before ? `${where ? `${where} AND` : 'WHERE'} a.id < $${params.length + 1}` : where
  const { rows } = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.created_at, a.user_id,
            u.name AS user_name, u.email AS user_email, r.name AS user_role
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     ${pageWhere}
     ORDER BY a.id DESC
     LIMIT $${params.length + (before ? 2 : 1)}`,
    [...params, ...(before ? [before] : []), limit + 1],
  )
  return res.json({ data: rows.slice(0, limit), has_more: rows.length > limit })
}

/** Headline numbers for the administrator: today's activity and what needs a look. */
export async function auditSummary(_req, res) {
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
       count(DISTINCT user_id) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS active_users_today,
       count(*) FILTER (WHERE created_at >= now() - interval '24 hours' AND action LIKE 'LOGIN%' AND action ~ '(FAIL|LOCKED|INVALID)')::int AS failed_sign_ins_24h,
       count(*) FILTER (WHERE created_at >= now() - interval '7 days' AND action ~ $1)::int AS problems_7d,
       count(*)::int AS total
     FROM audit_logs`,
    [PROBLEM_PATTERN],
  )
  return res.json({ data: { ...rows[0], areas: Object.keys(AUDIT_AREAS) } })
}

const csvCell = (value) => {
  const text = value instanceof Date ? value.toISOString() : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** The filtered log as CSV (up to 50,000 rows). The export itself is recorded. */
export async function exportAuditLogs(req, res) {
  const { where, params } = auditFilter(req.query)
  const { rows } = await query(
    `SELECT a.id, a.created_at, a.action, u.name AS user_name, u.email AS user_email, a.entity, a.entity_id, a.details
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${where} ORDER BY a.id DESC LIMIT 50000`,
    params,
  )
  await writeAudit(req.user.sub, 'AUDIT_EXPORTED', 'audit_logs', null, { rows: rows.length, filters: { q: req.query.q, area: req.query.area, from: req.query.from, to: req.query.to } })
  const header = ['id', 'when', 'action', 'user', 'email', 'entity', 'entity_id', 'details']
  const lines = rows.map((row) => [row.id, row.created_at, row.action, row.user_name, row.user_email, row.entity, row.entity_id, row.details].map(csvCell).join(','))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"')
  return res.send(`${String.fromCharCode(0xfeff)}${[header.join(','), ...lines].join('\r\n')}\r\n`)
}

export async function auditIntegrity(req, res) {
  const configured = auditStore.configured()
  const result = await verifyAuditChain({ store: configured ? auditStore : null })
  await writeAudit(req.user.sub, 'AUDIT_CHAIN_VERIFIED', 'audit_logs', null, { valid: result.valid })
  return res.json({
    data: {
      ...result,
      immutable_storage: {
        configured,
        mode: configured ? auditStore.mode() : null,
        retention_days: configured ? auditStore.retentionDays() : null,
      },
    },
  })
}

const ANCHOR_MESSAGES = {
  NOT_CONFIGURED: [409, 'Immutable storage is not configured.'],
  ALREADY_RUNNING: [409, 'A copy is already in progress.'],
  CHAIN_INVALID: [409, 'The audit chain failed verification, so it was not copied.'],
  OBJECT_LOCK_DISABLED: [409, 'The audit bucket does not have Object Lock enabled.'],
  OBJECT_CONFLICT: [409, 'A different locked copy already exists for this range.'],
}

export async function createAuditAnchor(req, res) {
  const result = await anchorAuditChain()
  if (!result.anchored && result.reason !== 'UP_TO_DATE') {
    const [status, message] = ANCHOR_MESSAGES[result.reason]
    return res.status(status).json({ message })
  }
  if (result.anchored) await writeAudit(req.user.sub, 'AUDIT_CHAIN_ANCHORED', 'audit_anchors', null, { to_seq: result.to_seq })
  return res.json({ data: result, message: result.anchored ? 'Audit log copied to immutable storage.' : 'Immutable storage is already up to date.' })
}
