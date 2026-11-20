import { query } from '../config/database.js'
import { getIo } from '../sockets/io.js'

/**
 * Creates a notification for each user and pushes it live to their open sessions.
 * Never throws: a failed notification must not break the action that triggered it.
 */
export async function notify(userIds, { type, title, body = null, link = null }) {
  const ids = [...new Set((userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))]
  if (!ids.length) return []
  try {
    const { rows } = await query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       SELECT u.id, $2, $3, $4, $5 FROM users u WHERE u.id = ANY($1::int[]) AND u.status = 'active'
       RETURNING id, user_id, type, title, body, link, read_at, created_at`,
      [ids, type, title, body, link],
    )
    const io = getIo()
    for (const row of rows) io?.to(`user:${row.user_id}`).emit('notification:new', row)
    return rows
  } catch {
    return []
  }
}

/** Notifies every active user holding one of `roles`, optionally excluding one user. */
export async function notifyRoles(roles, payload, excludeUserId = null) {
  try {
    const { rows } = await query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.name = ANY($1::text[]) AND u.status = 'active' AND u.id <> COALESCE($2, -1)`,
      [roles, excludeUserId],
    )
    return notify(rows.map((row) => row.id), payload)
  } catch {
    return []
  }
}

export default { notify, notifyRoles }
