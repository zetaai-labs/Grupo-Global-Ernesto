import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notify } from '../services/notification.service.js'

const EXTERNAL_ROLES = ['partner', 'client', 'supplier']

const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    starts_at: z.string().min(1),
    ends_at: z.string().optional().nullable(),
    attendee_ids: z.array(z.coerce.number().int().positive()).max(50).optional(),
    online: z.boolean().optional(),
  })
  .refine((data) => !Number.isNaN(Date.parse(data.starts_at)), 'Invalid start time.')
  .refine((data) => !data.ends_at || Date.parse(data.ends_at) > Date.parse(data.starts_at), 'End must be after start.')

const responseSchema = z.object({ response: z.enum(['accepted', 'declined']) })

const SELECT = `
  SELECT e.id, e.title, e.description, e.starts_at, e.ends_at, e.region, e.video_room,
         e.created_by, u.name AS owner,
         COALESCE((
           SELECT json_agg(json_build_object('id', a.user_id, 'name', au.name, 'role', r.name, 'response', a.response) ORDER BY au.name)
           FROM event_attendees a JOIN users au ON au.id = a.user_id JOIN roles r ON r.id = au.role_id
           WHERE a.event_id = e.id
         ), '[]'::json) AS attendees,
         me.response AS my_response
  FROM calendar_events e
  LEFT JOIN users u ON u.id = e.created_by
  LEFT JOIN event_attendees me ON me.event_id = e.id AND me.user_id = $1
`

/** The meeting link differs by portal: external attendees join from the Extranet. */
export function meetingLink(role, room) {
  const portal = EXTERNAL_ROLES.includes(role) ? 'extranet' : 'intranet'
  return `/${portal}/video-conferencing?room=${room}`
}

/**
 * Events visible to the user: everything they organise or are invited to, plus
 * (for staff) company events in their region. External users only see invitations.
 */
export async function listEvents(req, res) {
  const external = EXTERNAL_ROLES.includes(req.user.role)
  const region = req.user.region || 'GLOBAL'
  const params = [req.user.sub]
  let where = 'WHERE (e.created_by = $1 OR me.user_id IS NOT NULL'
  if (!external) {
    if (region === 'GLOBAL') where += ' OR true'
    else {
      params.push(region)
      where += " OR e.region = 'GLOBAL' OR e.region = $2"
    }
  }
  where += ')'
  if (req.query.upcoming === 'true') where += " AND COALESCE(e.ends_at, e.starts_at) >= now() - interval '1 hour'"

  const { rows } = await query(`${SELECT} ${where} ORDER BY e.starts_at LIMIT 300`, params)
  return res.json({ data: rows })
}

/** People who can be invited: all active users except the organiser. */
export async function listInvitees(req, res) {
  const { rows } = await query(
    `SELECT u.id, u.name, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.status = 'active' AND u.id <> $1
     ORDER BY (r.name = ANY($2::text[])), u.name`,
    [req.user.sub, EXTERNAL_ROLES],
  )
  return res.json({ data: rows })
}

