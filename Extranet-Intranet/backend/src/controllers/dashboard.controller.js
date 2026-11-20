import { query } from '../config/database.js'
import { withRegion } from '../services/scope.js'

async function count(table, req, alias = '') {
  const scoped = withRegion(req, `SELECT COUNT(*)::int AS total FROM ${table} WHERE 1=1`, [], alias)
  const { rows } = await query(scoped.sql, scoped.params)
  return rows[0].total
}

export async function getDashboard(req, res) {
  const [folders, files, workflows, pending, emails] = await Promise.all([
    count('folders', req),
    count('files', req, 'files'),
    count('workflows', req),
    query("SELECT COUNT(*)::int AS total FROM workflows WHERE status = 'pending'").then((r) => r.rows[0].total),
    count('emails', req),
  ])

  const data = {
    folders,
    files,
    workflows,
    pendingApprovals: pending,
    emails,
  }

  if (req.user.role === 'admin') {
    const users = await query("SELECT COUNT(*)::int AS total FROM users WHERE status = 'active'")
    data.users = users.rows[0].total
    const roles = await query('SELECT COUNT(*)::int AS total FROM roles')
    data.roles = roles.rows[0].total
  }

  return res.json({ data })
}
