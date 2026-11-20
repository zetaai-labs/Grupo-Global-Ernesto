import fs from 'node:fs'
import path from 'node:path'
import { query, withTransaction } from '../config/database.js'
import { config } from '../config/env.js'
import { hasFolderPermission } from '../middleware/folderPermission.js'
import { withRegion } from './scope.js'
import { removeStoredFiles } from './storage.service.js'

const SUBTREE = `
  WITH RECURSIVE tree AS (
    SELECT id FROM folders WHERE id = ANY($1::int[])
    UNION ALL
    SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id
  )`

const unlinkStored = (storedNames) => removeStoredFiles(storedNames)

/**
 * Deleted items visible to this user. Admins see everything; other users see
 * items they deleted or items in folders they can edit, within their region.
 */
export async function listDeleted(req) {
  const folders = withRegion(req, 'SELECT id, name, region, parent_id AS folder_id, deleted_at, deleted_by FROM folders WHERE deleted_at IS NOT NULL', [])
  const files = withRegion(req, 'SELECT id, name, region, folder_id, deleted_at, deleted_by FROM files WHERE deleted_at IS NOT NULL', [])

  const [folderRows, fileRows] = await Promise.all([
    query(folders.sql, folders.params),
    query(files.sql, files.params),
  ])

  const items = [
    ...folderRows.rows.map((row) => ({ ...row, type: 'folder', permissionFolder: row.id })),
    ...fileRows.rows.map((row) => ({ ...row, type: 'file', permissionFolder: row.folder_id })),
  ]

  const visible = []
  for (const item of items) {
    if (await canManage(req, item)) {
      const { permissionFolder, deleted_by, ...rest } = item
      visible.push({ ...rest, id: String(rest.id), deleted_by_me: deleted_by === req.user.sub })
    }
  }
  return visible.sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at))
}

async function canManage(req, item) {
  if (req.user.role === 'admin') return true
  if (item.deleted_by === req.user.sub) return true
  return item.permissionFolder ? hasFolderPermission(req, item.permissionFolder, 'edit') : false
}

async function findDeleted(req, type, id) {
  const table = type === 'folder' ? 'folders' : 'files'
  const parentColumn = type === 'folder' ? 'parent_id' : 'folder_id'
  const scoped = withRegion(
    req,
    `SELECT id, ${parentColumn} AS parent, deleted_at, deleted_by FROM ${table}
     WHERE id = $1 AND deleted_at IS NOT NULL`,
    [id],
  )
  const { rows } = await query(scoped.sql, scoped.params)
  const row = rows[0]
  if (!row) return null
  return { ...row, permissionFolder: type === 'folder' ? row.id : row.parent }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

export async function restore(req, type, id) {
  const item = await findDeleted(req, type, id)
  if (!item) throw httpError(404, 'Item not found in recycle bin.')
  if (!(await canManage(req, item))) throw httpError(403, 'You cannot restore this item.')

  if (item.parent) {
    const parent = await query('SELECT deleted_at FROM folders WHERE id = $1', [item.parent])
    if (parent.rows[0]?.deleted_at) {
      throw httpError(409, 'Its parent folder is in the recycle bin. Restore the parent folder first.')
    }
  }

  if (type === 'file') {
    await query('UPDATE files SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', [id])
    return
  }

  // Restore the folder together with everything deleted in the same operation.
  await withTransaction(async (client) => {
    const tree = await client.query(
      `${SUBTREE} UPDATE folders SET deleted_at = NULL, deleted_by = NULL
       WHERE id IN (SELECT id FROM tree) AND deleted_at = $2 RETURNING id`,
      [[Number(id)], item.deleted_at],
    )
    await client.query(
      `UPDATE files SET deleted_at = NULL, deleted_by = NULL
       WHERE folder_id = ANY($1::int[]) AND deleted_at = $2`,
      [tree.rows.map((row) => row.id), item.deleted_at],
    )
  })
}

/** Permanent deletion is restricted to administrators (security policy). */
export async function purge(req, type, id) {
  if (req.user.role !== 'admin') {
    throw httpError(403, 'Only administrators can permanently delete items.')
  }
  const item = await findDeleted(req, type, id)
  if (!item) throw httpError(404, 'Item not found in recycle bin.')

  if (type === 'file') await purgeFiles([Number(id)])
  else await purgeFolders([Number(id)])
}

async function purgeFiles(ids) {
  if (!ids.length) return 0
  const { rows } = await query('DELETE FROM files WHERE id = ANY($1::int[]) RETURNING stored_name', [ids])
  await unlinkStored(rows.map((row) => row.stored_name))
  return rows.length
}

async function purgeFolders(ids) {
  if (!ids.length) return 0
  const stored = await query(
    `${SUBTREE} SELECT stored_name FROM files WHERE folder_id IN (SELECT id FROM tree)`,
    [ids],
  )
  const { rowCount } = await query('DELETE FROM folders WHERE id = ANY($1::int[])', [ids])
  await unlinkStored(stored.rows.map((row) => row.stored_name))
  return rowCount
}

/** Retention policy: permanently remove items that have been in the bin longer than `days`. */
export async function purgeExpired(days) {
  const folders = await query(
    `SELECT id FROM folders f
     WHERE deleted_at < now() - make_interval(days => $1)
       AND NOT EXISTS (SELECT 1 FROM folders p WHERE p.id = f.parent_id AND p.deleted_at IS NOT NULL)`,
    [days],
  )
  const purgedFolders = await purgeFolders(folders.rows.map((row) => row.id))

  const files = await query(
    'SELECT id FROM files WHERE deleted_at < now() - make_interval(days => $1)',
    [days],
  )
  const purgedFiles = await purgeFiles(files.rows.map((row) => row.id))
  return { folders: purgedFolders, files: purgedFiles }
}
