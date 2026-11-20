import { query } from '../config/database.js'

export async function listNotifications(req, res) {
  const [list, unread] = await Promise.all([
    query(
      `SELECT id, type, title, body, link, read_at, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.sub],
    ),
    query('SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.sub]),
  ])
  return res.json({ data: list.rows, unread: unread.rows[0].total })
}

export async function markRead(req, res) {
  const { rowCount } = await query(
    'UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.sub],
  )
  if (!rowCount) return res.status(404).json({ message: 'Notification not found.' })
  return res.json({ message: 'Marked as read.' })
}

export async function markAllRead(req, res) {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.sub])
  return res.json({ message: 'All notifications marked as read.' })
}

export default { listNotifications, markRead, markAllRead }
