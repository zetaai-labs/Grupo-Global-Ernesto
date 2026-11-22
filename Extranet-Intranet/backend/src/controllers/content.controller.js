import { z } from 'zod'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { withRegion } from '../services/scope.js'
import { hasFolderPermission } from '../middleware/folderPermission.js'
import { STAFF_ROLES, OPERATIONS_ROLES } from '../config/roles.js'

export async function listMySubmissions(req, res) {
  const { rows } = await query(
    `SELECT id, original_name, size_bytes, status, message, created_at
     FROM received_files WHERE LOWER(sender_email) = LOWER($1)
     ORDER BY id DESC`,
    [req.user.email],
  )
  return res.json({ data: rows })
}

export async function createMySubmission(req, res) {
  if (!req.file) return res.status(400).json({ message: 'A file is required.' })
  const { rows } = await query(
    `INSERT INTO received_files
       (original_name, stored_name, size_bytes, mime_type, sender_name, sender_email, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, original_name, status, created_at`,
    [
      req.file.originalname,
      req.file.filename,
      req.file.size,
      req.file.mimetype,
      req.user.name || req.user.email,
      req.user.email,
      String(req.body?.message || '').slice(0, 1000) || null,
    ],
  )
  await writeAudit(req.user.sub, 'SUBMISSION_UPLOADED', 'received_files', rows[0].id)
  await notifyRoles(OPERATIONS_ROLES, {
    type: 'received-file',
    title: `New submission: ${req.file.originalname}`,
    body: `From ${req.user.name || req.user.email}`,
    link: '/intranet/web-received-files',
  })
  return res.status(201).json({ data: rows[0] })
}

const announcementSchema = z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1) })

export async function listAnnouncements(req, res) {
  const scoped = withRegion(req, 'WHERE 1=1', [], 'a')
  const { rows } = await query(
    `SELECT a.id, a.title, a.body, a.region, a.created_at, u.name AS author
     FROM announcements a LEFT JOIN users u ON u.id = a.created_by
     ${scoped.sql} ORDER BY a.id DESC LIMIT 100`,
    scoped.params,
  )
  return res.json({ data: rows })
}

export async function createAnnouncement(req, res) {
  const parsed = announcementSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ message: 'Title and body are required.' })
  const { rows } = await query(
    `INSERT INTO announcements (title, body, region, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id, title, body, created_at`,
    [parsed.data.title, parsed.data.body, req.user.region, req.user.sub],
  )
  await writeAudit(req.user.sub, 'ANNOUNCEMENT_CREATED', 'announcements', rows[0].id)
  await notifyRoles(STAFF_ROLES, {
    type: 'announcement',
    title: `Announcement: ${parsed.data.title}`,
    body: parsed.data.body.slice(0, 140),
    link: '/intranet/system-web-page',
  }, req.user.sub)
  return res.status(201).json({ data: rows[0] })
}

export async function listLinkedFolders(req, res) {
  const { rows } = await query(
    `SELECT lf.id, lf.label, lf.folder_id, f.name AS folder_name
     FROM linked_folders lf JOIN folders f ON f.id = lf.folder_id
     WHERE lf.user_id = $1 AND f.deleted_at IS NULL
     ORDER BY lf.id`,
    [req.user.sub],
  )
  return res.json({ data: rows })
}

const linkedSchema = z.object({ folder_id: z.coerce.number().int().positive(), label: z.string().trim().min(1).max(150) })

export async function addLinkedFolder(req, res) {
  const parsed = linkedSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ message: 'A folder and label are required.' })
  if (!(await hasFolderPermission(req, parsed.data.folder_id, 'view'))) {
    return res.status(403).json({ message: 'You do not have access to this folder.' })
  }
  try {
    const { rows } = await query(
      `INSERT INTO linked_folders (user_id, folder_id, label)
       VALUES ($1, $2, $3) RETURNING id, label, folder_id`,
      [req.user.sub, parsed.data.folder_id, parsed.data.label],
    )
    return res.status(201).json({ data: rows[0] })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'This folder is already linked.' })
    throw error
  }
}

export async function removeLinkedFolder(req, res) {
  const { rowCount } = await query(
    'DELETE FROM linked_folders WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.sub],
  )
  if (!rowCount) return res.status(404).json({ message: 'Link not found.' })
  return res.json({ message: 'Linked folder removed.' })
}
