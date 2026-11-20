import { query, withTransaction } from '../config/database.js'

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

/**
 * GDPR Art. 15/20 — everything the platform stores about one person, as JSON.
 * Secrets (password hash, MFA secret) are never included.
 */
export async function exportUserData(userId) {
  const profile = await query(
    `SELECT u.id, u.name, u.email, u.status, u.mfa_enabled, u.created_at, r.name AS role, rg.code AS region
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN regions rg ON rg.id = u.region_id
     WHERE u.id = $1`,
    [userId],
  )
  if (!profile.rows[0]) throw httpError(404, 'User not found.')
  const email = profile.rows[0].email

  const sections = {
    emails: ['SELECT folder, from_address, to_address, subject, body, status, created_at FROM emails WHERE user_id = $1 ORDER BY created_at', [userId]],
    chat_messages: [
      `SELECT c.name AS conversation, m.body, m.created_at FROM messages m
       JOIN conversations c ON c.id = m.conversation_id WHERE m.user_id = $1 ORDER BY m.created_at`, [userId]],
    conversations: [
      `SELECT c.name, c.portal FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
       WHERE cm.user_id = $1`, [userId]],
    notifications: ['SELECT type, title, body, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at', [userId]],
    workflows_requested: ['SELECT title, description, status, due_at, created_at FROM workflows WHERE created_by = $1 ORDER BY created_at', [userId]],
    workflow_decisions: [
      `SELECT w.title, s.step_order, s.status, s.note, s.decided_at FROM workflow_steps s
       JOIN workflows w ON w.id = s.workflow_id WHERE s.decided_by = $1 ORDER BY s.decided_at`, [userId]],
    calendar_events_organised: ['SELECT title, description, starts_at, ends_at FROM calendar_events WHERE created_by = $1 ORDER BY starts_at', [userId]],
    calendar_invitations: [
      `SELECT e.title, e.starts_at, a.response, a.responded_at FROM event_attendees a
       JOIN calendar_events e ON e.id = a.event_id WHERE a.user_id = $1 ORDER BY e.starts_at`, [userId]],
    files_uploaded: ['SELECT name, size_bytes, mime_type, created_at, deleted_at FROM files WHERE uploaded_by = $1 ORDER BY created_at', [userId]],
    files_submitted: ['SELECT original_name, size_bytes, message, status, created_at FROM received_files WHERE LOWER(sender_email) = LOWER($1) ORDER BY created_at', [email]],
    linked_folders: [
      `SELECT lf.label, f.name AS folder FROM linked_folders lf JOIN folders f ON f.id = lf.folder_id
       WHERE lf.user_id = $1`, [userId]],
    folders_shared_with_me: [
      `SELECT f.name AS folder, es.created_at FROM external_shares es JOIN folders f ON f.id = es.folder_id
       WHERE es.user_id = $1`, [userId]],
    activity_log: ['SELECT action, entity, entity_id, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5000', [userId]],
  }

  const data = { exported_at: new Date().toISOString(), profile: profile.rows[0] }
  for (const [name, [sql, params]] of Object.entries(sections)) {
    data[name] = (await query(sql, params)).rows
  }
  return data
}

/**
 * GDPR Art. 17 — erases a person: personal data is deleted or anonymised, while
 * records other people rely on (shared files, approvals, chat history) keep
 * working under the label "Deleted user". The account can no longer sign in.
 */
export async function eraseUser(userId, actorId) {
  if (Number(userId) === Number(actorId)) throw httpError(400, 'You cannot erase your own account.')

  const target = await query(
    `SELECT u.id, u.email, u.status, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [userId],
  )
  const user = target.rows[0]
  if (!user) throw httpError(404, 'User not found.')
  if (user.status === 'erased') throw httpError(409, 'This user has already been erased.')
  if (user.role === 'admin') {
    const admins = await query(
      "SELECT COUNT(*)::int AS total FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' AND u.status = 'active' AND u.id <> $1",
      [userId],
    )
    if (!admins.rows[0].total) throw httpError(409, 'The last active administrator cannot be erased.')
  }

  const label = 'Deleted user'
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET name = $2, email = $3, password_hash = '!erased', status = 'erased',
              mfa_secret = NULL, mfa_enabled = false
       WHERE id = $1`,
      [userId, label, `erased-user-${userId}@erased.invalid`],
    )
    for (const table of ['emails', 'notifications', 'password_resets', 'linked_folders', 'event_attendees',
      'conversation_members', 'external_shares']) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
    }
    await client.query('DELETE FROM folder_permissions WHERE user_id = $1', [userId])
    await client.query('UPDATE messages SET sender_name = $2 WHERE user_id = $1', [userId, label])
    await client.query(
      "UPDATE received_files SET sender_name = $2, sender_email = 'erased@erased.invalid' WHERE LOWER(sender_email) = LOWER($1)",
      [user.email, label],
    )
    // Remove the e-mail address from security log details (e.g. failed sign-ins).
    await client.query(
      "UPDATE audit_logs SET details = details - 'email' WHERE LOWER(details->>'email') = LOWER($1)",
      [user.email],
    )
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES ($1, 'USER_ERASED', 'users', $2, '{}'::jsonb)`,
      [actorId, String(userId)],
    )
  })
}

/** Retention: read notifications older than `days` are removed. */
export async function purgeOldNotifications(days = 90) {
  const { rowCount } = await query(
    'DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < now() - make_interval(days => $1)',
    [days],
  )
  return rowCount
}
