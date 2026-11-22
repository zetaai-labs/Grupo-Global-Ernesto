import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { query } from '../config/database.js'
import { config } from '../config/env.js'
import { writeAudit } from '../services/audit.js'
import { sendStoredFile } from '../services/storage.service.js'
import { withRegion } from '../services/scope.js'
import { permittedFolderIds, hasFolderPermission } from '../middleware/folderPermission.js'

const LIST_SELECT = `
  SELECT m.id, m.token, m.label, m.expires_at, m.max_downloads, m.downloads_count,
         m.file_id, m.region, (m.password_hash IS NOT NULL) AS has_password,
         f.name AS file_name,
         (m.expires_at < now() OR m.downloads_count >= m.max_downloads) AS expired
  FROM metalinks m
  JOIN files f ON f.id = m.file_id
`

const createSchema = z.object({
  file_id: z.coerce.number().int().positive(),
  label: z.string().trim().min(1).max(150),
  expires_in_days: z.coerce.number().int().min(1).max(365).optional(),
  max_downloads: z.coerce.number().int().min(1).max(1000).optional(),
  password: z.string().min(4).max(128).optional(),
})

export async function listMetaLinks(req, res) {
  const permitted = await permittedFolderIds(req)
  if (permitted && !permitted.length) return res.json({ data: [] })
  const scoped = withRegion(req, permitted ? 'WHERE f.folder_id = ANY($1)' : 'WHERE 1=1', permitted ? [permitted] : [], 'm')
  const { rows } = await query(`${LIST_SELECT} ${scoped.sql} ORDER BY m.id DESC`, scoped.params)
  return res.json({ data: rows })
}

export async function createMetaLink(req, res) {
  const parsed = createSchema.safeParse(req.body || {})
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid link data.', issues: parsed.error.issues })
  }
  const { file_id, label, expires_in_days, max_downloads, password } = parsed.data

  const file = await query('SELECT folder_id FROM files WHERE id = $1 AND deleted_at IS NULL', [file_id])
  if (!file.rowCount) return res.status(400).json({ message: 'File does not exist.' })
  if (!(await hasFolderPermission(req, file.rows[0].folder_id, 'share'))) {
    return res.status(403).json({ message: 'You do not have permission to share this file.' })
  }

  const token = randomBytes(24).toString('hex')
  const passwordHash = password ? await bcrypt.hash(password, 12) : null

  const { rows } = await query(
    `INSERT INTO metalinks
       (token, file_id, label, expires_at, max_downloads, password_hash, region, created_by)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval, $5, $6, $7, $8)
     RETURNING id, token, label, expires_at, max_downloads, (password_hash IS NOT NULL) AS has_password`,
    [
      token,
      file_id,
      label,
      String(expires_in_days || 7),
      max_downloads || 10,
      passwordHash,
      req.user.region,
      req.user.sub,
    ],
  )

  await writeAudit(req.user.sub, 'METALINK_CREATED', 'metalinks', rows[0].id)
  return res.status(201).json({ data: rows[0] })
}

export async function deleteMetaLink(req, res) {
  const link = await query(
    'SELECT m.created_by, f.folder_id FROM metalinks m JOIN files f ON f.id = m.file_id WHERE m.id = $1',
    [req.params.id],
  )
  if (!link.rowCount) return res.status(404).json({ message: 'MetaLink not found.' })
  if (link.rows[0].created_by !== req.user.sub && !(await hasFolderPermission(req, link.rows[0].folder_id, 'share'))) {
    return res.status(403).json({ message: 'You cannot delete this link.' })
  }
  await query('DELETE FROM metalinks WHERE id = $1', [req.params.id])

  await writeAudit(req.user.sub, 'METALINK_DELETED', 'metalinks', req.params.id)
  return res.json({ message: 'MetaLink deleted.' })
}

/** Public download: token-based, optional password, atomic download counter. */
export async function downloadByToken(req, res) {
  const { rows } = await query(
    `SELECT m.id, m.password_hash, f.name, f.stored_name
     FROM metalinks m JOIN files f ON f.id = m.file_id
     WHERE m.token = $1`,
    [req.params.token],
  )
  const link = rows[0]
  if (!link) return res.status(404).json({ message: 'Link not found.' })

  if (link.password_hash) {
    const supplied = req.query.password || req.body?.password || ''
    if (!(await bcrypt.compare(String(supplied), link.password_hash))) {
      return res.status(401).json({ message: 'Invalid link password.' })
    }
  }

  // Atomic: only one download per allowed slot, even under concurrent requests.
  const claimed = await query(
    `UPDATE metalinks SET downloads_count = downloads_count + 1
     WHERE id = $1 AND downloads_count < max_downloads AND expires_at > now()
     RETURNING id`,
    [link.id],
  )
  if (!claimed.rowCount) {
    return res.status(410).json({ message: 'This link has expired or reached its download limit.' })
  }

  // Never write the token into the audit log.
  await writeAudit(null, 'METALINK_DOWNLOADED', 'metalinks', link.id)
  const sent = await sendStoredFile(res, link.stored_name, link.name)
  if (!sent) return res.status(404).json({ message: 'File is missing from storage.' })
  return undefined
}
