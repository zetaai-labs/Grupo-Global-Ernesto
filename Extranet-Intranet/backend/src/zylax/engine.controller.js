import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { query, withTransaction } from '../config/database.js'
import { config } from '../config/env.js'
import { isExternal, STAFF_ROLES } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { notify } from '../services/notification.service.js'
import { orgPredicate } from '../services/scope.js'
import { sendStoredFile } from '../services/storage.service.js'
import { MODULES, allStatuses, findEntity, initialStatus, moduleByKey } from './definitions.js'
import { actions, httpError, lock, rules } from './rules.js'

/** Generic secured engine behind the ZYLAX modules. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (value) => typeof value === 'string' && UUID.test(value)

// ----- Encryption of secret fields -----

function fieldKey() {
  const raw = config.storage.encryptionKey
  if (!raw) throw httpError(503, 'Confidential fields need STORAGE_ENCRYPTION_KEY to be configured.')
  return Buffer.from(hkdfSync('sha256', Buffer.from(raw, 'base64'), Buffer.alloc(0), 'zylax-record-fields-v1', 32))
}
function seal(values) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', fieldKey(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':')
}
export function unseal(payload) {
  if (!payload) return {}
  const [, iv, tag, body] = payload.split(':')
  const decipher = createDecipheriv('aes-256-gcm', fieldKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8'))
}

// ----- Permissions -----

const externalAccess = (user, def) => (isExternal(user.role) && def.external?.roles.includes(user.role) ? def.external : null)
const canRead = (user, def) => def.read.includes(user.role) || Boolean(externalAccess(user, def))
const canManage = (user, def) => def.manage.includes(user.role)
const canCreate = (user, def) => def.create.includes(user.role) || Boolean(externalAccess(user, def)?.create && user.org_id)
const isOwner = (user, row) => row.created_by === user.sub || row.assigned_to === user.sub
/**
 * Records holding personal documents (employee profiles): files and comments are seen only by the managers
 * of the entity (HR, admin) and by the person the record is about. Everyone else still sees the basic card
 * (name, job title, department), which the organisation chart needs.
 * 'full' = everything, 'own' = the person (not HR-only notes), 'none' = no files or comments.
 */
const privateAccess = (user, def, row) => {
  if (!def.privateFiles || canManage(user, def)) return 'full'
  return row.assigned_to === user.sub ? 'own' : 'none'
}
const isCustomer = (user, def, row) => Boolean(externalAccess(user, def) && user.org_id && row.customer_org_id === user.org_id)

function visibility(user, def, params, alias = 'r') {
  const external = externalAccess(user, def)
  if (external) {
    params.push(user.org_id || null)
    let sql = `${alias}.customer_org_id = $${params.length}`
    if (external.sharedStatuses) {
      params.push(external.sharedStatuses)
      sql = `(${sql} OR ${alias}.status = ANY($${params.length}::text[]))`
    }
    return sql
  }
  params.push(def.groupRoles?.includes(user.role) ? null : user.org_scope ?? null)
  let sql = orgPredicate(`${alias}.owner_org_id`, `$${params.length}`)
  if (def.own && !canManage(user, def)) {
    params.push(user.sub)
    sql += ` AND (${alias}.created_by = $${params.length} OR ${alias}.assigned_to = $${params.length})`
  }
  return sql
}

function allowedTransitions(user, def, row) {
  const next = def.flow[row.status] || {}
  return Object.entries(next).filter(([to, tokens]) => {
    if (def.noSelf?.includes(to) && row.created_by === user.sub) return false
    return tokens.some((token) => {
      if (token === 'manage') return canManage(user, def)
      if (token === 'owner') return !isExternal(user.role) && isOwner(user, row)
      if (token === 'external') return isCustomer(user, def, row)
      return token === user.role
    })
  }).map(([to]) => to)
}

const canEdit = (user, def, row) => {
  if (def.immutable || isExternal(user.role)) return false
  if (canManage(user, def)) return true
  return isOwner(user, row) && row.status === initialStatus(def)
}

// ----- Field validation -----

