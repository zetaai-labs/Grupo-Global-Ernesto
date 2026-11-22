import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { CORRIDORS } from '../config/roles.js'
import { requireRole } from '../middleware/authorize.js'
import { writeAudit } from '../services/audit.js'
import { cancelBatch, confirmBatch, processUpload } from './import.service.js'

/** The supplied datasets are confidential, so access is limited to these roles. */
export const IMPORT_ROLES = ['admin', 'tech_admin']
export const DIRECTORY_READ_ROLES = ['admin', 'tech_admin', 'manager']
export const DIRECTORY_PROMOTE_ROLES = ['admin', 'manager']

const UUID = z.string().uuid()
const PAGE_SIZE = 50
const STATUSES = ['VALID', 'WARNING', 'INVALID', 'DUPLICATE']
const fail = (res, status, message) => res.status(status).json({ message })
const page = (value) => Math.min(Math.max(Number.parseInt(value, 10) || 1, 1), 100000)
const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&')

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, callback) => callback(null, `gg-import-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 150 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, /\.(xlsx|csv)$/i.test(file.originalname)),
})

const router = Router()
const canImport = requireRole(...IMPORT_ROLES)
const validId = (req, res, next) => (UUID.safeParse(req.params.id).success ? next() : fail(res, 400, 'Invalid id.'))

// ----- Business directory -----

router.get('/directory', requireRole(...DIRECTORY_READ_ROLES), async (req, res) => {
  const params = []
  const where = []
  const q = String(req.query.q || '').trim().slice(0, 120)
  if (q) {
    params.push(`%${escapeLike(q)}%`)
    where.push(`(d.name ILIKE $${params.length} OR d.commercial_name ILIKE $${params.length} OR d.tax_identifier ILIKE $${params.length} OR d.locality ILIKE $${params.length})`)
  }
  if (['ASSOCIATIONS', 'BUSINESS_DIRECTORY'].includes(req.query.source)) {
    params.push(req.query.source)
    where.push(`d.source_type = $${params.length}`)
  }
  if (req.query.province) {
    params.push(String(req.query.province).slice(0, 120))
    where.push(`d.province = $${params.length}`)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const current = page(req.query.page)
  const [rows, count] = await Promise.all([
    query(
      `SELECT d.directory_id, d.source_type, d.registration_number, d.name, d.commercial_name, d.tax_identifier, d.activity,
              d.address, d.postal_code, d.province, d.locality, d.website, d.promoted_org_id,
              COALESCE((SELECT json_agg(json_build_object('contact_name', c.contact_name, 'email', c.email, 'phone', c.phone, 'designation', c.designation))
                        FROM directory_contacts c WHERE c.directory_id = d.directory_id), '[]'::json) AS contacts
       FROM directory_organizations d ${clause}
       ORDER BY LOWER(d.name), d.directory_id LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`,
      params,
    ),
    query(`SELECT COUNT(*)::int AS total FROM directory_organizations d ${clause}`, params),
  ])
  return res.json({ data: rows.rows, page: current, page_size: PAGE_SIZE, total: count.rows[0].total })
})

const promoteSchema = z.object({
  contact_type: z.enum(['CLIENT', 'STRATEGIC_PARTNER', 'DELEGATION_NODE', 'VENDOR']).default('CLIENT'),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  region_corridor: z.enum(CORRIDORS.map(([code]) => code).filter((code) => code !== 'GLOBAL')).optional(),
})

/** Creates an unverified organization and a CRM lead. It grants no login and skips no KYC step. */
router.post('/directory/:id/promote', requireRole(...DIRECTORY_PROMOTE_ROLES), validId, async (req, res) => {
  const parsed = promoteSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, 'Check the contact type, country and corridor.')
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM directory_organizations WHERE directory_id = $1 FOR UPDATE', [req.params.id])
    const entry = rows[0]
    if (!entry) return { status: 404, message: 'Directory entry not found.' }
    if (entry.promoted_org_id) return { status: 409, message: 'This entry is already in the CRM.' }
    if (!entry.tax_identifier) return { status: 422, message: 'A tax ID is required before adding this entry to the CRM.' }
    const spanish = entry.source_type === 'ASSOCIATIONS'
    const country = parsed.data.country || (spanish ? 'ESP' : null)
    const corridor = parsed.data.region_corridor || (spanish ? 'SPAIN_EU' : null)
    if (!country || !corridor) return { status: 422, message: 'Choose the country and corridor for this entry.' }
    const taken = await client.query('SELECT 1 FROM organizations WHERE LOWER(legal_name) = LOWER($1)', [entry.name.slice(0, 255)])
    if (taken.rowCount) return { status: 409, message: 'An organization with this name already exists.' }
    const org = await client.query(
      `INSERT INTO organizations (legal_name, tax_id, country, region_corridor, org_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING org_id`,
      [entry.name.slice(0, 255), entry.tax_identifier, country, corridor, parsed.data.contact_type],
    )
    const orgId = org.rows[0].org_id
    await client.query(
      `INSERT INTO crm_relationships (entity_id, contact_type, title, source, created_by)
       VALUES ($1, $2, $3, 'directory_import', $4)`,
      [orgId, parsed.data.contact_type, entry.name.slice(0, 255), req.user.sub],
    )
    await client.query('UPDATE directory_organizations SET promoted_org_id = $2, updated_at = now() WHERE directory_id = $1', [entry.directory_id, orgId])
    return { orgId }
  })
  if (result.status) return fail(res, result.status, result.message)
  await writeAudit(req.user.sub, 'DIRECTORY_PROMOTED', 'directory_organizations', req.params.id, { org_id: result.orgId })
  return res.status(201).json({ data: { org_id: result.orgId }, message: 'Added to the CRM as an unverified lead.' })
})

// ----- Import batches -----

router.get('/', canImport, async (_req, res) => {
  // A server restart interrupts parsing; never leave such an import looking active.
  await query(
    `WITH stale AS (
       UPDATE import_batches SET status = 'FAILED', error = 'Processing was interrupted. Upload the file again.'
       WHERE status = 'PARSING' AND created_at < now() - interval '1 hour' RETURNING batch_id
     )
     DELETE FROM import_staging s USING stale WHERE s.batch_id = stale.batch_id`,
  )
  const { rows } = await query(
    `SELECT b.*, u.name AS created_by_name FROM import_batches b LEFT JOIN users u ON u.id = b.created_by
     ORDER BY b.created_at DESC LIMIT 50`,
  )
  return res.json({ data: rows })
})

router.post('/preview', canImport, upload.single('file'), async (req, res) => {
  if (!req.file) return fail(res, 400, 'Upload an .xlsx or .csv file.')
  // Multer decodes file names as latin1.
  const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 255)
  const { rows } = await query(
    'INSERT INTO import_batches (file_name, created_by) VALUES ($1, $2) RETURNING batch_id, file_name, status',
    [fileName, req.user.sub],
  )
  await writeAudit(req.user.sub, 'DATA_IMPORT_UPLOADED', 'import_batches', rows[0].batch_id, { file: fileName })
  // Large registries take a while to parse; the screen polls the batch status.
  processUpload(rows[0].batch_id, req.file.path, fileName).catch(() => {})
  return res.status(202).json({ data: rows[0] })
})

router.get('/:id', canImport, validId, async (req, res) => {
  const { rows } = await query('SELECT * FROM import_batches WHERE batch_id = $1', [req.params.id])
  if (!rows[0]) return fail(res, 404, 'Import not found.')
  return res.json({ data: rows[0] })
})

router.get('/:id/rows', canImport, validId, async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : null
  const current = page(req.query.page)
  const { rows } = await query(
    `SELECT staging_id, sheet, row_no, normalized, validation_status, issues FROM import_staging
     WHERE batch_id = $1 AND ($2::text IS NULL OR validation_status = $2)
     ORDER BY sheet, row_no LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`,
    [req.params.id, status],
  )
  return res.json({ data: rows, page: current, page_size: PAGE_SIZE })
})

router.post('/:id/confirm', canImport, validId, async (req, res) => {
  const data = await confirmBatch(req.params.id, req.user.sub)
  return res.json({ data, message: `${data.imported} records added to the directory.` })
})

router.post('/:id/cancel', canImport, validId, async (req, res) => {
  await cancelBatch(req.params.id, req.user.sub)
  return res.json({ message: 'Import canceled and its staged data removed.' })
})

router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    return fail(res, error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 150 MB.' : 'Upload one file.')
  }
  return next(error)
})

export default router
