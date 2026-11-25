import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notify } from '../services/notification.service.js'
import { orgPredicate } from '../services/scope.js'
import { httpError, lock } from './rules.js'

/**
 * Hybrid events and B2B meetings (ZYLAX Events module).
 * - Online and hybrid events have a private video room for confirmed participants.
 * - Confirmed participants can request 1:1 meetings with each other during the event.
 */

const EVENT_MANAGERS = ['admin', 'manager']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const eventRoom = (eventId) => `ev-${eventId}`
export const meetingRoom = (meetingId) => `b2b-${meetingId}`

async function loadEvent(req) {
  if (!UUID.test(req.params.id)) throw httpError(400, 'Invalid id.')
  const { rows } = await query(
    `SELECT r.record_id, r.title, r.status, r.data, r.created_by FROM zx_records r
     WHERE r.module = 'events' AND r.entity = 'events' AND r.record_id = $1 AND ${orgPredicate('r.owner_org_id', '$2')}`,
    [req.params.id, req.user.org_scope ?? null],
  )
  if (!rows[0]) throw httpError(404, 'Event not found.')
  return rows[0]
}

/** The user's confirmed (or attended) registration for this event, if any. */
async function registration(eventId, userId) {
  const { rows } = await query(
    `SELECT record_id, data FROM zx_records
     WHERE module = 'events' AND entity = 'registrations' AND data->>'event' = $1 AND created_by = $2 AND status IN ('CONFIRMED', 'COMPLETED')
     LIMIT 1`,
    [eventId, userId],
  )
  return rows[0] || null
}

const isManager = (user) => EVENT_MANAGERS.includes(user.role)
const format = (event) => event.data?.mode || 'IN_PERSON'

/** Video room for an online or hybrid event: managers and confirmed participants. */
export async function joinEvent(req, res) {
  const event = await loadEvent(req)
  if (format(event) === 'IN_PERSON') throw httpError(409, 'This event has no online room.')
  if (['CANCELLED', 'DONE'].includes(event.status)) throw httpError(409, 'This event is over.')
  if (!isManager(req.user) && event.created_by !== req.user.sub && !(await registration(event.record_id, req.user.sub))) {
    throw httpError(403, 'Register for this event to join it online.')
  }
  await writeAudit(req.user.sub, 'ZX_EVENT_JOINED_ONLINE', 'zx:events:events', event.record_id)
  return res.json({ data: { room: eventRoom(event.record_id), title: event.title } })
}

/** Used by the video server: may this user enter an event or B2B room? */
export async function canJoinEventRoom(user, room) {
  if (room.startsWith('ev-')) {
    const eventId = room.slice(3)
    if (!UUID.test(eventId)) return false
    const { rows } = await query("SELECT created_by, data FROM zx_records WHERE module = 'events' AND entity = 'events' AND record_id = $1", [eventId])
    if (!rows[0] || (rows[0].data?.mode || 'IN_PERSON') === 'IN_PERSON') return false
    return isManager(user) || rows[0].created_by === user.sub || Boolean(await registration(eventId, user.sub))
  }
  if (room.startsWith('b2b-')) {
    const meetingId = room.slice(4)
    if (!UUID.test(meetingId)) return false
    const { rowCount } = await query(
      "SELECT 1 FROM b2b_meetings WHERE meeting_id = $1 AND status = 'ACCEPTED' AND mode = 'ONLINE' AND $2 IN (requester_id, recipient_id)",
      [meetingId, user.sub],
    )
    return rowCount > 0
  }
  return false
}

async function requireParticipant(req, event) {
  if (isManager(req.user)) return
  if (!(await registration(event.record_id, req.user.sub))) throw httpError(403, 'Only confirmed participants can use B2B meetings.')
}

