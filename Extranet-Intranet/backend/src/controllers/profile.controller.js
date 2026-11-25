import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import { config } from '../config/env.js'
import { query, withTransaction } from '../config/database.js'
import { STAFF_ROLES, isExternal } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { notifyRoles } from '../services/notification.service.js'
import { sendMail, smtpConfigured } from '../services/email.service.js'
import { persistUpload, removeStoredFiles, sendStoredFile } from '../services/storage.service.js'
import { findEntity } from '../zylax/definitions.js'
import { insertRecord } from '../zylax/engine.controller.js'
import { rules } from '../zylax/rules.js'

/** Profile photo, support contact and "Report a problem". */

const fail = (status, message) => Object.assign(new Error(message), { status })
const MAX_BYTES = 2 * 1024 * 1024
const TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }

// ---------------------------------------------------------------- Profile photo
export const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, config.uploadDir),
    filename: (_req, file, callback) => callback(null, `avatar-${Date.now()}-${randomUUID()}${TYPES[file.mimetype] || '.img'}`),
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, Boolean(TYPES[file.mimetype])),
}).single('photo')

/** The file's first bytes must really be a PNG, JPEG or WebP image (the browser's type is not trusted). */
function realImageType(filePath) {
  const fd = fs.openSync(filePath, 'r')
  const head = Buffer.alloc(12)
  fs.readSync(fd, head, 0, 12, 0)
  fs.closeSync(fd)
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

/** Runs multer and checks the file before it is encrypted and kept. */
export function receiveAvatar(req, res, next) {
  avatarUpload(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') return next(fail(400, 'The photo must be 2 MB or smaller.'))
    if (error) return next(fail(400, 'The photo could not be uploaded.'))
    if (!req.file) return next(fail(400, 'Choose a PNG, JPEG or WebP photo.'))
    const type = realImageType(req.file.path)
    if (!type) {
      fs.rmSync(req.file.path, { force: true })
      return next(fail(400, 'Choose a PNG, JPEG or WebP photo.'))
    }
    req.file.mimetype = type
    return persistUpload(req, res, next)
  })
}

export async function saveAvatar(req, res) {
  const { rows } = await query('SELECT avatar_file FROM users WHERE id = $1', [req.user.sub])
  const updated = await query(
    'UPDATE users SET avatar_file = $2, avatar_updated_at = now() WHERE id = $1 RETURNING avatar_updated_at',
    [req.user.sub, req.file.filename],
  )
  if (rows[0]?.avatar_file) await removeStoredFiles([rows[0].avatar_file])
  await writeAudit(req.user.sub, 'PROFILE_PHOTO_UPDATED', 'users', String(req.user.sub))
  return res.json({ data: { avatar_version: new Date(updated.rows[0].avatar_updated_at).getTime() }, message: 'Profile photo saved.' })
}

export async function deleteAvatar(req, res) {
  const { rows } = await query('SELECT avatar_file FROM users WHERE id = $1', [req.user.sub])
  await query('UPDATE users SET avatar_file = NULL, avatar_updated_at = NULL WHERE id = $1', [req.user.sub])
  if (rows[0]?.avatar_file) await removeStoredFiles([rows[0].avatar_file])
  await writeAudit(req.user.sub, 'PROFILE_PHOTO_REMOVED', 'users', String(req.user.sub))
  return res.json({ data: { avatar_version: null }, message: 'Profile photo removed.' })
}

/**
 * GET /api/users/:id/avatar — staff see everyone's photo; external users see staff photos and their own
 * (never other companies' people).
 */
