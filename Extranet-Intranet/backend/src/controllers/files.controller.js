import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { query } from '../config/database.js'
import { config } from '../config/env.js'
import { writeAudit } from '../services/audit.js'
import { sendStoredFile } from '../services/storage.service.js'
import { withRegion } from '../services/scope.js'
import { permittedFolderIds, hasFolderPermission } from '../middleware/folderPermission.js'

const FILE_SELECT = `
  SELECT f.id, f.name, f.folder_id, f.size_bytes, f.mime_type, f.created_at,
         fo.name AS folder_name
  FROM files f
  LEFT JOIN folders fo ON fo.id = f.folder_id
`

const uploadSchema = z.object({ folder_id: z.coerce.number().int().positive() })

export async function listFiles(req, res) {
  let base = 'WHERE f.deleted_at IS NULL'
  const params = []

  if (req.query.folder_id) {
    base += ` AND f.folder_id = $${params.length + 1}`
    params.push(Number(req.query.folder_id))
  }

  const permitted = await permittedFolderIds(req)
  if (permitted && !permitted.length) return res.json({ data: [] })
  if (permitted) {
    base += ` AND f.folder_id = ANY($${params.length + 1})`
    params.push(permitted)
  }

  const scoped = withRegion(req, base, params, 'f')
  const { rows } = await query(`${FILE_SELECT} ${scoped.sql} ORDER BY f.created_at DESC`, scoped.params)
  return res.json({ data: rows })
}

export async function uploadFile(req, res) {
  const parsed = uploadSchema.safeParse(req.body || {})
  if (!parsed.success || !req.file) {
    return res.status(400).json({ message: 'A valid folder and file are required.' })
  }
  const folderId = parsed.data.folder_id

  if (!(await hasFolderPermission(req, folderId, 'edit'))) {
    return res.status(403).json({ message: 'You cannot upload to this folder.' })
  }

  const { rows: folders } = await query(
    'SELECT id, region FROM folders WHERE id = $1 AND deleted_at IS NULL',
    [folderId],
  )
  if (!folders[0]) return res.status(400).json({ message: 'Folder does not exist.' })
  if (
    req.user.region !== 'GLOBAL' &&
    folders[0].region !== 'GLOBAL' &&
    folders[0].region !== req.user.region
  ) {
    return res.status(403).json({ message: 'This folder belongs to another region.' })
  }

  const { rows } = await query(
    `INSERT INTO files (folder_id, name, stored_name, size_bytes, mime_type, region, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, folder_id, size_bytes, mime_type, region, created_at`,
    [
      folderId,
      req.file.originalname,
      req.file.filename,
      req.file.size,
      req.file.mimetype,
      req.user.region,
      req.user.sub,
    ],
  )

  await writeAudit(req.user.sub, 'FILE_UPLOADED', 'files', rows[0].id, { name: req.file.originalname })
  return res.status(201).json({ data: rows[0] })
}

async function findScopedFile(req) {
  const scoped = withRegion(
    req,
    'SELECT name, stored_name, folder_id, mime_type FROM files WHERE id = $1 AND deleted_at IS NULL',
    [req.params.id],
  )
  const { rows } = await query(scoped.sql, scoped.params)
  return rows[0]
}

export async function downloadFile(req, res) {
  const file = await findScopedFile(req)
  if (!file) return res.status(404).json({ message: 'File not found.' })
  if (!(await hasFolderPermission(req, file.folder_id, 'view'))) {
    return res.status(403).json({ message: 'You cannot view this file.' })
  }

  const sent = await sendStoredFile(res, file.stored_name, file.name, file.mime_type)
  if (!sent) return res.status(404).json({ message: 'File is missing from storage.' })
  return undefined
}

export async function deleteFile(req, res) {
  const file = await findScopedFile(req)
  if (!file) return res.status(404).json({ message: 'File not found.' })
  if (!(await hasFolderPermission(req, file.folder_id, 'edit'))) {
    return res.status(403).json({ message: 'You cannot delete this file.' })
  }

  await query('UPDATE files SET deleted_at = now(), deleted_by = $2 WHERE id = $1', [req.params.id, req.user.sub])
  await writeAudit(req.user.sub, 'FILE_DELETED', 'files', req.params.id)
  return res.json({ message: 'File moved to recycle bin.' })
}
