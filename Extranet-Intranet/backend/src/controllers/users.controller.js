import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { exportUserData, eraseUser } from '../services/gdpr.service.js'
import { HR_MANAGED_ROLES } from '../config/roles.js'

const USER_LIST_QUERY = `
  SELECT u.id, u.uuid, u.name, u.email, u.status, r.name AS role, r.code AS role_code, rg.code AS region,
         u.org_id, o.legal_name AS organization, u.mfa_enabled, u.created_at
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN regions rg ON rg.id = u.region_id
  LEFT JOIN organizations o ON o.org_id = u.org_id
`

export async function listMetadata(_req, res) {
  const [roles, regions, organizations] = await Promise.all([
    query('SELECT id, name, code, authority_level FROM roles ORDER BY id'),
    query('SELECT id, code, name FROM regions ORDER BY id'),
    query(`SELECT org_id, legal_name, org_type FROM organizations
           WHERE verification_status = 'VERIFIED' ORDER BY (org_type IN ('PARENT', 'BUSINESS_UNIT')) DESC, legal_name`),
  ])
  return res.json({ data: { roles: roles.rows, regions: regions.rows, organizations: organizations.rows } })
}

/** Only the Super Administrator may create privileged accounts (Schema Document §3). */
const PRIVILEGED_ROLES = ['admin', 'tech_admin']

export async function createUser(req, res) {
  const { name, email, password, role_id, region_id, org_id } = req.body || {}
  if (!name || !email || !password || !role_id) {
    return res.status(400).json({ message: 'Name, email, password and role are required.' })
  }
  if (String(password).length < 10) {
    return res.status(400).json({ message: 'Password must be at least 10 characters.' })
  }

  const role = await query('SELECT name FROM roles WHERE id = $1', [role_id])
  if (!role.rows[0]) return res.status(400).json({ message: 'Unknown role.' })
  if (PRIVILEGED_ROLES.includes(role.rows[0].name) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only the Super Administrator can create administrator accounts.' })
  }
  if (req.user.role === 'hr') {
    if (!HR_MANAGED_ROLES.includes(role.rows[0].name)) {
      return res.status(403).json({ message: 'HR can only create employee and manager accounts.' })
    }
    // Staff must belong to the group; external companies are onboarded through KYC.
    if (org_id) {
      const org = await query(
        "SELECT 1 FROM organizations WHERE org_id = $1 AND org_type IN ('PARENT', 'BUSINESS_UNIT') AND verification_status = 'VERIFIED'",
        [org_id],
      )
      if (!org.rowCount) return res.status(403).json({ message: 'HR can only assign staff to a Grupo Global entity.' })
    }
  }

  const passwordHash = await bcrypt.hash(String(password), 12)
  try {
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role_id, region_id, org_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, uuid, name, email, role_id, region_id, org_id, status`,
      [name, email, passwordHash, role_id, region_id || null, org_id || null],
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
  const { rows } = await query(`${USER_LIST_QUERY} ORDER BY u.id`)
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
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ message: 'User not found.' })

  const target = await query('SELECT r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1', [req.params.id])
  if (!target.rows[0]) return res.status(404).json({ message: 'User not found.' })
  if (Number(req.params.id) === Number(req.user.sub)) {
    return res.status(400).json({ message: 'You cannot change the status of your own account.' })
  }
  if (req.user.role === 'hr' && !HR_MANAGED_ROLES.includes(target.rows[0].role)) {
    return res.status(403).json({ message: 'HR can only change the status of employee and manager accounts.' })
  }
  // Mirrors account creation: only the Super Administrator controls administrator accounts.
  if (PRIVILEGED_ROLES.includes(target.rows[0].role) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only the Super Administrator can change administrator accounts.' })
  }

  // A Code of Ethics suspension can only be lifted through HR clearance (Schema Document §5.2).
  if (status === 'active') {
    const sanctioned = await query(
      "SELECT 1 FROM governance_sanctions WHERE user_id = $1 AND tier = 2 AND status = 'ACTIVE'",
      [req.params.id],
    )
    if (sanctioned.rowCount) {
      return res.status(409).json({ message: 'This account is under a Tier 2 suspension. Clear it in Ethics & Compliance.' })
    }
  }

  const { rowCount } = await query("UPDATE users SET status = $1 WHERE id = $2 AND status NOT IN ('erased', 'expelled')", [
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
