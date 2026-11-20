import { query } from '../config/database.js'

function requestedFolderId(req) {
  const raw = req.params.id || req.body?.folder_id || req.query.folder_id
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Returns folder ids the user may view, or null for admins (all folders). */
export async function permittedFolderIds(req) {
  if (req.user?.role === 'admin') return null
  const { rows } = await query(
    `SELECT DISTINCT folder_id
     FROM folder_permissions
     WHERE can_view = true AND (user_id = $1 OR role_name = $2)`,
    [req.user.sub, req.user.role],
  )
  return rows.map((row) => row.folder_id)
}

export async function hasFolderPermission(req, folderId, level = 'view') {
  if (req.user?.role === 'admin') return true
  const column = `can_${level}`
  if (!['view', 'edit', 'share'].includes(level)) return false
  const { rowCount } = await query(
    `SELECT 1 FROM folder_permissions
     WHERE folder_id = $1 AND ${column} = true AND (user_id = $2 OR role_name = $3)`,
    [folderId, req.user.sub, req.user.role],
  )
  return rowCount > 0
}

export function requireFolderPermission(level = 'view') {
  return async (req, res, next) => {
    const folderId = requestedFolderId(req)
    if (!folderId) return res.status(400).json({ message: 'A folder is required.' })
    if (await hasFolderPermission(req, folderId, level)) return next()
    return res.status(403).json({ message: `You do not have ${level} permission on this folder.` })
  }
}
