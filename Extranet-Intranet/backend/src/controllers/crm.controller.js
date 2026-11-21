import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { config } from '../config/env.js'
import { writeAudit } from '../services/audit.js'
import { notify, notifyRoles } from '../services/notification.service.js'

/** CRM relationships and pipelines (Schema Document §4.3). */

export const STAGES = ['LEAD', 'PROPOSAL', 'DUE_DILIGENCE', 'ACTIVE_CONTRACT', 'ARCHIVED']
export const CONTACT_TYPES = ['CLIENT', 'STRATEGIC_PARTNER', 'DELEGATION_NODE', 'VENDOR']
export const CONFIDENTIALITY = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'HIGHLY_CONFIDENTIAL']
/** Roles that see RESTRICTED records without being assigned. */
const RESTRICTED_READERS = ['admin', 'manager']
/** Roles that may create and edit relationships. */
const CRM_EDITORS = ['admin', 'manager']

const uuid = z.string().uuid()
const fail = (res, status, message) => res.status(status).json({ message })

/**
 * SQL predicate for records the user may see:
 * PUBLIC/INTERNAL → all staff; RESTRICTED → admin, managers, the assigned manager and creator;
 * HIGHLY_CONFIDENTIAL → Super Admin and the assigned manager only.
 */
function visibility(user, alias, firstParam) {
  const p = firstParam
  return {
    sql: `(${alias}.confidentiality_level IN ('PUBLIC', 'INTERNAL')
          OR (${alias}.confidentiality_level = 'RESTRICTED'
              AND ($${p + 1} = ANY($${p + 2}::text[]) OR ${alias}.assigned_manager = $${p} OR ${alias}.created_by = $${p}))
          OR (${alias}.confidentiality_level = 'HIGHLY_CONFIDENTIAL'
              AND ($${p + 1} = 'admin' OR ${alias}.assigned_manager = $${p})))`,
    params: [user.sub, user.role, RESTRICTED_READERS],
  }
}

function canEdit(user, rel) {
  return CRM_EDITORS.includes(user.role) || rel.assigned_manager === user.sub
}

const SELECT = `
  SELECT c.rel_id, c.entity_id, c.contact_type, c.confidentiality_level, c.assigned_manager, c.pipeline_stage,
         c.title, c.estimated_value_eur, c.next_action_at, c.source, c.created_by, c.created_at, c.updated_at,
         o.legal_name AS organization, o.region_corridor, o.country, o.verification_status,
         m.name AS manager_name
  FROM crm_relationships c
  JOIN organizations o ON o.org_id = c.entity_id
  LEFT JOIN users m ON m.id = c.assigned_manager
`

async function findVisible(user, relId) {
  const vis = visibility(user, 'c', 2)
  const { rows } = await query(`${SELECT} WHERE c.rel_id = $1 AND ${vis.sql}`, [relId, ...vis.params])
  return rows[0]
}

export async function listRelationships(req, res) {
  const vis = visibility(req.user, 'c', 1)
  const params = [...vis.params]
  const filters = [vis.sql]
  const add = (column, value) => {
    params.push(value)
    filters.push(`${column} = $${params.length}`)
  }
  if (req.query.stage) add('c.pipeline_stage', String(req.query.stage).toUpperCase())
  if (req.query.type) add('c.contact_type', String(req.query.type).toUpperCase())
  if (req.query.corridor) add('o.region_corridor', String(req.query.corridor).toUpperCase())
  if (req.query.mine === 'true') add('c.assigned_manager', req.user.sub)
  if (req.query.q) {
    params.push(`%${req.query.q}%`)
    filters.push(`(c.title ILIKE $${params.length} OR o.legal_name ILIKE $${params.length})`)
  }

  const { rows } = await query(`${SELECT} WHERE ${filters.join(' AND ')} ORDER BY c.updated_at DESC LIMIT 500`, params)
  const pipeline = Object.fromEntries(STAGES.map((stage) => [stage, { count: 0, value_eur: 0 }]))
  for (const row of rows) {
    pipeline[row.pipeline_stage].count += 1
    pipeline[row.pipeline_stage].value_eur += Number(row.estimated_value_eur || 0)
  }
  return res.json({
    data: rows.map((row) => ({ ...row, can_edit: canEdit(req.user, row) })),
    meta: { stages: STAGES, contact_types: CONTACT_TYPES, confidentiality: CONFIDENTIALITY, pipeline },
  })
}

