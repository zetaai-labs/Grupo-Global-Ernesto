import { query, withTransaction } from '../config/database.js'
import { removeStoredFiles } from './storage.service.js'
import { eraseZylaxData, exportZylaxData } from '../zylax/privacy.js'
import { eraseDirectoryContacts, exportDirectoryContacts } from '../imports/import.service.js'
import { openMessage } from './chatCrypto.service.js'
import { providers as videoProviders } from '../integrations/video/streamUpload.js'

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

/**
 * GDPR Art. 15/20 — everything the platform stores about one person, as JSON.
 * Secrets (password hash, MFA secret) are never included.
 */
export async function exportUserData(userId) {
  const profile = await query(
    `SELECT u.id, u.name, u.email, u.status, u.mfa_enabled, u.processing_opposed, u.created_at, (u.avatar_file IS NOT NULL) AS has_profile_photo, r.name AS role, rg.code AS region
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN regions rg ON rg.id = u.region_id
     WHERE u.id = $1`,
    [userId],
  )
  if (!profile.rows[0]) throw httpError(404, 'User not found.')
  const email = profile.rows[0].email

  const sections = {
    privacy_consents: ['SELECT policy_version, action, language, created_at FROM privacy_consents WHERE user_id = $1 ORDER BY created_at', [userId]],
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
    security_keys: ['SELECT name, last_used_at, created_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at', [userId]],
    courses: [
      `SELECT c.title, c.module_type, e.status, e.attempts, e.best_score, e.completed_at, e.certificate_hash, e.created_at
       FROM course_enrollments e JOIN community_events_courses c ON c.item_id = e.item_id WHERE e.user_id = $1 ORDER BY e.created_at`, [userId]],
    vehicle_positions: ['SELECT lat, lng, accuracy_m, speed_kmh, recorded_at FROM zx_vehicle_positions WHERE user_id = $1 ORDER BY recorded_at', [userId]],
    organisation_people: [
      `SELECT o.legal_name AS organisation, p.full_name, p.person_role, p.ownership_pct, p.nationality, p.birth_year, p.created_at
       FROM org_people p JOIN users u ON u.org_id = p.org_id JOIN organizations o ON o.org_id = p.org_id
       WHERE u.id = $1 AND p.erased_at IS NULL ORDER BY p.created_at`, [userId]],
    course_progress: [
      `SELECT c.title, p.standard, a.lesson_status, a.score, a.total_seconds, a.launches, a.completed_at, a.cmi, a.updated_at,
              (SELECT COUNT(*)::int FROM xapi_statements x WHERE x.attempt_id = a.attempt_id) AS xapi_statements
       FROM course_attempts a JOIN course_packages p ON p.package_id = a.package_id
       JOIN community_events_courses c ON c.item_id = p.item_id WHERE a.user_id = $1 ORDER BY a.created_at`, [userId]],
    alert_devices: ['SELECT device, last_sent_at, created_at FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at', [userId]],
    video_bio: ['SELECT provider, status, language, duration_seconds, transcript, created_at, updated_at FROM video_bios WHERE user_id = $1', [userId]],
    privacy_requests: ['SELECT request_type, field, requested_value, details, status, response, created_at FROM gdpr_requests WHERE user_id = $1 ORDER BY created_at', [userId]],
    activity_log: ['SELECT action, entity, entity_id, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5000', [userId]],
  }

  const data = { exported_at: new Date().toISOString(), profile: profile.rows[0] }
  for (const [name, [sql, params]] of Object.entries(sections)) {
    data[name] = (await query(sql, params)).rows
  }
  data.chat_messages = data.chat_messages.map((row) => ({ ...row, body: openMessage(row.body) }))
  data.zylax = await exportZylaxData(Number(userId), email)
  data.business_directory_contacts = await exportDirectoryContacts(email)
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
    `SELECT u.id, u.name, u.email, u.status, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
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
  const videoBios = (await query('SELECT * FROM video_bios WHERE user_id = $1', [userId])).rows
  const photo = (await query('SELECT avatar_file FROM users WHERE id = $1', [userId])).rows[0]?.avatar_file
  const storedFiles = await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET name = $2, email = $3, password_hash = '!erased', status = 'erased',
              mfa_secret = NULL, mfa_enabled = false, video_bio_url = NULL, avatar_file = NULL, avatar_updated_at = NULL
       WHERE id = $1`,
      [userId, label, `erased-user-${userId}@erased.invalid`],
    )
    for (const table of ['emails', 'notifications', 'password_resets', 'linked_folders', 'event_attendees',
      'conversation_members', 'external_shares', 'webauthn_credentials', 'webauthn_challenges', 'course_attempts', 'zx_vehicle_positions', 'video_bios', 'push_subscriptions', 'e2ee_keys']) {
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
    const zylaxFiles = await eraseZylaxData(client, { userId: Number(userId), email: user.email, name: user.name, label })
    await eraseDirectoryContacts(client, user.email)
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES ($1, 'USER_ERASED', 'users', $2, '{}'::jsonb)`,
      [actorId, String(userId)],
    )
    return zylaxFiles
  })
  // Stored files cannot be rolled back, so they are removed only after the transaction commits.
  await removeStoredFiles(photo ? [...storedFiles, photo] : storedFiles)
  for (const bio of videoBios) await videoProviders[bio.provider]?.remove(bio).catch(() => {})
}

/** Retention: read notifications older than `days` are removed. */
export async function purgeOldNotifications(days = 90) {
  const { rowCount } = await query(
    'DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < now() - make_interval(days => $1)',
    [days],
  )
  return rowCount
}