/** Other confirmed participants, with their organisation and video presentation. */
export async function participants(req, res) {
  const event = await loadEvent(req)
  await requireParticipant(req, event)
  const { rows } = await query(
    `SELECT DISTINCT ON (u.id) u.id, u.name, u.video_bio_url, o.legal_name AS organisation, r.data->>'institution' AS institution
     FROM zx_records r JOIN users u ON u.id = r.created_by LEFT JOIN organizations o ON o.org_id = u.org_id
     WHERE r.module = 'events' AND r.entity = 'registrations' AND r.data->>'event' = $1 AND r.status IN ('CONFIRMED', 'COMPLETED')
       AND u.id <> $2 AND u.status = 'active' AND NOT u.processing_opposed
     ORDER BY u.id, u.name`,
    [event.record_id, req.user.sub],
  )
  return res.json({ data: rows.sort((a, b) => a.name.localeCompare(b.name)) })
}

const presentMeeting = (row, userId) => ({
  ...row,
  direction: row.requester_id === userId ? 'sent' : 'received',
  room: row.status === 'ACCEPTED' && row.mode === 'ONLINE' ? meetingRoom(row.meeting_id) : null,
})

export async function myMeetings(req, res) {
  const event = await loadEvent(req)
  await requireParticipant(req, event)
  const { rows } = await query(
    `SELECT m.meeting_id, m.requester_id, m.recipient_id, m.slot_start, m.slot_minutes, m.mode, m.table_label, m.message, m.status, m.created_at,
            q.name AS requester_name, t.name AS recipient_name
     FROM b2b_meetings m JOIN users q ON q.id = m.requester_id JOIN users t ON t.id = m.recipient_id
     WHERE m.event_id = $1 AND $2 IN (m.requester_id, m.recipient_id)
     ORDER BY m.slot_start`,
    [event.record_id, req.user.sub],
  )
  return res.json({ data: rows.map((row) => presentMeeting(row, req.user.sub)) })
}

const requestSchema = z.object({
  recipient_id: z.coerce.number().int().positive(),
  slot_start: z.string().datetime({ offset: true }),
  slot_minutes: z.coerce.number().int().min(10).max(60).default(20),
  mode: z.enum(['ONLINE', 'IN_PERSON']),
  message: z.string().trim().max(500).optional().nullable(),
})

export async function requestMeeting(req, res) {
  const event = await loadEvent(req)
  if (!(await registration(event.record_id, req.user.sub))) throw httpError(403, 'Only confirmed participants can use B2B meetings.')
  const parsed = requestSchema.safeParse(req.body || {})
  if (!parsed.success) throw httpError(400, 'Choose a person, a time and online or in person.')
  const d = parsed.data
  if (d.recipient_id === req.user.sub) throw httpError(400, 'Choose another participant.')
  if (!(await registration(event.record_id, d.recipient_id))) throw httpError(400, 'This person is not a confirmed participant.')
  const mode = format(event)
  if (mode === 'ONLINE' && d.mode === 'IN_PERSON') throw httpError(400, 'This event is online only.')
  if (mode === 'IN_PERSON' && d.mode === 'ONLINE') throw httpError(400, 'This event is in person only.')
  const start = new Date(d.slot_start)
  const end = new Date(start.getTime() + d.slot_minutes * 60000)
  const eventStart = new Date(event.data?.start_at)
  const eventEnd = new Date(event.data?.end_at)
  if (!(start >= eventStart && end <= eventEnd)) throw httpError(400, 'Choose a time during the event.')

  const { rows } = await query(
    `INSERT INTO b2b_meetings (event_id, requester_id, recipient_id, slot_start, slot_minutes, mode, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING meeting_id`,
    [event.record_id, req.user.sub, d.recipient_id, start.toISOString(), d.slot_minutes, d.mode, d.message || null],
  )
  await notify([d.recipient_id], { type: 'event', title: `B2B meeting request: ${req.user.name}`, body: event.title, link: '/intranet/zylax/events' })
  await writeAudit(req.user.sub, 'ZX_B2B_REQUESTED', 'zx:events:events', event.record_id, { meeting_id: rows[0].meeting_id })
  return res.status(201).json({ data: rows[0], message: 'Meeting request sent.' })
}