export async function getRelationship(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid relationship id.')
  const rel = await findVisible(req.user, req.params.id)
  if (!rel) return fail(res, 404, 'Relationship not found.')
  const activities = await query(
    `SELECT a.activity_id, a.kind, a.body, a.created_at, u.name AS author
     FROM crm_activities a LEFT JOIN users u ON u.id = a.created_by
     WHERE a.rel_id = $1 ORDER BY a.created_at DESC LIMIT 200`,
    [req.params.id],
  )
  return res.json({ data: { ...rel, can_edit: canEdit(req.user, rel), activities: activities.rows } })
}

const createSchema = z.object({
  entity_id: uuid,
  title: z.string().trim().min(2).max(255),
  contact_type: z.enum(CONTACT_TYPES),
  confidentiality_level: z.enum(CONFIDENTIALITY).default('RESTRICTED'),
  pipeline_stage: z.enum(STAGES).default('LEAD'),
  assigned_manager: z.coerce.number().int().positive().optional().nullable(),
  estimated_value_eur: z.coerce.number().nonnegative().max(1e13).optional().nullable(),
  next_action_at: z.string().optional().nullable(),
  note: z.string().trim().max(5000).optional(),
})

async function assertStaff(userId) {
  if (!userId) return true
  const { rowCount } = await query(
    `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.status = 'active' AND r.name IN ('admin', 'tech_admin', 'hr', 'manager', 'employee')`,
    [userId],
  )
  return rowCount > 0
}

