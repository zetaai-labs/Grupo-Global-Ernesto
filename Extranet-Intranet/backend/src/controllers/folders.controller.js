import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { withRegion } from '../services/scope.js'
import { permittedFolderIds, hasFolderPermission } from '../middleware/folderPermission.js'

const FOLDER_SELECT = `
  SELECT f.id, f.name, f.parent_id, f.is_shared, f.region, f.created_at,
         (SELECT COUNT(*)::int FROM files fl
            WHERE fl.folder_id = f.id AND fl.deleted_at IS NULL) AS file_count
  FROM folders f
`

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  parent_id: z.number().int().positive().nullable().optional(),
  is_shared: z.boolean().optional(),
})

export async function listFolders(req, res) {
  let base = 'WHERE f.deleted_at IS NULL'
  const params = []
  const permitted = await permittedFolderIds(req)
  if (permitted && !permitted.length) return res.json({ data: [] })
  if (permitted) {
    base += ` AND f.id = ANY($${params.length + 1})`
    params.push(permitted)
  }

  const scoped = withRegion(req, base, params, 'f')
  const { rows } = await query(`${FOLDER_SELECT} ${scoped.sql} ORDER BY f.id`, scoped.params)
  return res.json({ data: rows })
}

export async function createFolder(req, res) {
  const parsed = createSchema.safeParse(req.body || {})
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid folder data.', issues: parsed.error.issues })
  }
  const { name, parent_id: parentId, is_shared: isShared } = parsed.data

  let orgId = req.user.org_id || null
  if (parentId) {
    const parent = await query('SELECT org_id FROM folders WHERE id = $1 AND deleted_at IS NULL', [parentId])
    if (!parent.rowCount) return res.status(400).json({ message: 'Parent folder does not exist.' })
    if (!(await hasFolderPermission(req, parentId, 'edit'))) {
      return res.status(403).json({ message: 'You cannot create folders here.' })
    }
    orgId = parent.rows[0].org_id // Sub-folders stay in the parent's organisation.
  }

  const { rows } = await query(
    `INSERT INTO folders (name, parent_id, is_shared, region, created_by, org_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, parent_id, is_shared, region, org_id`,
    [name, parentId || null, Boolean(isShared), req.user.region, req.user.sub, orgId],
  )

  // The creator receives full permissions on the new folder.
  await query(
    `INSERT INTO folder_permissions (folder_id, user_id, can_view, can_edit, can_share)
     VALUES ($1, $2, true, true, true)`,
    [rows[0].id, req.user.sub],
  )

  await writeAudit(req.user.sub, 'FOLDER_CREATED', 'folders', rows[0].id, { name })
  return res.status(201).json({ data: rows[0] })
}

export async function listPermissions(req, res) {
  const { rows } = await query(
    `SELECT fp.id, fp.folder_id, fp.user_id, u.name AS user_name, fp.role_name,
            fp.can_view, fp.can_edit, fp.can_share
     FROM folder_permissions fp
     LEFT JOIN users u ON u.id = fp.user_id
     WHERE fp.folder_id = $1
     ORDER BY fp.id`,
    [req.params.id],
  )
  return res.json({ data: rows })
}

const permissionSchema = z.object({
  user_id: z.number().int().positive().optional().nullable(),
  role_name: z.string().trim().min(1).max(50).optional().nullable(),
  can_view: z.boolean().optional(),
  can_edit: z.boolean().optional(),
  can_share: z.boolean().optional(),
})

export async function grantPermission(req, res) {
  const parsed = permissionSchema.safeParse(req.body || {})
  if (!parsed.success || (!parsed.data.user_id && !parsed.data.role_name)) {
    return res.status(400).json({ message: 'A user or role is required.' })
  }
  const { user_id, role_name, can_view, can_edit, can_share } = parsed.data

  const { rows } = await query(
    `INSERT INTO folder_permissions (folder_id, user_id, role_name, can_view, can_edit, can_share)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id, folder_id, user_id, role_name, can_view, can_edit, can_share`,
    [
      req.params.id,
      user_id || null,
      role_name || null,
      can_view ?? true,
      can_edit ?? false,
      can_share ?? false,
    ],
  )
  if (!rows[0]) return res.status(409).json({ message: 'This permission already exists.' })

  await writeAudit(req.user.sub, 'FOLDER_PERMISSION_GRANTED', 'folders', req.params.id, {
    user_id: user_id || null,
    role_name: role_name || null,
  })
  return res.status(201).json({ data: rows[0] })
}

export async function deleteFolder(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid folder id.' })

  if (!(await hasFolderPermission(req, id, 'edit'))) {
    return res.status(403).json({ message: 'You cannot delete this folder.' })
  }

  // Soft-delete the folder, every sub-folder and all files inside them (A15).
  // One shared timestamp lets the recycle bin restore exactly this subtree later.
  const rowCount = await withTransaction(async (client) => {
    const stamp = (await client.query('SELECT now() AS t')).rows[0].t
    const folders = await client.query(
      `WITH RECURSIVE tree AS (
         SELECT id FROM folders WHERE id = $1 AND deleted_at IS NULL
         UNION ALL
         SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id WHERE f.deleted_at IS NULL
       )
       UPDATE folders SET deleted_at = $2, deleted_by = $3
       WHERE id IN (SELECT id FROM tree) RETURNING id`,
      [id, stamp, req.user.sub],
    )
    if (!folders.rowCount) return 0
    await client.query(
      `UPDATE files SET deleted_at = $2, deleted_by = $3
       WHERE folder_id = ANY($1::int[]) AND deleted_at IS NULL`,
      [folders.rows.map((row) => row.id), stamp, req.user.sub],
    )
    return folders.rowCount
  })
  if (!rowCount) return res.status(404).json({ message: 'Folder not found.' })

  await writeAudit(req.user.sub, 'FOLDER_DELETED', 'folders', id)
  return res.json({ message: 'Folder and its files moved to recycle bin.' })
}