function cleanValue(field, raw) {
  if (raw === undefined || raw === null || raw === '') return null
  const bad = (message = `${field.label} is not valid.`) => { throw httpError(400, message) }
  const number = () => {
    const value = Number(raw)
    if (!Number.isFinite(value)) bad()
    return value
  }
  switch (field.type) {
    case 'text': case 'phone': return String(raw).trim().slice(0, 500) || null
    case 'textarea': return String(raw).trim().slice(0, 10000) || null
    case 'email': {
      const value = String(raw).trim().toLowerCase()
      if (value.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) bad()
      return value
    }
    case 'number': { const value = number(); if (value < 0 || value > 1e12) bad(); return value }
    case 'integer': { const value = number(); if (!Number.isInteger(value) || value < 0 || value > 1e9) bad(); return value }
    case 'money': { const value = number(); if (value < 0 || value > 1e12) bad(); return Math.round(value * 100) / 100 }
    case 'percent': { const value = number(); if (value < 0 || value > 100) bad(); return value }
    case 'rating': { const value = number(); if (!Number.isInteger(value) || value < 1 || value > 5) bad(); return value }
    case 'boolean': return raw === true || raw === 'true'
    case 'month': { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(raw))) bad(); return String(raw) }
    case 'date': {
      const value = String(raw)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) bad()
      const parsed = new Date(`${value}T00:00:00Z`)
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) bad()
      return value
    }
    case 'datetime': { const parsed = new Date(String(raw)); if (Number.isNaN(parsed.getTime())) bad(); return parsed.toISOString() }
    case 'select': { if (!field.options.includes(raw)) bad(); return raw }
    case 'user': { const value = Number(raw); if (!Number.isInteger(value) || value <= 0) bad(); return value }
    case 'org': case 'product': case 'ref': { if (!isUuid(raw)) bad(); return raw }
    default: return bad()
  }
}

async function assertReference(client, user, field, value) {
  if (value === null || !['user', 'org', 'product', 'ref'].includes(field.type)) return
  let found
  if (field.type === 'user') {
    found = await client.query(
      `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.status = 'active' AND r.name = ANY($2::text[])`,
      [value, STAFF_ROLES],
    )
  } else if (field.type === 'org') {
    found = await client.query('SELECT 1 FROM organizations WHERE org_id = $1', [value])
  } else if (field.type === 'product') {
    const params = [value, user.org_scope ?? null]
    const scope = isExternal(user.role) ? 'p.active' : orgPredicate('p.owner_org_id', '$2')
    found = await client.query(`SELECT 1 FROM zx_products p WHERE p.product_id = $1 AND ($2::uuid[] IS NULL OR $2::uuid[] IS NOT NULL) AND ${scope}`, params)
  } else {
    const target = findEntity(field.module, field.entity)
    const params = [value, field.module, field.entity]
    const predicate = canRead(user, target) ? visibility(user, target, params) : 'false'
    found = await client.query(`SELECT 1 FROM zx_records r WHERE r.record_id = $1 AND r.module = $2 AND r.entity = $3 AND ${predicate}`, params)
  }
  if (!found.rowCount) throw httpError(400, `${field.label}: selected value is not available.`)
}

/** Validates input into public and secret values. External users can only set fields marked external. */
async function buildDraft(client, user, def, body, existing = null) {
  const external = isExternal(user.role)
  const data = { ...(existing?.data || {}) }
  const secret = existing ? unseal(existing.sealed_data) : {}
  let assigned = existing?.assigned_to ?? null
  let customer = existing?.customer_org_id ?? null
  const manager = canManage(user, def)

  for (const field of def.fields) {
    if (field.computed) continue
    if (external && !field.external && !field.customer) continue
    if (external && field.customer) {
      if (!existing) data[field.key] = user.org_id
      continue
    }
    if (existing && !(field.key in body)) continue
    let value = cleanValue(field, body[field.key])
    if (field.assign && def.own && !manager) value = field.required ? user.sub : null
    if (field.required && value === null) throw httpError(400, `${field.label} is required.`)
    await assertReference(client, user, field, value)
    if (field.secret) secret[field.key] = value
    else data[field.key] = value
    if (field.assign) assigned = value
    if (field.customer) customer = value
  }
  if (external) customer = existing?.customer_org_id ?? user.org_id
  if (external) {
    for (const field of def.fields) {
      if (field.required && field.external && data[field.key] == null) throw httpError(400, `${field.label} is required.`)
    }
  }

  if (def.dates) {
    const [start, end] = def.dates
    if (data[start] && data[end] && new Date(data[end]) < new Date(data[start])) throw httpError(400, 'The end cannot be before the start.')
  }
  const hasSecret = Object.values(secret).some((value) => value !== null && value !== undefined)
  return { data, sealed_data: hasSecret ? seal(secret) : null, assigned_to: assigned, customer_org_id: customer }
}

