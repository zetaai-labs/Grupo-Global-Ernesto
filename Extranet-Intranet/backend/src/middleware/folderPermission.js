import { query } from '../config/database.js'
import { orgPredicate } from '../services/scope.js'

function requestedFolderId(req) {
  const raw = req.params.id || req.body?.folder_id || req.query.folder_id
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Returns folder ids the user may view, or null for admins (all folders). */
export async function permittedFolderIds(req) {
  if (req.user?.role === 'admin') return null
  const { rows } = await query(
    `SELECT DISTINCT fp.folder_id
     FROM folder_permissions fp JOIN folders f ON f.id = fp.folder_id
     WHERE fp.can_view = true
       AND (fp.user_id = $1 OR (fp.role_name = $2 AND ${orgPredicate('f.org_id', '$3')}))`,
    [req.user.sub, req.user.role, req.user.org_scope ?? null],
  )
  return rows.map((row) => row.folder_id)
}

export async function hasFolderPermission(req, folderId, level = 'view') {
  if (req.user?.role === 'admin') return true
  const column = `can_${level}`
  if (!['view', 'edit', 'share'].includes(level)) return false
  const { rowCount } = await query(
    `SELECT 1 FROM folder_permissions fp JOIN folders f ON f.id = fp.folder_id
     WHERE fp.folder_id = $1 AND fp.${column} = true
       AND (fp.user_id = $2 OR (fp.role_name = $3 AND ${orgPredicate('f.org_id', '$4')}))`,
    [folderId, req.user.sub, req.user.role, req.user.org_scope ?? null],
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