export async function showAvatar(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) throw fail(400, 'Invalid person.')
  const { rows } = await query(
    `SELECT u.avatar_file, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.status = 'active'`,
    [id],
  )
  const person = rows[0]
  if (!person?.avatar_file) throw fail(404, 'No photo.')
  if (isExternal(req.user.role) && id !== req.user.sub && !STAFF_ROLES.includes(person.role)) throw fail(404, 'No photo.')
  res.setHeader('Cache-Control', 'private, max-age=86400')
  const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(person.avatar_file)] || 'application/octet-stream'
  const sent = await sendStoredFile(res, person.avatar_file, `photo${path.extname(person.avatar_file)}`, type, { inline: true })
  if (!sent) throw fail(404, 'No photo.')
  return undefined
}

// ---------------------------------------------------------------- Support
export function supportContact() {
  return {
    email: String(process.env.SUPPORT_EMAIL || 'support@grupoglobal.es').trim(),
    phone: String(process.env.SUPPORT_PHONE || '').trim() || null,
    hours: String(process.env.SUPPORT_HOURS || '').trim() || null,
  }
}

/** GET /api/support — how to reach the support team. */
export function supportInfo(_req, res) {
  return res.json({ data: supportContact() })
}

const CATEGORIES = { access: ['ACCESS', 'ACCESS'], bug: ['SOFTWARE', 'TECHNICAL'], question: ['OTHER', 'OTHER'], billing: ['OTHER', 'BILLING'] }

/**
 * POST /api/support/requests { category, subject, message, page } — "Report a problem".
 * Staff get a HelpDesk ticket; clients, partners and suppliers a Client Support ticket for their company.
 * The support team is alerted in the app and, when e-mail is set up, at SUPPORT_EMAIL.
 */
export async function createSupportRequest(req, res) {
  const subject = String(req.body?.subject || '').trim()
  const message = String(req.body?.message || '').trim()
  const category = CATEGORIES[req.body?.category] ? req.body.category : 'question'
  const page = String(req.body?.page || '').slice(0, 300)
  if (subject.length < 3 || subject.length > 150) throw fail(400, 'Write a short subject (3 to 150 characters).')
  if (message.length < 10 || message.length > 4000) throw fail(400, 'Describe the problem (10 to 4,000 characters).')
  const device = String(req.get('user-agent') || '').slice(0, 300)
  const description = `${message}\n\n---\nPage: ${page || '—'}\nDevice: ${device || '—'}\nReported by: ${req.user.name || ''} (${req.user.email || ''})`

  const staff = STAFF_ROLES.includes(req.user.role)
  const external = ['client', 'partner', 'supplier'].includes(req.user.role) && req.user.org_id
  let ticket = null
  if (staff || external) {
    const [moduleKey, index] = staff ? ['helpdesk', 0] : ['client_support', 1]
    const def = findEntity(moduleKey, 'tickets')
    const draft = { data: { category: CATEGORIES[category][index], priority: 'P3', description, ...(staff ? {} : { customer: req.user.org_id }) } }
    await rules.sla.create(null, draft)
    ticket = await withTransaction((client) => insertRecord(client, moduleKey, def, {
      title: subject, data: draft.data, customer_org_id: staff ? null : req.user.org_id,
    }, req.user.sub, req.user.org_id))
  }

  const ref = ticket?.ref_no || null
  await notifyRoles(staff ? ['admin', 'tech_admin'] : ['admin', 'tech_admin', 'manager'], {
    type: 'support', title: 'New support request', body: `${ref ? `${ref} · ` : ''}${subject}`,
    link: ticket ? `/intranet/zylax/${staff ? 'helpdesk' : 'client_support'}` : null,
  }, req.user.sub)
  if (smtpConfigured()) {
    await sendMail({
      to: supportContact().email,
      subject: `[Support]${ref ? ` ${ref}` : ''} ${subject}`,
      text: `${description}\n\nRole: ${req.user.role}${ref ? `\nTicket: ${ref}` : ''}`,
    }).catch(() => {})
  }
  await writeAudit(req.user.sub, 'SUPPORT_REQUEST', 'zx_records', ticket?.record_id || null, { category, ref })
  return res.status(201).json({ data: { ref }, message: ref ? 'Your request was sent.' : 'Your request was sent to the support team.' })
}
