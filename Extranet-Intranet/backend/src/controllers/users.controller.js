import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { exportUserData, eraseUser } from '../services/gdpr.service.js'

const USER_LIST_QUERY = `
  SELECT u.id, u.name, u.email, u.status, r.name AS role, rg.code AS region, u.created_at
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN regions rg ON rg.id = u.region_id
  ORDER BY u.id
`

export async function listMetadata(_req, res) {
  const [roles, regions] = await Promise.all([
    query('SELECT id, name FROM roles ORDER BY id'),
    query('SELECT id, code, name FROM regions ORDER BY id'),
  ])
  return res.json({ data: { roles: roles.rows, regions: regions.rows } })
}

export async function createUser(req, res) {
  const { name, email, password, role_id, region_id } = req.body || {}
  if (!name || !email || !password || !role_id) {
    return res.status(400).json({ message: 'Name, email, password and role are required.' })
  }

  const passwordHash = await bcrypt.hash(String(password), 12)
  try {
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role_id, region_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role_id, region_id, status`,
      [name, email, passwordHash, role_id, region_id || null],
    )
    await writeAudit(req.user.sub, 'USER_CREATED', 'users', rows[0].id, { email })
    return res.status(201).json({ data: rows[0] })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'An account with this email already exists.' })
    }
    throw error
  }
}

export async function listUsers(_req, res) {
  const { rows } = await query(USER_LIST_QUERY)
  return res.json({ data: rows })
}

export async function getUser(req, res) {
  const { rows } = await query(`${USER_LIST_QUERY} WHERE u.id = $1`, [req.params.id])
  if (!rows[0]) return res.status(404).json({ message: 'User not found.' })
  return res.json({ data: rows[0] })
}

export async function updateUserStatus(req, res) {
  const { status } = req.body || {}
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ message: 'Status must be active or suspended.' })
  }

  const { rowCount } = await query("UPDATE users SET status = $1 WHERE id = $2 AND status <> 'erased'", [
    status,
    req.params.id,
  ])
  if (!rowCount) return res.status(404).json({ message: 'User not found.' })

  await query(
    'INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
    [req.user.sub, 'USER_STATUS_CHANGED', 'users', req.params.id, JSON.stringify({ status })],
  )

  return res.json({ message: 'User status updated.' })
}

/** GDPR export of any user's data (administrators). */
export async function exportUser(req, res) {
  try {
    const data = await exportUserData(req.params.id)
    await writeAudit(req.user.sub, 'USER_DATA_EXPORTED', 'users', req.params.id)
    res.setHeader('Content-Disposition', `attachment; filename="user-${req.params.id}-data.json"`)
    return res.json(data)
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message })
    throw error
  }
}

/** GDPR erasure (administrators). */
export async function eraseUserAccount(req, res) {
  try {
    await eraseUser(req.params.id, req.user.sub)
    return res.json({ message: 'User erased. Personal data was deleted or anonymised.' })
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message })
    throw error
  }
}

/** GDPR self-service: download my own data. */
export async function exportMyData(req, res) {
  const data = await exportUserData(req.user.sub)
  await writeAudit(req.user.sub, 'OWN_DATA_EXPORTED', 'users', req.user.sub)
  res.setHeader('Content-Disposition', 'attachment; filename="my-global-group-data.json"')
  return res.json(data)
}