export async function createEvent(req, res) {
  if (EXTERNAL_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'External accounts cannot create calendar events.' })
  }
  const parsed = eventSchema.safeParse(req.body || {})
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Title and start time are required.' })
  }
  const { title, description, starts_at, ends_at, online } = parsed.data
  const attendeeIds = [...new Set(parsed.data.attendee_ids || [])].filter((id) => id !== req.user.sub)

  if (attendeeIds.length) {
    const valid = await query("SELECT id FROM users WHERE id = ANY($1::int[]) AND status = 'active'", [attendeeIds])
    if (valid.rowCount !== attendeeIds.length) return res.status(400).json({ message: 'Some invitees are not active users.' })
  }

  const room = online ? `gg-${randomBytes(6).toString('hex')}` : null
  const event = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO calendar_events (title, description, starts_at, ends_at, region, created_by, video_room)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, starts_at, ends_at, video_room`,
      [title, description || null, starts_at, ends_at || null, req.user.region, req.user.sub, room],
    )
    for (const userId of attendeeIds) {
      await client.query('INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2)', [rows[0].id, userId])
    }
    return rows[0]
  })

  await writeAudit(req.user.sub, 'CALENDAR_EVENT_CREATED', 'calendar_events', event.id, { attendees: attendeeIds.length, online: Boolean(room) })

  if (attendeeIds.length) {
    const invitees = await query(
      'SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ANY($1::int[])',
      [attendeeIds],
    )
    const when = new Date(starts_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' })
    for (const invitee of invitees.rows) {
      await notify([invitee.id], {
        type: room ? 'meeting' : 'calendar',
        title: `Invitation: ${title}`,
        body: `${req.user.name} · ${when} (Madrid time)${room ? ' · online meeting' : ''}`,
        link: room ? meetingLink(invitee.role, room) : EXTERNAL_ROLES.includes(invitee.role) ? null : '/intranet/calendar',
      })
    }
  }
  return res.status(201).json({ data: event })
}

export async function respondToEvent(req, res) {
  const parsed = responseSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ message: 'Response must be accepted or declined.' })

  const { rows } = await query(
    `UPDATE event_attendees a SET response = $1, responded_at = now()
     FROM calendar_events e
     WHERE a.event_id = $2 AND a.user_id = $3 AND e.id = a.event_id
     RETURNING e.title, e.created_by`,
    [parsed.data.response, req.params.id, req.user.sub],
  )
  if (!rows[0]) return res.status(404).json({ message: 'You are not invited to this event.' })

  await notify([rows[0].created_by].filter((id) => id !== req.user.sub), {
    type: 'calendar',
    title: `${req.user.name} ${parsed.data.response} “${rows[0].title}”`,
    link: '/intranet/calendar',
  })
  return res.json({ message: `Invitation ${parsed.data.response}.` })
}

export async function deleteEvent(req, res) {
  const { rows } = await query('SELECT id, title, created_by FROM calendar_events WHERE id = $1', [req.params.id])
  const event = rows[0]
  if (!event) return res.status(404).json({ message: 'Event not found.' })
  if (event.created_by !== req.user.sub && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only the organiser can cancel this event.' })
  }

  const attendees = await query("SELECT user_id FROM event_attendees WHERE event_id = $1 AND response <> 'declined'", [event.id])
  await query('DELETE FROM calendar_events WHERE id = $1', [event.id])
  await notify(attendees.rows.map((row) => row.user_id), {
    type: 'calendar',
    title: `Cancelled: ${event.title}`,
    body: `Cancelled by ${req.user.name}`,
  })
  await writeAudit(req.user.sub, 'CALENDAR_EVENT_CANCELLED', 'calendar_events', event.id)
  return res.json({ message: 'Event cancelled.' })
}

/** Sends one reminder per event to the organiser and attendees ~15 minutes before it starts. */
export async function sendEventReminders(minutesBefore = 15) {
  const { rows } = await query(
    `UPDATE calendar_events SET reminded_at = now()
     WHERE reminded_at IS NULL
       AND starts_at > now()
       AND starts_at <= now() + make_interval(mins => $1)
     RETURNING id, title, starts_at, video_room, created_by`,
    [minutesBefore],
  )
  for (const event of rows) {
    const people = await query(
      `SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 OR u.id IN (SELECT user_id FROM event_attendees WHERE event_id = $2 AND response <> 'declined')`,
      [event.created_by, event.id],
    )
    const minutes = Math.max(1, Math.round((new Date(event.starts_at) - Date.now()) / 60000))
    for (const person of people.rows) {
      await notify([person.id], {
        type: event.video_room ? 'meeting' : 'calendar',
        title: `Starting in ${minutes} min: ${event.title}`,
        body: event.video_room ? 'Click to join the online meeting.' : null,
        link: event.video_room ? meetingLink(person.role, event.video_room) : EXTERNAL_ROLES.includes(person.role) ? null : '/intranet/calendar',
      })
    }
  }
  return rows.length
}

/** Whether a user may join a meeting room (organiser, invitee, or the portal's open room). */
export async function canJoinRoom(user, room) {
  if (room === 'intranet-meeting') return !EXTERNAL_ROLES.includes(user.role)
  if (room === 'extranet-meeting') return true
  const { rowCount } = await query(
    `SELECT 1 FROM calendar_events e
     WHERE e.video_room = $1
       AND (e.created_by = $2 OR $3 = 'admin'
            OR EXISTS (SELECT 1 FROM event_attendees a WHERE a.event_id = e.id AND a.user_id = $2 AND a.response <> 'declined'))`,
    [room, user.sub, user.role],
  )
  return rowCount > 0
}
