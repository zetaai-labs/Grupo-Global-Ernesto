import { query } from '../config/database.js'

export async function listAuditLogs(req, res) {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const { rows } = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.created_at,
            u.name AS user_name, u.email AS user_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC
     LIMIT $1`,
    [limit],
  )
  return res.json({ data: rows })
}
