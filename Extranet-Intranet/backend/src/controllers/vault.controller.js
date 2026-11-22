import { z } from 'zod'
import { query } from '../config/database.js'
import { notify } from '../services/notification.service.js'
import { sendStoredFile } from '../services/storage.service.js'
import { sealProfile, openProfile, logVaultAccess, denyAndAlert } from '../services/vault.service.js'

export const TICKET_RANGES = ['EUR 100K-500K', 'EUR 500K-1M', 'EUR 1M-5M', 'EUR 5M+']
export const SECTORS = ['FINTECH', 'REAL_ESTATE', 'HEALTHCARE', 'CYBERSECURITY', 'CROSS_BORDER_TRADE']

const uuid = z.string().uuid()
const fail = (res, status, message) => res.status(status).json({ message })
const isVaultAdmin = (user) => user?.role === 'admin'
const isInvestor = (user) => user?.role === 'investor'

/** Only the Super Administrator and investors may touch the vault; everything else is a logged violation. */
export async function guardVault(req, res, next) {
  if (isVaultAdmin(req.user) || isInvestor(req.user)) return next()
  return denyAndAlert(req, res)
}

async function requireAdmin(req, res) {
  if (isVaultAdmin(req.user)) return true
  await denyAndAlert(req, res)
  return false
}

/** NDA is satisfied by a signed vault NDA or by the organisation's accepted platform NDA. */
const NDA_SQL = `(v.nda_signed OR EXISTS (
  SELECT 1 FROM nda_records n WHERE n.org_id = v.org_id AND n.accepted_at IS NOT NULL))`

async function presentInvestor(row, { withProfile }) {
  let profile = null
  if (withProfile) {
    try {
      profile = await openProfile(row.encrypted_profile)
    } catch {
      profile = { error: 'Profile could not be decrypted with the current vault key.' }
    }
  }
  return {
    investor_id: row.investor_id,
    org_id: row.org_id,
    organization: row.organization,
    investment_ticket_range: row.investment_ticket_range,
    sector_focus: row.sector_focus.split(',').filter(Boolean),
    nda_signed: row.nda_ok,
    status: row.status,
    rooms: row.rooms,
    created_at: row.created_at,
    profile,
  }
}

const INVESTOR_SELECT = `
  SELECT v.*, o.legal_name AS organization, ${NDA_SQL} AS nda_ok,
         (SELECT COUNT(*)::int FROM vault_room_access a WHERE a.investor_id = v.investor_id) AS rooms
  FROM investors_vault v LEFT JOIN organizations o ON o.org_id = v.org_id
`

// ---------------------------------------------------------------------------
// Super Administrator: investor records
// ---------------------------------------------------------------------------

export async function listInvestors(req, res) {
  if (!(await requireAdmin(req, res))) return undefined
  const { rows } = await query(`${INVESTOR_SELECT} ORDER BY v.created_at DESC`)
  await logVaultAccess(req, null, 'LIST_INVESTORS', { count: rows.length })
  // Listing shows names (decrypted) so the administrator can work; every list view is logged.
  // Small batches keep an external key service within its request limits.
  const data = []
  for (let index = 0; index < rows.length; index += 10) {
    data.push(...await Promise.all(rows.slice(index, index + 10).map((row) => presentInvestor(row, { withProfile: true }))))
  }
  return res.json({ data, meta: { ticket_ranges: TICKET_RANGES, sectors: SECTORS } })
}

const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(64).optional().nullable(),
  nationality: z.string().trim().max(64).optional().nullable(),
  bank_name: z.string().trim().max(255).optional().nullable(),
  iban: z.string().trim().max(64).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
})

const investorSchema = z.object({
  org_id: uuid.optional().nullable(),
  investment_ticket_range: z.enum(TICKET_RANGES),
  sector_focus: z.array(z.enum(SECTORS)).min(1),
  nda_signed: z.boolean().optional(),
  profile: profileSchema,
})

export async function createInvestor(req, res) {
  if (!(await requireAdmin(req, res))) return undefined
  const parsed = investorSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid investor record.')
  const data = parsed.data
  if (data.org_id) {
    const org = await query("SELECT 1 FROM organizations WHERE org_id = $1 AND org_type = 'INVESTOR'", [data.org_id])
    if (!org.rowCount) return fail(res, 400, 'Link the record to an organisation of type Investor.')
  }
  try {
    const { rows } = await query(
      `INSERT INTO investors_vault (org_id, encrypted_profile, investment_ticket_range, sector_focus, nda_signed, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING investor_id`,
      [data.org_id || null, await sealProfile(data.profile), data.investment_ticket_range, data.sector_focus.join(','), Boolean(data.nda_signed), req.user.sub],
    )
    await logVaultAccess(req, rows[0].investor_id, 'CREATE_INVESTOR')
    return res.status(201).json({ data: rows[0] })
  } catch (error) {
    if (error.code === '23505') return fail(res, 409, 'This organisation already has an investor record.')
    throw error
  }
}