export async function createRelationship(req, res) {
  if (!CRM_EDITORS.includes(req.user.role)) return fail(res, 403, 'Only managers and administrators can create relationships.')
  const parsed = createSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid relationship.')
  const data = parsed.data
  if (data.next_action_at && Number.isNaN(Date.parse(data.next_action_at))) return fail(res, 400, 'Invalid next action date.')
  if (!(await assertStaff(data.assigned_manager))) return fail(res, 400, 'The assigned manager must be an active staff member.')
  const org = await query('SELECT legal_name FROM organizations WHERE org_id = $1', [data.entity_id])
  if (!org.rows[0]) return fail(res, 404, 'Organisation not found.')

  const rel = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO crm_relationships
         (entity_id, title, contact_type, confidentiality_level, pipeline_stage, assigned_manager, estimated_value_eur, next_action_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING rel_id`,
      [data.entity_id, data.title, data.contact_type, data.confidentiality_level, data.pipeline_stage,
        data.assigned_manager || req.user.sub, data.estimated_value_eur ?? null, data.next_action_at || null, req.user.sub],
    )
    await client.query(
      "INSERT INTO crm_activities (rel_id, kind, body, created_by) VALUES ($1, 'SYSTEM', $2, $3)",
      [rows[0].rel_id, `Relationship created at stage ${data.pipeline_stage}.`, req.user.sub],
    )
    if (data.note) {
      await client.query("INSERT INTO crm_activities (rel_id, kind, body, created_by) VALUES ($1, 'NOTE', $2, $3)", [rows[0].rel_id, data.note, req.user.sub])
    }
    return rows[0]
  })

  const manager = data.assigned_manager || req.user.sub
  if (manager !== req.user.sub) {
    await notify([manager], { type: 'crm', title: `CRM: ${data.title} assigned to you`, body: org.rows[0].legal_name, link: '/intranet/crm' })
  }
  await writeAudit(req.user.sub, 'CRM_RELATIONSHIP_CREATED', 'crm_relationships', rel.rel_id, { stage: data.pipeline_stage })
  return res.status(201).json({ data: rel })
}

const updateSchema = z.object({
  title: z.string().trim().min(2).max(255).optional(),
  pipeline_stage: z.enum(STAGES).optional(),
  confidentiality_level: z.enum(CONFIDENTIALITY).optional(),
  assigned_manager: z.coerce.number().int().positive().optional(),
  estimated_value_eur: z.coerce.number().nonnegative().max(1e13).nullable().optional(),
  next_action_at: z.string().nullable().optional(),
})

export async function updateRelationship(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid relationship id.')
  const parsed = updateSchema.safeParse(req.body || {})
  if (!parsed.success || !Object.keys(parsed.data).length) return fail(res, 400, 'Nothing to update.')
  const rel = await findVisible(req.user, req.params.id)
  if (!rel) return fail(res, 404, 'Relationship not found.')
  if (!canEdit(req.user, rel)) return fail(res, 403, 'Only the assigned manager, managers or administrators can edit this relationship.')

  const data = parsed.data
  if (data.next_action_at && Number.isNaN(Date.parse(data.next_action_at))) return fail(res, 400, 'Invalid next action date.')
  if (data.assigned_manager && !(await assertStaff(data.assigned_manager))) return fail(res, 400, 'The assigned manager must be an active staff member.')
  if (data.confidentiality_level === 'HIGHLY_CONFIDENTIAL' && req.user.role !== 'admin' && (data.assigned_manager || rel.assigned_manager) !== req.user.sub) {
    return fail(res, 403, 'Only the Super Administrator or the assigned manager can classify a record as highly confidential.')
  }

  const columns = Object.keys(data)
  const sets = columns.map((column, index) => `${column} = $${index + 2}`)
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE crm_relationships SET ${sets.join(', ')}, updated_at = now() WHERE rel_id = $1`,
      [req.params.id, ...columns.map((column) => data[column] ?? null)],
    )
    if (data.pipeline_stage && data.pipeline_stage !== rel.pipeline_stage) {
      await client.query("INSERT INTO crm_activities (rel_id, kind, body, created_by) VALUES ($1, 'STAGE_CHANGE', $2, $3)",
        [req.params.id, `Stage changed from ${rel.pipeline_stage} to ${data.pipeline_stage}.`, req.user.sub])
    }
    if (data.assigned_manager && data.assigned_manager !== rel.assigned_manager) {
      await client.query("INSERT INTO crm_activities (rel_id, kind, body, created_by) VALUES ($1, 'ASSIGNMENT', $2, $3)",
        [req.params.id, 'Account manager changed.', req.user.sub])
    }
  })

  if (data.assigned_manager && data.assigned_manager !== rel.assigned_manager && data.assigned_manager !== req.user.sub) {
    await notify([data.assigned_manager], { type: 'crm', title: `CRM: ${rel.title} assigned to you`, body: rel.organization, link: '/intranet/crm' })
  }
  if (data.pipeline_stage === 'ACTIVE_CONTRACT' && rel.pipeline_stage !== 'ACTIVE_CONTRACT') {
    await notifyRoles(['admin'], { type: 'crm', title: `Contract active: ${rel.title}`, body: rel.organization, link: '/intranet/crm' }, req.user.sub)
  }
  await writeAudit(req.user.sub, 'CRM_RELATIONSHIP_UPDATED', 'crm_relationships', req.params.id, data)
  return res.json({ message: 'Relationship updated.' })
}

export async function addActivity(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid relationship id.')
  const body = String(req.body?.body || '').trim()
  if (!body) return fail(res, 400, 'Write a note.')
  if (body.length > 5000) return fail(res, 400, 'Notes are limited to 5,000 characters.')
  const rel = await findVisible(req.user, req.params.id)
  if (!rel) return fail(res, 404, 'Relationship not found.')
  const { rows } = await query(
    "INSERT INTO crm_activities (rel_id, kind, body, created_by) VALUES ($1, 'NOTE', $2, $3) RETURNING activity_id, created_at",
    [req.params.id, body, req.user.sub],
  )
  await query('UPDATE crm_relationships SET updated_at = now() WHERE rel_id = $1', [req.params.id])
  return res.status(201).json({ data: rows[0] })
}

