import { query } from '../config/database.js'
import { unseal } from './engine.controller.js'

/**
 * GDPR handling for ZYLAX records (Art. 15, 17 and 20).
 *
 * "Personal" entities are records about one person, identified by who they are assigned to or
 * who created them. Everything else is a work record: its export shows only that the person was
 * involved, because titles and fields can describe colleagues or confidential business matters.
 *
 * On erasure, ERASE entities are deleted. RETAINED entities stay for employment, safety and
 * accounting obligations (GDPR Art. 17(3)), linked only to the anonymised "Deleted user".
 */
export const PERSONAL_BY_ASSIGNEE = ['people/profiles', 'people/performance', 'onboarding/plans', 'attendance/attendance', 'education/enrollments', 'volunteers/signups']
export const PERSONAL_BY_CREATOR = ['attendance/leave', 'safety/musters', 'safety/incidents', 'expenses/claims', 'facilities/travel']
export const ERASE_BY_ASSIGNEE = ['people/profiles', 'people/performance', 'onboarding/plans', 'education/enrollments', 'volunteers/signups']
export const ERASE_BY_CREATOR = ['safety/musters']
export const RETAINED = ['attendance/attendance', 'attendance/leave', 'safety/incidents', 'expenses/claims', 'facilities/travel']
/** Every ZYLAX field of type "email", with the name field stored beside it. */
export const CONTACT_FIELDS = {
  'sales/opportunities': { email: 'contact_email', name: 'contact_name' },
  'events/registrations': { email: 'email', name: null },
}
/** Only these sealed fields belong to the person; legal notes and license keys never leave. */
const PERSONAL_SECRET_ENTITIES = ['people/profiles']

const ENTITY = "r.module || '/' || r.entity"
const SUBJECT = `((r.assigned_to = $1 AND ${ENTITY} = ANY($2::text[])) OR (r.created_by = $1 AND ${ENTITY} = ANY($3::text[])))`
const ALL_PERSONAL = [...PERSONAL_BY_ASSIGNEE, ...PERSONAL_BY_CREATOR, 'onboarding/tasks', 'events/registrations']

export async function exportZylaxData(userId, email) {
  const subject = [userId, PERSONAL_BY_ASSIGNEE, PERSONAL_BY_CREATOR]
  const [personal, tasks, registrations, opportunities, contacts, work, comments, files] = await Promise.all([
    query(`SELECT r.ref_no, r.module, r.entity, r.title, r.status, r.data, r.sealed_data, r.created_at, r.updated_at
           FROM zx_records r WHERE ${SUBJECT} ORDER BY r.created_at`, subject),
    query(`SELECT r.ref_no, r.title, r.status, r.data, r.created_at FROM zx_records r
           WHERE r.module = 'onboarding' AND r.entity = 'tasks' AND r.data->>'plan' IN (
             SELECT p.record_id::text FROM zx_records p WHERE p.module = 'onboarding' AND p.entity = 'plans' AND p.assigned_to = $1
           ) ORDER BY r.created_at`, [userId]),
    query(`SELECT r.ref_no, r.title, r.status, r.data, r.created_at FROM zx_records r
           WHERE r.module = 'events' AND r.entity = 'registrations' AND LOWER(r.data->>'email') = LOWER($1)`, [email]),
    query(`SELECT r.ref_no, r.data->>'contact_name' AS contact_name, r.data->>'contact_email' AS contact_email, r.created_at
           FROM zx_records r WHERE r.module = 'sales' AND r.entity = 'opportunities' AND LOWER(r.data->>'contact_email') = LOWER($1)`, [email]),
    query(`SELECT c.full_name, c.email, c.phone, c.job_title, o.legal_name AS organization, c.created_at
           FROM zx_contacts c LEFT JOIN organizations o ON o.org_id = c.org_id WHERE LOWER(c.email) = LOWER($1)`, [email]),
    query(`SELECT r.ref_no, r.module, r.entity, r.status, r.created_at,
                  r.assigned_to IS NOT DISTINCT FROM $1 AS assigned_to_me, r.created_by IS NOT DISTINCT FROM $1 AS created_by_me
           FROM zx_records r WHERE (r.assigned_to = $1 OR r.created_by = $1) AND NOT (${ENTITY} = ANY($2::text[]))
           ORDER BY r.created_at`, [userId, ALL_PERSONAL]),
    query(`SELECT r.ref_no, e.body, e.created_at FROM zx_record_events e JOIN zx_records r ON r.record_id = e.record_id
           WHERE e.kind = 'comment' AND e.created_by = $1 ORDER BY e.created_at`, [userId]),
    query(`SELECT r.ref_no, f.name, f.size_bytes, f.mime_type, f.created_at FROM zx_record_files f
           JOIN zx_records r ON r.record_id = f.record_id WHERE f.created_by = $1 ORDER BY f.created_at`, [userId]),
  ])

  let confidentialUnavailable = false
  const personalRecords = personal.rows.map(({ sealed_data: sealed, ...record }) => {
    if (!sealed || !PERSONAL_SECRET_ENTITIES.includes(`${record.module}/${record.entity}`)) return record
    try {
      return { ...record, data: { ...record.data, ...unseal(sealed) } }
    } catch {
      confidentialUnavailable = true
      return { ...record, confidential_fields_unavailable: true }
    }
  })

  return {
    personal_records: personalRecords,
    onboarding_tasks: tasks.rows,
    event_registrations: registrations.rows,
    contact_entries: { directory: contacts.rows, sales_opportunities: opportunities.rows },
    work_records: work.rows,
    comments_written: comments.rows,
    files_uploaded: files.rows,
    ...(confidentialUnavailable ? { notice: 'Some confidential fields could not be decrypted. Contact the Data Protection Officer.' } : {}),
  }
}