export async function getInvestor(req, res) {
  if (!(await requireAdmin(req, res))) return undefined
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid investor id.')
  const { rows } = await query(`${INVESTOR_SELECT} WHERE v.investor_id = $1`, [req.params.id])
  if (!rows[0]) return fail(res, 404, 'Investor not found.')
  await logVaultAccess(req, req.params.id, 'VIEW_INVESTOR')
  return res.json({ data: { ...(await presentInvestor(rows[0], { withProfile: true })), access_audit_log: rows[0].access_audit_log.slice(-100).reverse() } })
}

export async function updateInvestor(req, res) {
  if (!(await requireAdmin(req, res))) return undefined
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid investor id.')
  const parsed = investorSchema.partial().safeParse(req.body || {})
  if (!parsed.success || !Object.keys(parsed.data).length) return fail(res, 400, 'Nothing to update.')
  const data = parsed.data
  const sets = []
  const values = [req.params.id]
  const set = (column, value) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }
  if (data.profile) set('encrypted_profile', await sealProfile(data.profile))
  if (data.investment_ticket_range) set('investment_ticket_range', data.investment_ticket_range)
  if (data.sector_focus) set('sector_focus', data.sector_focus.join(','))
  if (data.nda_signed !== undefined) set('nda_signed', data.nda_signed)
  const { rowCount } = await query(`UPDATE investors_vault SET ${sets.join(', ')}, updated_at = now() WHERE investor_id = $1`, values)
  if (!rowCount) return fail(res, 404, 'Investor not found.')
  await logVaultAccess(req, req.params.id, 'UPDATE_INVESTOR', { fields: Object.keys(data) })
  return res.json({ message: 'Investor record updated.' })
}

// ---------------------------------------------------------------------------
// Deal rooms
// ---------------------------------------------------------------------------

async function myInvestor(user) {
  if (!user.org_id) return null
  const { rows } = await query(`${INVESTOR_SELECT} WHERE v.org_id = $1 AND v.status = 'ACTIVE'`, [user.org_id])
  return rows[0] || null
}

export async function listRooms(req, res) {
  if (isVaultAdmin(req.user)) {
    const { rows } = await query(
      `SELECT r.*, (SELECT COUNT(*)::int FROM vault_documents d WHERE d.room_id = r.room_id) AS documents,
              COALESCE((SELECT json_agg(a.investor_id) FROM vault_room_access a WHERE a.room_id = r.room_id), '[]'::json) AS investors
       FROM vault_deal_rooms r ORDER BY r.created_at DESC`,
    )
    return res.json({ data: rows })
  }
  const investor = await myInvestor(req.user)
  if (!investor) return res.json({ data: [], meta: { nda_signed: false, registered: false } })
  const { rows } = await query(
    `SELECT r.room_id, r.title, r.summary, r.sector, r.ticket_range, r.status, r.created_at,
            (SELECT COUNT(*)::int FROM vault_documents d WHERE d.room_id = r.room_id) AS documents
     FROM vault_deal_rooms r JOIN vault_room_access a ON a.room_id = r.room_id
     WHERE a.investor_id = $1 ORDER BY r.created_at DESC`,
    [investor.investor_id],
  )
  await logVaultAccess(req, investor.investor_id, 'LIST_ROOMS')
  return res.json({ data: rows, meta: { nda_signed: investor.nda_ok, registered: true } })
}

const roomSchema = z.object({
  title: z.string().trim().min(3).max(255),
  summary: z.string().trim().max(5000).optional().nullable(),
  sector: z.enum(SECTORS),
  ticket_range: z.enum(TICKET_RANGES).optional().nullable(),
})

export async function createRoom(req, res) {
  if (!(await requireAdmin(req, res))) return undefined
  const parsed = roomSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid deal room.')
  const { rows } = await query(
    'INSERT INTO vault_deal_rooms (title, summary, sector, ticket_range, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING room_id',
    [parsed.data.title, parsed.data.summary || null, parsed.data.sector, parsed.data.ticket_range || null, req.user.sub],
  )
  await logVaultAccess(req, null, 'CREATE_ROOM', { room_id: rows[0].room_id })
  return res.status(201).json({ data: rows[0] })
}

export async function grantRoom(req, res) {
  if (!(await requireAdmin(req, res))) return undefined
  const investorId = String(req.body?.investor_id || '')
  if (!uuid.safeParse(req.params.roomId).success || !uuid.safeParse(investorId).success) return fail(res, 400, 'Invalid id.')
  const room = await query('SELECT title FROM vault_deal_rooms WHERE room_id = $1', [req.params.roomId])
  if (!room.rows[0]) return fail(res, 404, 'Deal room not found.')
  const investor = await query('SELECT org_id FROM investors_vault WHERE investor_id = $1', [investorId])
  if (!investor.rows[0]) return fail(res, 404, 'Investor not found.')
  await query(
    'INSERT INTO vault_room_access (room_id, investor_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [req.params.roomId, investorId, req.user.sub],
  )
  await logVaultAccess(req, investorId, 'GRANT_ROOM', { room_id: req.params.roomId })
  if (investor.rows[0].org_id) {
    const users = await query("SELECT id FROM users WHERE org_id = $1 AND status = 'active'", [investor.rows[0].org_id])
    await notify(users.rows.map((row) => row.id), { type: 'vault', title: `New deal room: ${room.rows[0].title}`, link: '/extranet/investor-vault' })
  }
  return res.status(201).json({ message: 'Access granted.' })
}