/** Accept or decline (the recipient). Accepting checks that neither person is already booked then. */
export async function respondMeeting(req, res) {
  const event = await loadEvent(req)
  if (!UUID.test(req.params.meetingId)) throw httpError(400, 'Invalid id.')
  const accept = req.body?.accept === true
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM b2b_meetings WHERE meeting_id = $1 AND event_id = $2 FOR UPDATE', [req.params.meetingId, event.record_id])
    const meeting = rows[0]
    if (!meeting || meeting.recipient_id !== req.user.sub) throw httpError(404, 'Meeting not found.')
    if (meeting.status !== 'REQUESTED') throw httpError(409, 'This request has already been processed.')
    if (!accept) {
      await client.query("UPDATE b2b_meetings SET status = 'DECLINED', responded_at = now() WHERE meeting_id = $1", [meeting.meeting_id])
      return { ...meeting, status: 'DECLINED' }
    }
    await lock(client, `b2b-${event.record_id}`)
    const busy = await client.query(
      `SELECT 1 FROM b2b_meetings
       WHERE event_id = $1 AND status = 'ACCEPTED' AND meeting_id <> $2
         AND (requester_id IN ($3, $4) OR recipient_id IN ($3, $4))
         AND slot_start < $5::timestamptz + make_interval(mins => $6) AND slot_start + make_interval(mins => slot_minutes) > $5::timestamptz`,
      [event.record_id, meeting.meeting_id, meeting.requester_id, meeting.recipient_id, meeting.slot_start, meeting.slot_minutes],
    )
    if (busy.rowCount) throw httpError(409, 'One of you already has a meeting at that time.')
    let table = null
    if (meeting.mode === 'IN_PERSON') {
      const used = await client.query(
        `SELECT COUNT(*)::int AS n FROM b2b_meetings WHERE event_id = $1 AND status = 'ACCEPTED' AND mode = 'IN_PERSON'
           AND slot_start < $2::timestamptz + make_interval(mins => $3) AND slot_start + make_interval(mins => slot_minutes) > $2::timestamptz`,
        [event.record_id, meeting.slot_start, meeting.slot_minutes],
      )
      table = `B2B-${used.rows[0].n + 1}`
    }
    await client.query("UPDATE b2b_meetings SET status = 'ACCEPTED', table_label = $2, responded_at = now() WHERE meeting_id = $1", [meeting.meeting_id, table])
    return { ...meeting, status: 'ACCEPTED', table_label: table }
  })
  await notify([result.requester_id], {
    type: 'event',
    title: result.status === 'ACCEPTED' ? `B2B meeting accepted: ${req.user.name}` : `B2B meeting declined: ${req.user.name}`,
    body: event.title,
    link: '/intranet/zylax/events',
  })
  await writeAudit(req.user.sub, `ZX_B2B_${result.status}`, 'zx:events:events', event.record_id, { meeting_id: result.meeting_id })
  return res.json({ data: presentMeeting(result, req.user.sub), message: result.status === 'ACCEPTED' ? 'Meeting accepted.' : 'Meeting declined.' })
}

export async function cancelMeeting(req, res) {
  const event = await loadEvent(req)
  if (!UUID.test(req.params.meetingId)) throw httpError(400, 'Invalid id.')
  const { rows } = await query(
    `UPDATE b2b_meetings SET status = 'CANCELLED', responded_at = now()
     WHERE meeting_id = $1 AND event_id = $2 AND $3 IN (requester_id, recipient_id) AND status IN ('REQUESTED', 'ACCEPTED')
     RETURNING requester_id, recipient_id`,
    [req.params.meetingId, event.record_id, req.user.sub],
  )
  if (!rows[0]) throw httpError(404, 'Meeting not found.')
  const other = rows[0].requester_id === req.user.sub ? rows[0].recipient_id : rows[0].requester_id
  await notify([other], { type: 'event', title: `B2B meeting cancelled: ${req.user.name}`, body: event.title, link: '/intranet/zylax/events' })
  await writeAudit(req.user.sub, 'ZX_B2B_CANCELLED', 'zx:events:events', event.record_id, { meeting_id: req.params.meetingId })
  return res.json({ message: 'Meeting cancelled.' })
}