async function checkConstraints(client, moduleKey, def, draft, excludeId = null) {
  const scopeKey = `zx-${moduleKey}-${def.key}`
  for (const key of def.unique || []) {
    if (draft.data[key] == null) continue
    await lock(client, `${scopeKey}-${key}-${draft.data[key]}`)
    const clash = await client.query(
      `SELECT 1 FROM zx_records WHERE module = $1 AND entity = $2 AND data->>$3 = $4 AND ($5::uuid IS NULL OR record_id <> $5) LIMIT 1`,
      [moduleKey, def.key, key, String(draft.data[key]), excludeId],
    )
    if (clash.rowCount) throw httpError(409, `This ${def.fields.find((field) => field.key === key).label.toLowerCase()} is already registered.`)
  }
  if (def.uniqueWithin) {
    const [a, b] = def.uniqueWithin
    await lock(client, `${scopeKey}-${draft.data[a]}-${draft.data[b]}`)
    const clash = await client.query(
      `SELECT 1 FROM zx_records WHERE module = $1 AND entity = $2 AND data->>$3 = $4 AND data->>$5 = $6 AND status <> 'CANCELLED' LIMIT 1`,
      [moduleKey, def.key, a, String(draft.data[a]), b, String(draft.data[b])],
    )
    if (clash.rowCount) throw httpError(409, 'This person is already registered here.')
  }
  if (def.overlap) {
    const { resource, start, end, active } = def.overlap
    const dateOnly = def.fields.find((field) => field.key === start)?.type === 'date'
    const cast = dateOnly ? 'date' : 'timestamptz'
    const operator = dateOnly ? '<=' : '<'
    await lock(client, `${scopeKey}-overlap-${draft.data[resource]}`)
    const clash = await client.query(
      `SELECT ref_no FROM zx_records WHERE module = $1 AND entity = $2 AND data->>$3 = $4 AND status = ANY($5::text[])
       AND ($6::uuid IS NULL OR record_id <> $6)
       AND (data->>$7)::${cast} ${operator} $10::${cast} AND (data->>$8)::${cast} ${operator === '<' ? '>' : '>='} $9::${cast} LIMIT 1`,
      [moduleKey, def.key, resource, draft.data[resource], active, excludeId, start, end, draft.data[start], draft.data[end]],
    )
    if (clash.rowCount) throw httpError(409, `Already booked for this time (${clash.rows[0].ref_no}).`)
  }
}

async function applyCapacity(client, moduleKey, def, draft) {
  if (!def.capacity) return
  const { parent, limit, active, waitlist } = def.capacity
  const parentRow = await client.query('SELECT data FROM zx_records WHERE record_id = $1 FOR UPDATE', [draft.data[parent]])
  const max = Number(parentRow.rows[0]?.data?.[limit] || 0)
  const used = await client.query(
    `SELECT count(*)::int AS used FROM zx_records WHERE module = $1 AND entity = $2 AND data->>$3 = $4 AND status = ANY($5::text[])`,
    [moduleKey, def.key, parent, draft.data[parent], active],
  )
  if (used.rows[0].used < max) return
  if (!waitlist) throw httpError(409, 'No capacity left.')
  draft.status = 'WAITLISTED'
}

// ----- Record creation -----