/** Runs inside the erasure transaction. Returns stored files to delete once it commits. */
export async function eraseZylaxData(client, { userId, email, name, label }) {
  const doomed = await client.query(
    `SELECT r.record_id FROM zx_records r
     WHERE ${SUBJECT}
        OR (r.module = 'events' AND r.entity = 'registrations' AND LOWER(r.data->>'email') = LOWER($4))
        OR (r.module = 'onboarding' AND r.entity = 'tasks' AND r.data->>'plan' IN (
              SELECT p.record_id::text FROM zx_records p WHERE p.module = 'onboarding' AND p.entity = 'plans' AND p.assigned_to = $1))`,
    [userId, ERASE_BY_ASSIGNEE, ERASE_BY_CREATOR, email],
  )
  const doomedIds = doomed.rows.map((row) => row.record_id)

  // Leave reasons, notes and attachments can reveal health data; only the dates and type are kept.
  const leave = await client.query(
    `SELECT record_id FROM zx_records WHERE module = 'attendance' AND entity = 'leave' AND created_by = $1`,
    [userId],
  )
  const leaveIds = leave.rows.map((row) => row.record_id)
  const files = await client.query(
    'SELECT stored_name FROM zx_record_files WHERE record_id = ANY($1::uuid[])',
    [[...doomedIds, ...leaveIds]],
  )

  await client.query('DELETE FROM zx_records WHERE record_id = ANY($1::uuid[])', [doomedIds])
  await client.query('DELETE FROM zx_record_files WHERE record_id = ANY($1::uuid[])', [leaveIds])
  await client.query(`DELETE FROM zx_record_events WHERE record_id = ANY($1::uuid[]) AND kind IN ('comment', 'file')`, [leaveIds])
  await client.query(`UPDATE zx_records SET title = 'Leave record', updated_at = now() WHERE record_id = ANY($1::uuid[])`, [leaveIds])

  await client.query(
    `UPDATE zx_records SET data = data || '{"itinerary": null}'::jsonb, updated_at = now()
     WHERE module = 'facilities' AND entity = 'travel' AND created_by = $1`,
    [userId],
  )
  await client.query(
    `UPDATE zx_records SET data = data || '{"manager": null}'::jsonb, updated_at = now()
     WHERE module = 'people' AND entity = 'profiles' AND data->>'manager' = $1`,
    [String(userId)],
  )
  await client.query(
    `UPDATE zx_records SET data = data || '{"contact_name": null, "contact_email": null}'::jsonb, updated_at = now()
     WHERE module = 'sales' AND entity = 'opportunities' AND LOWER(data->>'contact_email') = LOWER($1)`,
    [email],
  )
  await client.query(
    `UPDATE zx_contacts SET full_name = 'Deleted contact', email = NULL, phone = NULL, job_title = NULL, active = false, updated_at = now()
     WHERE LOWER(email) = LOWER($1)`,
    [email],
  )

  // Automatic titles ("Attendance · Name") and safety alerts carry the person's name.
  if (name) {
    await client.query(
      `UPDATE zx_records SET title = replace(title, $2, $3), updated_at = now()
       WHERE (assigned_to = $1 OR created_by = $1) AND position($2 in title) > 0`,
      [userId, name, label],
    )
    await client.query(
      `UPDATE notifications SET title = $2 || ' needs help', body = NULL WHERE type = 'security' AND title = $1 || ' needs help'`,
      [name, label],
    )
  }
  return files.rows.map((row) => row.stored_name)
}
