import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { query } from '../config/database.js'
import { config } from '../config/env.js'
import { writeAudit } from '../services/audit.js'
import { sendStoredFile } from '../services/storage.service.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { SHARE_RECIPIENT_ROLES } from '../config/roles.js'
import { permittedFolderIds, hasFolderPermission } from '../middleware/folderPermission.js'

const shareSchema = z.object({
  folder_id: z.coerce.number().int().positive(),
  user_id: z.coerce.number().int().positive(),
})

export async function listShares(req, res) {
  const permitted = await permittedFolderIds(req)
  if (permitted && !permitted.length) return res.json({ data: [] })
  const { rows } = await query(
    `SELECT es.id, es.folder_id, f.name AS folder_name, es.user_id,
            u.name AS user_name, u.email AS user_email, es.created_at
     FROM external_shares es
     JOIN folders f ON f.id = es.folder_id
     JOIN users u ON u.id = es.user_id
     WHERE $1::int[] IS NULL OR es.folder_id = ANY($1::int[])
     ORDER BY es.id DESC`,
    [permitted],
  )
  return res.json({ data: rows })
}

export async function createShare(req, res) {
  const parsed = shareSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ message: 'A folder and a user are required.' })
  const { folder_id, user_id } = parsed.data

  const folder = await query('SELECT 1 FROM folders WHERE id = $1 AND deleted_at IS NULL', [folder_id])
  if (!folder.rowCount) return res.status(400).json({ message: 'Folder does not exist.' })
  if (!(await hasFolderPermission(req, folder_id, 'share'))) {
    return res.status(403).json({ message: 'You do not have permission to share this folder.' })
  }

  const partner = await query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND r.name = ANY($2::text[]) AND u.status = 'active'`,
    [user_id, SHARE_RECIPIENT_ROLES],
  )
  if (!partner.rowCount) return res.status(400).json({ message: 'User is not an active external account (partner, client, supplier or investor).' })

  try {
    const { rows } = await query(
      `INSERT INTO external_shares (folder_id, user_id, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, folder_id, user_id, created_at`,
      [folder_id, user_id, req.user.sub],
    )
    // Reading a shared folder implies view permission on its files.
    await query(
      `INSERT INTO folder_permissions (folder_id, user_id, can_view, can_edit, can_share)
       VALUES ($1, $2, true, false, false)
       ON CONFLICT DO NOTHING`,
      [folder_id, user_id],
    )

    await writeAudit(req.user.sub, 'EXTERNAL_SHARE_CREATED', 'external_shares', rows[0].id)
    const shared = await query('SELECT name FROM folders WHERE id = $1', [folder_id])
    await notify([user_id], {
      type: 'share',
      title: `New folder shared with you: ${shared.rows[0]?.name || 'folder'}`,
      body: `Shared by ${req.user.name}`,
      link: '/extranet/shared-documents',
    })
    return res.status(201).json({ data: rows[0] })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'This folder is already shared with that user.' })
    throw error
  }
}

export async function deleteShare(req, res) {
  const share = await query('SELECT folder_id FROM external_shares WHERE id = $1', [req.params.id])
  if (!share.rowCount) return res.status(404).json({ message: 'Share not found.' })
  if (!(await hasFolderPermission(req, share.rows[0].folder_id, 'share'))) {
    return res.status(403).json({ message: 'You cannot remove this share.' })
  }
  await query('DELETE FROM external_shares WHERE id = $1', [req.params.id])
  await writeAudit(req.user.sub, 'EXTERNAL_SHARE_REVOKED', 'external_shares', req.params.id)
  return res.json({ message: 'Share revoked.' })
}

/** Partner view: folders shared with the logged-in account and their files. */
export async function sharedWithMe(req, res) {
  const { rows } = await query(
    `SELECT f.id, f.name, f.region,
            (SELECT COUNT(*)::int FROM files fl
              WHERE fl.folder_id = f.id AND fl.deleted_at IS NULL) AS file_count
     FROM external_shares es
     JOIN folders f ON f.id = es.folder_id AND f.deleted_at IS NULL
     WHERE es.user_id = $1
     ORDER BY f.id`,
    [req.user.sub],
  )

  const { rows: files } = await query(
    `SELECT fl.id, fl.name, fl.size_bytes, fl.mime_type, fl.folder_id, fl.created_at
     FROM files fl
     JOIN external_shares es ON es.folder_id = fl.folder_id
     WHERE es.user_id = $1 AND fl.deleted_at IS NULL
     ORDER BY fl.created_at DESC`,
    [req.user.sub],
  )

  return res.json({ data: { folders: rows, files } })
}

/** MetaLinks pointing at files in folders shared with the account. */
export async function sharedLinks(req, res) {
  const { rows } = await query(
    `SELECT m.id, m.token, m.label, m.expires_at, m.max_downloads, m.downloads_count,
            f.name AS file_name
     FROM metalinks m
     JOIN files fl ON fl.id = m.file_id
     JOIN folders f ON f.id = fl.folder_id
     JOIN external_shares es ON es.folder_id = f.id
     WHERE es.user_id = $1 AND m.expires_at > now()
     ORDER BY m.id DESC`,
    [req.user.sub],
  )
  return res.json({ data: rows })
}

/** External accounts (partner, client, supplier) that folders can be shared with. */
export async function listRecipients(_req, res) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = ANY($1::text[]) AND u.status = 'active'
     ORDER BY u.name`,
    [SHARE_RECIPIENT_ROLES],
  )
  return res.json({ data: rows })
}

/** Download a file from a folder that has been shared with this external account. */
export async function downloadSharedFile(req, res) {
  const { rows } = await query(
    `SELECT fl.name, fl.stored_name, fl.mime_type
     FROM files fl
     JOIN folders f ON f.id = fl.folder_id AND f.deleted_at IS NULL
     JOIN external_shares es ON es.folder_id = fl.folder_id
     WHERE fl.id = $1 AND es.user_id = $2 AND fl.deleted_at IS NULL`,
    [req.params.id, req.user.sub],
  )
  const file = rows[0]
  if (!file) return res.status(404).json({ message: 'File not found or not shared with you.' })

  await writeAudit(req.user.sub, 'SHARED_FILE_DOWNLOADED', 'files', req.params.id)
  const sent = await sendStoredFile(res, file.stored_name, file.name, file.mime_type)
  if (!sent) return res.status(404).json({ message: 'File is missing from storage.' })
  return undefined
}