export async function revokeRoom(req, res) {
  if (!(await requireAdmin(req, res))) return undefined
  await query('DELETE FROM vault_room_access WHERE room_id = $1 AND investor_id = $2', [req.params.roomId, req.params.investorId])
  await logVaultAccess(req, uuid.safeParse(req.params.investorId).success ? req.params.investorId : null, 'REVOKE_ROOM', { room_id: req.params.roomId })
  return res.json({ message: 'Access revoked.' })
}

export async function uploadRoomDocument(req, res) {
  if (!(await requireAdmin(req, res))) return undefined
  if (!uuid.safeParse(req.params.roomId).success) return fail(res, 400, 'Invalid deal room id.')
  if (!req.file) return fail(res, 400, 'Choose a PDF, Word, Excel or image file (max 25 MB).')
  const { rows } = await query(
    `INSERT INTO vault_documents (room_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
     SELECT $1, $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM vault_deal_rooms WHERE room_id = $1)
     RETURNING document_id, original_name, size_bytes, created_at`,
    [req.params.roomId, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.sub],
  )
  if (!rows[0]) return fail(res, 404, 'Deal room not found.')
  await logVaultAccess(req, null, 'UPLOAD_DOCUMENT', { room_id: req.params.roomId, document_id: rows[0].document_id })
  return res.status(201).json({ data: rows[0] })
}

/** Room detail: admins always; investors only with access AND a signed NDA. */
async function roomAccess(req, roomId) {
  if (isVaultAdmin(req.user)) return { ok: true, investorId: null }
  const investor = await myInvestor(req.user)
  if (!investor) return { ok: false, reason: 'no-investor' }
  const access = await query('SELECT 1 FROM vault_room_access WHERE room_id = $1 AND investor_id = $2', [roomId, investor.investor_id])
  if (!access.rowCount) return { ok: false, reason: 'no-access', investorId: investor.investor_id }
  if (!investor.nda_ok) return { ok: false, reason: 'nda', investorId: investor.investor_id }
  return { ok: true, investorId: investor.investor_id }
}

export async function getRoom(req, res) {
  if (!uuid.safeParse(req.params.roomId).success) return fail(res, 400, 'Invalid deal room id.')
  const access = await roomAccess(req, req.params.roomId)
  if (!access.ok) {
    if (access.reason === 'nda') return fail(res, 403, 'Accept the confidentiality agreement (NDA) to open deal rooms.')
    return denyAndAlert(req, res)
  }
  const room = await query('SELECT room_id, title, summary, sector, ticket_range, status, created_at FROM vault_deal_rooms WHERE room_id = $1', [req.params.roomId])
  if (!room.rows[0]) return fail(res, 404, 'Deal room not found.')
  const docs = await query('SELECT document_id, original_name, size_bytes, mime_type, created_at FROM vault_documents WHERE room_id = $1 ORDER BY created_at', [req.params.roomId])
  await logVaultAccess(req, access.investorId, 'OPEN_ROOM', { room_id: req.params.roomId })
  return res.json({ data: { ...room.rows[0], documents: docs.rows } })
}

export async function downloadRoomDocument(req, res) {
  if (!uuid.safeParse(req.params.roomId).success || !uuid.safeParse(req.params.docId).success) return fail(res, 400, 'Invalid id.')
  const access = await roomAccess(req, req.params.roomId)
  if (!access.ok) {
    if (access.reason === 'nda') return fail(res, 403, 'Accept the confidentiality agreement (NDA) to download documents.')
    return denyAndAlert(req, res)
  }
  const { rows } = await query('SELECT original_name, stored_name, mime_type FROM vault_documents WHERE document_id = $1 AND room_id = $2', [req.params.docId, req.params.roomId])
  if (!rows[0]) return fail(res, 404, 'Document not found.')
  await logVaultAccess(req, access.investorId, 'DOWNLOAD_DOCUMENT', { room_id: req.params.roomId, document_id: req.params.docId })
  const sent = await sendStoredFile(res, rows[0].stored_name, rows[0].original_name, rows[0].mime_type)
  if (!sent) return fail(res, 404, 'File is missing from storage.')
  return undefined
}

/** Investor: own record (decrypted for themselves) and NDA status. */
export async function myVault(req, res) {
  if (!isInvestor(req.user)) return res.json({ data: null })
  const investor = await myInvestor(req.user)
  if (!investor) return res.json({ data: null })
  await logVaultAccess(req, investor.investor_id, 'VIEW_OWN_PROFILE')
  return res.json({ data: await presentInvestor(investor, { withProfile: true }) })
}
