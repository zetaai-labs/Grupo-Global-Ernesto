import { query } from '../config/database.js'

export async function writeAudit(userId, action, entity, entityId = null, details = {}) {
  await query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, action, entity, entityId, JSON.stringify(details)],
  )
}