export async function insertRecord(client, moduleKey, def, payload, actorId, ownerOrgId) {
  const prefix = moduleKey.replace(/_/g, '').slice(0, 3).toUpperCase()
  const status = payload.status || initialStatus(def)
  const { rows } = await client.query(
    `INSERT INTO zx_records (ref_no, module, entity, title, status, data, sealed_data, owner_org_id, customer_org_id, assigned_to, created_by)
     VALUES ('ZX-' || $1 || '-' || lpad(nextval('zx_record_seq')::text, 6, '0'), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [prefix, moduleKey, def.key, payload.title, status, JSON.stringify(payload.data || {}), payload.sealed_data || null, ownerOrgId || null, payload.customer_org_id || null, payload.assigned_to || null, actorId],
  )
  await client.query(`INSERT INTO zx_record_events (record_id, kind, to_status, created_by) VALUES ($1, 'created', $2, $3)`, [rows[0].record_id, status, actorId])
  return rows[0]
}

const makeContext = (client, user) => {
  const ctx = {
    client, user, after: [],
    insert: (moduleKey, entityKey, payload) => insertRecord(client, moduleKey, findEntity(moduleKey, entityKey), payload, user.sub, user.org_id),
  }
  return ctx
}
const runAfter = async (ctx) => { for (const work of ctx.after) await work() }

// ----- Presentation -----

async function labelsFor(def, rows) {
  const collect = (type) => [...new Set(def.fields.filter((field) => field.type === type).flatMap((field) => rows.map((row) => row.data?.[field.key])).filter(Boolean))]
  const labels = {}
  const users = collect('user').map(Number).filter(Number.isInteger)
  const orgs = collect('org').filter(isUuid)
  const products = collect('product').filter(isUuid)
  const refs = collect('ref').filter(isUuid)
  const [u, o, p, r] = await Promise.all([
    users.length ? query('SELECT id, name FROM users WHERE id = ANY($1::int[])', [users]) : { rows: [] },
    orgs.length ? query('SELECT org_id, legal_name FROM organizations WHERE org_id = ANY($1::uuid[])', [orgs]) : { rows: [] },
    products.length ? query('SELECT product_id, name FROM zx_products WHERE product_id = ANY($1::uuid[])', [products]) : { rows: [] },
    refs.length ? query('SELECT record_id, title FROM zx_records WHERE record_id = ANY($1::uuid[])', [refs]) : { rows: [] },
  ])
  for (const row of u.rows) labels[row.id] = row.name
  for (const row of o.rows) labels[row.org_id] = row.legal_name
  for (const row of p.rows) labels[row.product_id] = row.name
  for (const row of r.rows) labels[row.record_id] = row.title
  return labels
}

function present(user, def, row, labels) {
  const external = isExternal(user.role)
  const data = {}
  for (const field of def.fields) {
    if (field.secret) continue
    if (field.restrictedTo && !field.restrictedTo.includes(user.role)) continue
    if (external && !field.external) continue
    if (row.data?.[field.key] !== undefined) data[field.key] = row.data[field.key]
  }
  if (!external && (canManage(user, def) || isOwner(user, row))) Object.assign(data, unseal(row.sealed_data))
  const output = {
    record_id: row.record_id, ref_no: row.ref_no, title: row.title, status: row.status, data,
    created_at: row.created_at, updated_at: row.updated_at,
    can_edit: canEdit(user, def, row), transitions: allowedTransitions(user, def, row),
    actions: !external && canManage(user, def) && ['NEW', 'REVIEWING'].includes(row.status) ? (def.actions || []) : (!external && user.role === 'employee' && ['NEW', 'REVIEWING'].includes(row.status) ? (def.actions || []) : []),
  }
  const shown = {}
  for (const field of def.fields) {
    const value = data[field.key]
    if (value != null && labels[value]) shown[value] = labels[value]
  }
  output.labels = shown
  return output
}

const publicField = (user, def) => (field) => {
  if (field.restrictedTo && !field.restrictedTo.includes(user.role)) return false
  if (field.computed && !isExternal(user.role)) return true
  if (isExternal(user.role)) return Boolean(field.external)
  return !field.secret || canManage(user, def) || def.own
}

function describeEntity(user, def) {
  return {
    key: def.key, label: def.label, title_label: def.titleLabel, auto_title: Boolean(def.autoTitle),
    fields: def.fields.filter(publicField(user, def)).map(({ key, label, type, required, options, module, entity, computed, secret, customer }) => ({
      key, label, type, required: Boolean(required), options, module, entity, computed: Boolean(computed), secret: Boolean(secret),
      customer: Boolean(customer),
    })),
    statuses: allStatuses(def),
    can_create: canCreate(user, def),
    can_manage: canManage(user, def),
    sum_field: def.sumField || def.signedSum?.field || null,
  }
}

// ----- Route handlers -----

function resolve(req) {
  const module = moduleByKey.get(req.params.module)
  const def = module?.entities.find((item) => item.key === req.params.entity)
  if (!def) throw httpError(404, 'Module not found.')
  if (!canRead(req.user, def)) throw httpError(403, 'You do not have access to this module.')
  return { module, def }
}

const CUSTOM_MODULE_ROLES = {
  pos: ['admin', 'manager', 'employee', 'finance', 'client', 'partner'],
  catalog: ['admin', 'manager', 'employee', 'finance', 'client', 'partner'],
}

export function listModules(req, res) {
  const data = MODULES.map((module) => {
    const entities = module.entities.filter((def) => canRead(req.user, def)).map((def) => describeEntity(req.user, def))
    const visible = module.custom ? CUSTOM_MODULE_ROLES[module.key]?.includes(req.user.role) : entities.length > 0
    if (!visible) return null
    const { key, name, group, icon, description, view, link } = module
    return { key, name, group, icon, description, view: view || null, link: isExternal(req.user.role) ? null : link || null, entities }
  }).filter(Boolean)
  return res.json({ data })
}

export async function lookups(req, res) {
  const products = await query(
    isExternal(req.user.role)
      ? 'SELECT product_id AS id, name, sku FROM zx_products WHERE active ORDER BY name LIMIT 500'
      : `SELECT p.product_id AS id, p.name, p.sku FROM zx_products p WHERE p.active AND ${orgPredicate('p.owner_org_id', '$1')} ORDER BY p.name LIMIT 500`,
    isExternal(req.user.role) ? [] : [req.user.org_scope ?? null],
  )
  if (isExternal(req.user.role)) return res.json({ data: { users: [], orgs: [], products: products.rows } })
  const [users, orgs] = await Promise.all([
    query(
      `SELECT u.id, u.name, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.status = 'active' AND r.name = ANY($1::text[]) ORDER BY u.name LIMIT 1000`,
      [STAFF_ROLES],
    ),
    query(`SELECT org_id AS id, legal_name AS name, org_type FROM organizations WHERE org_type NOT IN ('PARENT', 'BUSINESS_UNIT') ORDER BY legal_name`),
  ])
  return res.json({ data: { users: users.rows, orgs: orgs.rows, products: products.rows } })
}

/** Records the user may see in one module entity, with the same filters as the list. limit 0 = only the SQL. */
export async function scopedRecords(req, limit = 500) {
  const { module, def } = resolve(req)
  const params = [module.key, def.key]
  const filters = ['r.module = $1', 'r.entity = $2', visibility(req.user, def, params)]
  if (req.query.status) {
    params.push(String(req.query.status))
    filters.push(`r.status = $${params.length}`)
  }
  if (req.query.q) {
    params.push(`%${String(req.query.q).slice(0, 100)}%`)
    filters.push(`(r.title ILIKE $${params.length} OR r.ref_no ILIKE $${params.length})`)
  }
  const where = filters.join(' AND ')
  if (!limit) return { module, def, where, params }
  const { rows } = await query(`SELECT r.* FROM zx_records r WHERE ${where} ORDER BY r.created_at DESC LIMIT ${Number(limit)}`, params)
  return { module, def, rows, where, params }
}

export async function presentRows(user, def, rows) {
  const labels = await labelsFor(def, rows)
  return rows.map((row) => present(user, def, row, labels))
}

/** Fields the user may see as columns (no confidential ones for people who cannot read them). */
export function visibleFields(user, def) {
  return def.fields.filter(publicField(user, def)).filter((field) => !field.secret || canManage(user, def))
}

export async function listRecords(req, res) {
  const { def, rows } = await scopedRecords(req, 500)
  const labels = await labelsFor(def, rows)
  const data = rows.map((row) => present(req.user, def, row, labels))
  const counts = {}
  let sum = 0
  for (const row of data) {
    counts[row.status] = (counts[row.status] || 0) + 1
    if (def.sumField) sum += Number(row.data[def.sumField] || 0)
    if (def.signedSum && row.status !== 'VOID') {
      const amount = Number(row.data[def.signedSum.field] || 0)
      sum += row.data[def.signedSum.by] === def.signedSum.negative ? -amount : amount
    }
  }
  return res.json({ data, meta: { counts, sum: def.sumField || def.signedSum ? Math.round(sum * 100) / 100 : null } })
}

async function loadRow(db, req, def, moduleKey, forUpdate = false) {
  if (!isUuid(req.params.id)) throw httpError(400, 'Invalid id.')
  const params = [req.params.id, moduleKey, def.key]
  const predicate = visibility(req.user, def, params)
  const { rows } = await db.query(`SELECT r.* FROM zx_records r WHERE r.record_id = $1 AND r.module = $2 AND r.entity = $3 AND ${predicate} ${forUpdate ? 'FOR UPDATE OF r' : ''}`, params)
  if (!rows[0]) throw httpError(404, 'Record not found.')
  return rows[0]
}

/** One record exactly as this user may see it (fields, labels, timeline, files). */
export async function visibleRecord(req) {
  const { module, def } = resolve(req)
  const row = await loadRow({ query }, req, def, module.key)
  const external = isExternal(req.user.role)
  const [labels, events, files] = await Promise.all([
    labelsFor(def, [row]),
    query(
      `SELECT e.event_id, e.kind, e.from_status, e.to_status, e.body, e.internal, e.created_at, u.name AS author
       FROM zx_record_events e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.record_id = $1 AND ($2::boolean = false OR e.internal = false) ORDER BY e.created_at, e.event_id`,
      [row.record_id, external],
    ),
    query(
      `SELECT file_id, name, size_bytes, internal, created_at FROM zx_record_files
       WHERE record_id = $1 AND ($2::boolean = false OR internal = false) ORDER BY created_at`,
      [row.record_id, external],
    ),
  ])
  const access = privateAccess(req.user, def, row)
  const shownEvents = events.rows.filter((event) => access === 'full' || (access === 'own' ? !event.internal : !['comment', 'file'].includes(event.kind)))
  const shownFiles = access === 'full' ? files.rows : access === 'own' ? files.rows.filter((file) => !file.internal) : []
  const eventsOut = external ? shownEvents.map(({ author: _author, ...event }) => event) : shownEvents
  return {
    module, def,
    record: { ...present(req.user, def, row, labels), events: eventsOut, files: shownFiles, private_files: Boolean(def.privateFiles), can_add: access !== 'none' },
  }
}

export async function getRecord(req, res) {
  const { record } = await visibleRecord(req)
  return res.json({ data: record })
}

export async function createRecord(req, res) {
  const { module, def } = resolve(req)
  if (!canCreate(req.user, def)) throw httpError(403, 'You cannot create records here.')
  const body = req.body || {}
  const title = String(body.title || '').trim().slice(0, 255) || (def.autoTitle ? `${def.label} · ${req.user.name}`.slice(0, 255) : '')
  if (title.length < 2) throw httpError(400, `${def.titleLabel} is required.`)

  const { record, ctx } = await withTransaction(async (client) => {
    const context = makeContext(client, req.user)
    const draft = { title, status: initialStatus(def), ...(await buildDraft(client, req.user, def, body)) }
    if (def.customerRequired && !draft.customer_org_id) throw httpError(400, 'Company is required.')
    await checkConstraints(client, module.key, def, draft)
    await applyCapacity(client, module.key, def, draft)
    await rules[def.rule]?.create?.(context, draft)
    const created = await insertRecord(client, module.key, def, draft, req.user.sub, isExternal(req.user.role) ? null : req.user.org_id)
    await rules[def.rule]?.afterCreate?.(context, created)
    return { record: created, ctx: context }
  })
  await runAfter(ctx)
  await writeAudit(req.user.sub, 'ZX_RECORD_CREATED', `zx:${module.key}:${def.key}`, record.record_id)
  if (record.assigned_to && record.assigned_to !== req.user.sub) {
    await notify([record.assigned_to], { type: 'zylax', title: `${module.name}: ${record.title}`, body: 'Assigned to you.', link: `/intranet/zylax/${module.key}` })
  }
  const labels = await labelsFor(def, [record])
  return res.status(201).json({ data: present(req.user, def, record, labels) })
}

export async function updateRecord(req, res) {
  const { module, def } = resolve(req)
  const updated = await withTransaction(async (client) => {
    const row = await loadRow(client, req, def, module.key, true)
    if (!canEdit(req.user, def, row)) throw httpError(403, 'You cannot edit this record.')
    const draft = { ...row, ...(await buildDraft(client, req.user, def, req.body || {}, row)) }
    await checkConstraints(client, module.key, def, draft, row.record_id)
    const context = makeContext(client, req.user)
    await rules[def.rule]?.update?.(context, draft)
    const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 255) : row.title
    if (title.length < 2) throw httpError(400, `${def.titleLabel} is required.`)
    const { rows } = await client.query(
      `UPDATE zx_records SET title = $2, data = $3, sealed_data = $4, assigned_to = $5, customer_org_id = $6, updated_at = now() WHERE record_id = $1 RETURNING *`,
      [row.record_id, title, JSON.stringify(draft.data), draft.sealed_data, draft.assigned_to, draft.customer_org_id],
    )
    await client.query(`INSERT INTO zx_record_events (record_id, kind, internal, created_by) VALUES ($1, 'updated', true, $2)`, [row.record_id, req.user.sub])
    return rows[0]
  })
  await writeAudit(req.user.sub, 'ZX_RECORD_UPDATED', `zx:${module.key}:${def.key}`, updated.record_id)
  return res.json({ data: present(req.user, def, updated, await labelsFor(def, [updated])) })
}

export async function transitionRecord(req, res) {
  const { module, def } = resolve(req)
  const to = String(req.body?.to || '')
  const note = req.body?.note ? String(req.body.note).trim().slice(0, 2000) : null
  const { row, from, ctx } = await withTransaction(async (client) => {
    const current = await loadRow(client, req, def, module.key, true)
    if (!allowedTransitions(req.user, def, current).includes(to)) throw httpError(403, 'This status change is not allowed.')
    const context = makeContext(client, req.user)
    if (def.capacity && to === 'CONFIRMED') {
      const draft = { data: current.data, status: to }
      await applyCapacity(client, module.key, def, draft)
      if (draft.status !== 'CONFIRMED') throw httpError(409, 'No capacity left.')
    }
    await rules[def.rule]?.transition?.(context, current, to)
    const { rows } = await client.query(`UPDATE zx_records SET status = $2, updated_at = now() WHERE record_id = $1 RETURNING *`, [current.record_id, to])
    await client.query(
      `INSERT INTO zx_record_events (record_id, kind, from_status, to_status, body, created_by) VALUES ($1, 'status', $2, $3, $4, $5)`,
      [current.record_id, current.status, to, note, req.user.sub],
    )
    await rules[def.rule]?.afterTransition?.(context, rows[0], current.status, to)
    if (def.capacity?.waitlist && current.status === 'CONFIRMED' && to === 'CANCELLED') {
      const next = await client.query(
        `UPDATE zx_records SET status = 'CONFIRMED', updated_at = now() WHERE record_id = (
           SELECT record_id FROM zx_records WHERE module = $1 AND entity = $2 AND data->>$3 = $4 AND status = 'WAITLISTED'
           ORDER BY created_at, record_id LIMIT 1 FOR UPDATE
         ) RETURNING record_id, title, created_by, assigned_to`,
        [module.key, def.key, def.capacity.parent, current.data[def.capacity.parent]],
      )
      if (next.rows[0]) {
        await client.query(`INSERT INTO zx_record_events (record_id, kind, from_status, to_status, body) VALUES ($1, 'status', 'WAITLISTED', 'CONFIRMED', 'A place became available.')`, [next.rows[0].record_id])
        const person = next.rows[0].assigned_to || next.rows[0].created_by
        context.after.push(() => notify([person], { type: 'zylax', title: `${module.name}: your place is confirmed`, body: next.rows[0].title, link: `/intranet/zylax/${module.key}` }))
      }
    }
    return { row: rows[0], from: current.status, ctx: context }
  })
  await runAfter(ctx)
  await writeAudit(req.user.sub, 'ZX_RECORD_STATUS', `zx:${module.key}:${def.key}`, row.record_id, { from, to })
  const people = [row.created_by, row.assigned_to].filter((id) => id && id !== req.user.sub)
  if (people.length) await notify(people, { type: 'zylax', title: `${row.ref_no}: ${to.replaceAll('_', ' ').toLowerCase()}`, body: row.title, link: `/intranet/zylax/${module.key}` })
  return res.json({ data: present(req.user, def, row, await labelsFor(def, [row])) })
}

export async function runAction(req, res) {
  const { module, def } = resolve(req)
  const name = req.params.action
  if (!def.actions?.includes(name) || isExternal(req.user.role) || !(canManage(req.user, def) || req.user.role === 'employee')) {
    throw httpError(403, 'This action is not allowed.')
  }
  const result = await withTransaction(async (client) => {
    const row = await loadRow(client, req, def, module.key, true)
    const outcome = await actions[name](makeContext(client, req.user), row)
    await client.query(
      `INSERT INTO zx_record_events (record_id, kind, from_status, to_status, body, created_by) VALUES ($1, 'status', $2, $3, $4, $5)`,
      [row.record_id, row.status, outcome.to, outcome.message, req.user.sub],
    )
    return outcome
  })
  await writeAudit(req.user.sub, `ZX_ACTION_${name.toUpperCase()}`, `zx:${module.key}:${def.key}`, req.params.id, { result: result.message })
  return res.json({ data: result })
}

export async function addComment(req, res) {
  const { module, def } = resolve(req)
  const body = String(req.body?.body || '').trim().slice(0, 5000)
  if (!body) throw httpError(400, 'Write a comment first.')
  const row = await loadRow({ query }, req, def, module.key)
  const access = privateAccess(req.user, def, row)
  if (access === 'none') throw httpError(403, 'Only HR and the person concerned can add notes here.')
  // On private records "internal" means HR only, so the person cannot mark their own notes that way.
  const internal = isExternal(req.user.role) || access === 'own' ? false : Boolean(req.body?.internal)
  await query(`INSERT INTO zx_record_events (record_id, kind, body, internal, created_by) VALUES ($1, 'comment', $2, $3, $4)`, [row.record_id, body, internal, req.user.sub])
  const people = [row.created_by, row.assigned_to].filter((id) => id && id !== req.user.sub)
  if (people.length && !internal) await notify(people, { type: 'zylax', title: `New comment on ${row.ref_no}`, body: row.title, link: `/intranet/zylax/${module.key}` })
  return res.status(201).json({ message: 'Comment added.' })
}

export async function preflightFile(req, _res, next) {
  const { module, def } = resolve(req)
  const row = await loadRow({ query }, req, def, module.key)
  if (privateAccess(req.user, def, row) === 'none') throw httpError(403, 'Only HR and the person concerned can add documents here.')
  req.zxRecord = row
  req.zxDefinition = def
  return next()
}

export async function addFile(req, res) {
  if (!req.file) throw httpError(400, 'Choose a PDF, Office, text, image or ZIP file up to 25 MB.')
  const external = isExternal(req.user.role)
  const def = req.zxDefinition
  // Private records (employee profiles): HR chooses "HR only"; otherwise the person sees the document.
  const internal = def?.privateFiles
    ? privateAccess(req.user, def, req.zxRecord) === 'full' && req.body?.internal === 'true'
    : external ? false : req.body?.shared !== 'true'
  const { rows } = await query(
    `INSERT INTO zx_record_files (record_id, name, stored_name, mime_type, size_bytes, internal, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING file_id, name, size_bytes, internal, created_at`,
    [req.zxRecord.record_id, req.file.originalname.slice(0, 255), req.file.filename, req.file.mimetype, req.file.size, internal, req.user.sub],
  )
  await query(`INSERT INTO zx_record_events (record_id, kind, body, internal, created_by) VALUES ($1, 'file', $2, $3, $4)`, [req.zxRecord.record_id, rows[0].name, internal, req.user.sub])
  await writeAudit(req.user.sub, 'ZX_FILE_ADDED', 'zx_record_files', rows[0].file_id)
  const person = req.zxRecord.assigned_to
  if (def?.privateFiles && !internal && person && person !== req.user.sub) {
    await notify([person], { type: 'zylax', title: 'A document was added to your profile', body: rows[0].name, link: `/intranet/zylax/${req.zxRecord.module}` })
  }
  return res.status(201).json({ data: rows[0] })
}

export async function downloadRecordFile(req, res) {
  const { module, def } = resolve(req)
  const row = await loadRow({ query }, req, def, module.key)
  if (!isUuid(req.params.fileId)) throw httpError(400, 'Invalid id.')
  const { rows } = await query(
    `SELECT name, stored_name, mime_type FROM zx_record_files WHERE file_id = $1 AND record_id = $2 AND ($3::boolean = false OR internal = false) AND $4::text <> 'none'`,
    [req.params.fileId, row.record_id, isExternal(req.user.role) || privateAccess(req.user, def, row) === 'own', privateAccess(req.user, def, row)],
  )
  if (!rows[0]) throw httpError(404, 'File not found.')
  await writeAudit(req.user.sub, 'ZX_FILE_DOWNLOADED', 'zx_record_files', req.params.fileId)
  const sent = await sendStoredFile(res, rows[0].stored_name, rows[0].name, rows[0].mime_type)
  if (!sent) throw httpError(404, 'File is missing from storage.')
  return undefined
}