/** Staff who can be assigned as account manager. */
export async function listManagers(_req, res) {
  const { rows } = await query(
    `SELECT u.id, u.name, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.status = 'active' AND r.name IN ('admin', 'manager', 'employee', 'hr') ORDER BY u.name`,
  )
  return res.json({ data: rows })
}

// ---------------------------------------------------------------------------
// Technical Spec §2.1 — HMAC-SHA256 signed webhook: website form → CRM lead
// ---------------------------------------------------------------------------

const leadSchema = z.object({
  legal_name: z.string().trim().min(2).max(255),
  contact_name: z.string().trim().min(2).max(255),
  contact_email: z.string().trim().email(),
  country: z.string().trim().length(3).default('ESP'),
  region_corridor: z.enum(['SPAIN_EU', 'INDIA', 'UAE_DUBAI', 'LATAM', 'USA_CAN', 'MOROCCO']).default('SPAIN_EU'),
  interest: z.enum(CONTACT_TYPES).default('CLIENT'),
  message: z.string().trim().max(5000).optional(),
})

export function signWebhook(body, secret = config.integrations.webhookSecret) {
  return createHmac('sha256', secret).update(body).digest('hex')
}

/** Receives `X-GG-Signature: sha256=<hex>` over the raw body; rejects anything unsigned or stale. */
export async function receiveLeadWebhook(req, res) {
  const secret = config.integrations.webhookSecret
  if (!secret) return fail(res, 503, 'Webhook receiver is not configured.')

  const raw = req.rawBody || ''
  const header = String(req.get('x-gg-signature') || '').replace(/^sha256=/, '')
  const expected = signWebhook(raw, secret)
  const valid = header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  if (!valid) {
    await writeAudit(null, 'WEBHOOK_SIGNATURE_REJECTED', 'crm_relationships', null, { ip: req.ip })
    return fail(res, 401, 'Invalid signature.')
  }
  const timestamp = Number(req.get('x-gg-timestamp'))
  if (!timestamp || Math.abs(Date.now() - timestamp * 1000) > 5 * 60 * 1000) return fail(res, 401, 'Stale or missing timestamp.')

  const parsed = leadSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid lead.')
  const lead = parsed.data

  const rel = await withTransaction(async (client) => {
    const existing = await client.query('SELECT org_id FROM organizations WHERE LOWER(legal_name) = LOWER($1)', [lead.legal_name])
    const orgId = existing.rows[0]?.org_id || (await client.query(
      `INSERT INTO organizations (legal_name, tax_id, country, region_corridor, org_type, onboarding_stage)
       VALUES ($1, 'PENDING', $2, $3, $4, 1) RETURNING org_id`,
      [lead.legal_name, lead.country.toUpperCase(), lead.region_corridor, lead.interest],
    )).rows[0].org_id
    const { rows } = await client.query(
      `INSERT INTO crm_relationships (entity_id, title, contact_type, confidentiality_level, pipeline_stage, source)
       VALUES ($1, $2, $3, 'INTERNAL', 'LEAD', 'website') RETURNING rel_id`,
      [orgId, `Website enquiry — ${lead.legal_name}`, lead.interest],
    )
    await client.query("INSERT INTO crm_activities (rel_id, kind, body) VALUES ($1, 'SYSTEM', $2)",
      [rows[0].rel_id, `Lead from website form. Contact: ${lead.contact_name} <${lead.contact_email}>.${lead.message ? `\n\n${lead.message}` : ''}`])
    return rows[0]
  })

  await notifyRoles(CRM_EDITORS, { type: 'crm', title: `New website lead: ${lead.legal_name}`, body: lead.contact_name, link: '/intranet/crm' })
  await writeAudit(null, 'CRM_LEAD_FROM_WEBHOOK', 'crm_relationships', rel.rel_id)
  return res.status(201).json({ data: { rel_id: rel.rel_id } })
}
