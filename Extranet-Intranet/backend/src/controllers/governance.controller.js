import { createHash } from 'node:crypto'
import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { isExternal } from '../config/roles.js'

/** Governance & Code of Ethics (Schema Document §4.6 and §5.2). */

export const ETHICS_TIERS = ['TIER_1_BASIC', 'TIER_2_EXECUTIVE', 'TIER_3_CRITICAL_VAULT']
export const CODE_VERSION = 'GG-ETHICS-2026.1'
const GOVERNANCE_ROLES = ['admin', 'hr']

const fail = (res, status, message) => res.status(status).json({ message })
const uuid = z.string().uuid()
const isOfficer = (user) => GOVERNANCE_ROLES.includes(user.role)

/** Tier a user must sign, based on role. */
export function requiredTier(role) {
  if (['admin', 'investor'].includes(role)) return 'TIER_3_CRITICAL_VAULT'
  if (['tech_admin', 'hr', 'finance', 'manager'].includes(role)) return 'TIER_2_EXECUTIVE'
  return 'TIER_1_BASIC'
}

/** Adds N business days (Mon–Fri) to a date; returns YYYY-MM-DD. */
export function addBusinessDays(start, days) {
  const date = new Date(start)
  let remaining = days
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    const day = date.getUTCDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }
  return date.toISOString().slice(0, 10)
}

export async function myCompliance(req, res) {
  const [records, sanctions] = await Promise.all([
    query('SELECT record_id, ethics_code_tier, employment_contract_ref, audit_timestamp FROM governance_compliance WHERE user_id = $1 ORDER BY audit_timestamp DESC', [req.user.sub]),
    query(`SELECT s.sanction_id, s.tier, s.reason, s.status, s.remediation_due, s.suspended_until, s.issued_at,
                  s.required_course_id, c.title AS required_course
           FROM governance_sanctions s LEFT JOIN community_events_courses c ON c.item_id = s.required_course_id
           WHERE s.user_id = $1 ORDER BY s.issued_at DESC`, [req.user.sub]),
  ])
  const tier = requiredTier(req.user.role)
  return res.json({
    data: {
      code_version: CODE_VERSION,
      required_tier: tier,
      acknowledged: records.rows.some((record) => record.ethics_code_tier === tier),
      records: records.rows,
      sanctions: sanctions.rows,
    },
  })
}

const ackSchema = z.object({
  accept: z.literal(true),
  employment_contract_ref: z.string().trim().min(3).max(128).optional(),
})

/** Records the user's signature of the Code of Ethics at the tier required for their role. */
export async function acknowledgeCode(req, res) {
  const parsed = ackSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, 'You must accept the Code of Ethics.')
  const tier = requiredTier(req.user.role)
  const timestamp = new Date().toISOString()
  const reference = parsed.data.employment_contract_ref
    || createHash('sha256').update(`${CODE_VERSION}|${tier}|${req.user.uuid}|${timestamp}`).digest('hex')
  const { rows } = await query(
    `INSERT INTO governance_compliance (user_id, ethics_code_tier, employment_contract_ref, audit_timestamp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, ethics_code_tier) DO NOTHING
     RETURNING record_id, ethics_code_tier, employment_contract_ref, audit_timestamp`,
    [req.user.sub, tier, reference, timestamp],
  )
  if (!rows[0]) return res.json({ message: 'You have already signed this version of the Code of Ethics.' })
  await writeAudit(req.user.sub, 'ETHICS_CODE_SIGNED', 'governance_compliance', rows[0].record_id, { tier, version: CODE_VERSION })
  return res.status(201).json({ data: rows[0], message: 'Code of Ethics signed.' })
}

// ---------------------------------------------------------------------------
// HR / Super Admin: register and disciplinary actions
// ---------------------------------------------------------------------------

export async function register(req, res) {
  if (!isOfficer(req.user)) return fail(res, 403, 'Only HR and the Super Administrator can view the compliance register.')
  const [people, sanctions] = await Promise.all([
    query(
      `SELECT u.id, u.name, u.email, u.status, r.name AS role, r.code AS role_code, o.legal_name AS organization,
              COALESCE((SELECT json_agg(g.ethics_code_tier) FROM governance_compliance g WHERE g.user_id = u.id), '[]'::json) AS signed_tiers,
              (SELECT COUNT(*)::int FROM governance_sanctions s WHERE s.user_id = u.id AND s.status = 'ACTIVE') AS active_sanctions
       FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN organizations o ON o.org_id = u.org_id
       WHERE u.status <> 'erased' ORDER BY u.name`,
    ),
    query(
      `SELECT s.sanction_id, s.user_id, s.tier, s.reason, s.status, s.remediation_due, s.suspended_until, s.issued_at, s.cleared_at,
              s.clearance_notes, u.name AS user_name, i.name AS issued_by_name, c.name AS cleared_by_name
       FROM governance_sanctions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN users i ON i.id = s.issued_by
       LEFT JOIN users c ON c.id = s.cleared_by
       ORDER BY (s.status = 'ACTIVE') DESC, s.issued_at DESC LIMIT 300`,
    ),
  ])
  return res.json({
    data: {
      people: people.rows.map((person) => ({
        ...person,
        required_tier: requiredTier(person.role),
        compliant: person.signed_tiers.includes(requiredTier(person.role)),
      })),
      sanctions: sanctions.rows,
    },
  })
}

const sanctionSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  tier: z.coerce.number().int().min(1).max(3),
  reason: z.string().trim().min(10).max(2000),
  suspension_days: z.coerce.number().int().min(14).max(30).optional(),
  course_id: uuid.optional().nullable(),
})

export async function issueSanction(req, res) {
  if (!isOfficer(req.user)) return fail(res, 403, 'Only HR and the Super Administrator can issue sanctions.')
  const parsed = sanctionSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid sanction.')
  const { user_id: userId, tier, reason } = parsed.data

  if (userId === req.user.sub) return fail(res, 400, 'You cannot sanction your own account.')
  if (tier === 3 && req.user.role !== 'admin') return fail(res, 403, 'Only the Super Administrator can impose a Tier 3 expulsion.')
  if (tier === 2 && !parsed.data.suspension_days) return fail(res, 400, 'Tier 2 requires a suspension of 14 to 30 days.')

  const target = await query(
    `SELECT u.id, u.name, u.status, u.org_id, r.name AS role, o.org_type
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN organizations o ON o.org_id = u.org_id WHERE u.id = $1`,
    [userId],
  )
  const person = target.rows[0]
  if (!person || person.status === 'erased') return fail(res, 404, 'User not found.')
  if (person.status === 'expelled') return fail(res, 409, 'This user has already been expelled.')
  if (person.role === 'admin') return fail(res, 403, 'The Super Administrator cannot be sanctioned through this workflow.')

  const today = new Date()
  const remediationDue = tier === 1 ? addBusinessDays(today, 5) : null
  const suspendedUntil = tier === 2
    ? new Date(today.getTime() + parsed.data.suspension_days * 86400000).toISOString().slice(0, 10)
    : null

  // Tier 1 requires re-completing a compliance course with an assessment.
  let courseId = null
  if (tier === 1) {
    const course = await query(
      `SELECT item_id FROM community_events_courses
       WHERE module_type = 'COMPLIANCE_COURSE' AND jsonb_array_length(quiz) > 0 AND ($1::uuid IS NULL OR item_id = $1::uuid)
       ORDER BY created_at LIMIT 1`,
      [parsed.data.course_id || null],
    )
    if (!course.rows[0]) return fail(res, 409, 'Create a compliance course with an assessment before issuing a Tier 1 warning.')
    courseId = course.rows[0].item_id
  }

  const sanction = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO governance_sanctions (user_id, tier, reason, status, remediation_due, suspended_until, issued_by, required_course_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING sanction_id`,
      [userId, tier, reason, tier === 3 ? 'PERMANENT' : 'ACTIVE', remediationDue, suspendedUntil, req.user.sub, courseId],
    )
    if (courseId) {
      // "Mandatory re-completion": any earlier pass no longer counts.
      await client.query(
        `INSERT INTO course_enrollments (item_id, user_id, status) VALUES ($1, $2, 'ENROLLED')
         ON CONFLICT (item_id, user_id) DO UPDATE SET status = 'ENROLLED', completed_at = NULL, certificate_hash = NULL`,
        [courseId, userId],
      )
    }
    if (tier === 2) await client.query("UPDATE users SET status = 'suspended' WHERE id = $1", [userId])
    if (tier === 3) {
      // Permanent expulsion: revoke credentials and second factor.
      await client.query(
        "UPDATE users SET status = 'expelled', password_hash = '!revoked', mfa_secret = NULL, mfa_enabled = false WHERE id = $1",
        [userId],
      )
      await client.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId])
      await client.query('DELETE FROM webauthn_credentials WHERE user_id = $1', [userId])
      await client.query('DELETE FROM webauthn_challenges WHERE user_id = $1', [userId])
      // Isolate the linked organisation's assets when the person belongs to an external company.
      if (person.org_id && isExternal(person.role) && !['PARENT', 'BUSINESS_UNIT'].includes(person.org_type)) {
        await client.query("UPDATE organizations SET verification_status = 'SUSPENDED' WHERE org_id = $1", [person.org_id])
      }
    }
    return rows[0]
  })

  await writeAudit(req.user.sub, `ETHICS_SANCTION_TIER_${tier}`, 'governance_sanctions', sanction.sanction_id, { user_id: userId })
  const messages = {
    1: { title: 'Formative warning issued', body: `Complete the compliance course by ${remediationDue}.` },
    2: { title: 'Your access has been suspended', body: `Suspended until ${suspendedUntil}. HR clearance is required to restore access.` },
  }
  const portal = isExternal(person.role) ? 'extranet' : 'intranet'
  if (messages[tier]) await notify([userId], { type: 'governance', ...messages[tier], link: tier === 1 ? `/${portal}/ethics` : null })
  await notifyRoles(GOVERNANCE_ROLES, { type: 'governance', title: `Tier ${tier} sanction: ${person.name}`, link: '/intranet/ethics' }, req.user.sub)

  return res.status(201).json({ data: { sanction_id: sanction.sanction_id, remediation_due: remediationDue, suspended_until: suspendedUntil }, message: `Tier ${tier} sanction recorded.` })
}

/** HR clearance: closes a Tier 1/2 sanction; Tier 2 restores the account once no other suspension applies. */
export async function clearSanction(req, res) {
  if (!isOfficer(req.user)) return fail(res, 403, 'Only HR and the Super Administrator can clear sanctions.')
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid sanction id.')
  const notes = String(req.body?.notes || '').trim()
  if (notes.length < 5) return fail(res, 400, 'Add clearance notes.')

  const { rows } = await query('SELECT * FROM governance_sanctions WHERE sanction_id = $1', [req.params.id])
  const sanction = rows[0]
  if (!sanction) return fail(res, 404, 'Sanction not found.')
  if (sanction.status === 'PERMANENT') return fail(res, 409, 'A Tier 3 expulsion is permanent and cannot be cleared.')
  if (sanction.status !== 'ACTIVE') return fail(res, 409, 'This sanction has already been cleared.')
  if (sanction.user_id === req.user.sub) return fail(res, 400, 'You cannot clear your own sanction.')

  await withTransaction(async (client) => {
    await client.query(
      "UPDATE governance_sanctions SET status = 'CLEARED', cleared_by = $2, cleared_at = now(), clearance_notes = $3 WHERE sanction_id = $1",
      [sanction.sanction_id, req.user.sub, notes],
    )
    if (sanction.tier === 2) {
      const other = await client.query(
        "SELECT 1 FROM governance_sanctions WHERE user_id = $1 AND tier = 2 AND status = 'ACTIVE'",
        [sanction.user_id],
      )
      if (!other.rowCount) {
        await client.query("UPDATE users SET status = 'active' WHERE id = $1 AND status = 'suspended'", [sanction.user_id])
      }
    }
  })
  await writeAudit(req.user.sub, 'ETHICS_SANCTION_CLEARED', 'governance_sanctions', sanction.sanction_id, { tier: sanction.tier })
  await notify([sanction.user_id], { type: 'governance', title: `Tier ${sanction.tier} sanction cleared`, body: 'Your compliance record has been updated.' })
  return res.json({ message: sanction.tier === 2 ? 'Sanction cleared and access restored.' : 'Sanction cleared.' })
}

/** Passing the required course closes the Tier 1 warning automatically. */
export async function resolveRemediation(userId, userName, itemId) {
  const { rows } = await query(
    `UPDATE governance_sanctions
     SET status = 'CLEARED', cleared_at = now(), clearance_notes = 'Required compliance course completed.'
     WHERE user_id = $1 AND required_course_id = $2 AND tier = 1 AND status = 'ACTIVE'
     RETURNING sanction_id`,
    [userId, itemId],
  )
  for (const row of rows) {
    await writeAudit(userId, 'ETHICS_REMEDIATION_COMPLETED', 'governance_sanctions', row.sanction_id)
    await notifyRoles(GOVERNANCE_ROLES, { type: 'governance', title: `Tier 1 remediation completed: ${userName}`, link: '/intranet/ethics' })
  }
  return rows.length
}

/** Alerts HR once about Tier 1 warnings past their deadline; escalation stays a human decision. */
export async function sendOverdueRemediationAlerts() {
  const { rows } = await query(
    `UPDATE governance_sanctions s SET overdue_notified_at = now()
     FROM users u
     WHERE u.id = s.user_id AND s.tier = 1 AND s.status = 'ACTIVE'
       AND s.remediation_due < CURRENT_DATE AND s.overdue_notified_at IS NULL
     RETURNING u.name`,
  )
  for (const row of rows) {
    await notifyRoles(GOVERNANCE_ROLES, {
      type: 'governance',
      title: `Tier 1 remediation overdue: ${row.name}`,
      body: 'Review whether to escalate to Tier 2.',
      link: '/intranet/ethics',
    })
  }
  return rows.length
}
