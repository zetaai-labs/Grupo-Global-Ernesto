import ExcelJS from 'exceljs'
import { query, withTransaction } from '../config/database.js'
import { STAFF_ROLES } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { orgPredicate } from '../services/scope.js'
import { breakSeconds, workedSeconds } from './special.controller.js'
import { httpError, lock } from './rules.js'

/**
 * Attendance for HR and managers: who is working right now, the monthly working-time record
 * (Spain: Real Decreto-ley 8/2019, kept 4 years and available to the employee and the labour inspectorate),
 * and HR corrections of forgotten clock-outs, each with a reason and the previous values.
 */

const HR_ROLES = ['admin', 'hr']
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_SHIFT_MS = 24 * 3600 * 1000
const madridDate = (column) => `((${column})::timestamptz AT TIME ZONE 'Europe/Madrid')::date`

/** People whose attendance this user may see. null = everyone in their organisation scope. */
async function teamIds(user) {
  if (HR_ROLES.includes(user.role)) return null
  if (user.role !== 'manager') return []
  const { rows } = await query(
    `SELECT DISTINCT (p.data->>'user')::int AS id FROM zx_records p
     WHERE p.module = 'people' AND p.entity = 'profiles' AND p.data->>'user' ~ '^[0-9]+$'
       AND (p.data->>'manager' = $1::text OR p.data->>'department' IN (
         SELECT d.record_id::text FROM zx_records d WHERE d.module = 'people' AND d.entity = 'departments' AND d.data->>'head' = $1::text))`,
    [user.sub],
  )
  return rows.map((row) => row.id).filter((id) => id !== user.sub)
}

async function members(user, onlyId = null) {
  const team = await teamIds(user)
  if (team !== null && !team.length && !onlyId) return []
  const params = [STAFF_ROLES, user.org_scope ?? null]
  let filter = ''
  if (team !== null) { params.push(team); filter += ` AND u.id = ANY($${params.length}::int[])` }
  if (onlyId) { params.push(onlyId); filter += ` AND u.id = $${params.length}` }
  const { rows } = await query(
    `SELECT u.id, u.name, r.name AS role, o.legal_name AS organisation
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN organizations o ON o.org_id = u.org_id
     WHERE u.status = 'active' AND r.name = ANY($1::text[]) AND ${orgPredicate('u.org_id', '$2')} ${filter}
     ORDER BY u.name LIMIT 2000`,
    params,
  )
  return rows
}

function requireViewer(user) {
  if (!STAFF_ROLES.includes(user.role)) throw httpError(403, 'Staff only.')
}

/** GET /attendance/team — who is working, on a break, on leave or not in, right now. */
export async function teamNow(req, res) {
  requireViewer(req.user)
  if (!HR_ROLES.includes(req.user.role) && req.user.role !== 'manager') throw httpError(403, 'Only HR and managers can see team attendance.')
  const people = await members(req.user)
  if (!people.length) return res.json({ data: [], meta: { scope: HR_ROLES.includes(req.user.role) ? 'all' : 'team' } })
  const ids = people.map((person) => person.id)
  const [shifts, leave] = await Promise.all([
    query(
      `SELECT record_id, assigned_to, status, data FROM zx_records
       WHERE module = 'attendance' AND entity = 'attendance' AND assigned_to = ANY($1::int[])
         AND (status = 'OPEN' OR ${madridDate("data->>'clock_in'")} = (now() AT TIME ZONE 'Europe/Madrid')::date)`,
      [ids],
    ),
    query(
      `SELECT created_by, data->>'leave_type' AS leave_type FROM zx_records
       WHERE module = 'attendance' AND entity = 'leave' AND status = 'APPROVED' AND created_by = ANY($1::int[])
         AND (data->>'start_date')::date <= (now() AT TIME ZONE 'Europe/Madrid')::date
         AND (data->>'end_date')::date >= (now() AT TIME ZONE 'Europe/Madrid')::date`,
      [ids],
    ),
  ])
  const now = new Date()
  const data = people.map((person) => {
    const mine = shifts.rows.filter((row) => row.assigned_to === person.id)
    const open = mine.find((row) => row.status === 'OPEN')
    const onBreak = open && (open.data.breaks || []).some((item) => !item.end)
    const today = mine.reduce((sum, row) => sum + (row.status === 'OPEN' ? workedSeconds(row.data, now) : Number(row.data.worked_seconds ?? (row.data.hours || 0) * 3600)), 0)
    const away = leave.rows.find((row) => row.created_by === person.id)
    const first = mine.map((row) => row.data.clock_in).sort()[0] || null
    return {
      ...person,
      state: open ? (onBreak ? 'BREAK' : 'IN') : away ? 'LEAVE' : mine.length ? 'DONE' : 'OUT',
      leave_type: away?.leave_type || null,
      since: open?.data.clock_in || null,
      first_in: first,
      late: mine.some((row) => row.data.late),
      today_seconds: Math.round(today),
      long_shift: Boolean(open) && now - new Date(open.data.clock_in) > 14 * 3600 * 1000,
      open_record_id: open?.record_id || null,
    }
  })
  return res.json({ data, meta: { scope: HR_ROLES.includes(req.user.role) ? 'all' : 'team' } })
}

/** Day-by-day rows for the month, per person. */
async function monthRows(people, month) {
  const ids = people.map((person) => person.id)
  if (!ids.length) return []
  const { rows } = await query(
    `SELECT record_id, assigned_to, status, data, ${madridDate("data->>'clock_in'")}::text AS day FROM zx_records
     WHERE module = 'attendance' AND entity = 'attendance' AND assigned_to = ANY($1::int[])
       AND to_char(${madridDate("data->>'clock_in'")}, 'YYYY-MM') = $2
     ORDER BY assigned_to, data->>'clock_in'`,
    [ids, month],
  )
  const now = new Date()
  const byKey = new Map()
  for (const row of rows) {
    const key = `${row.assigned_to}|${row.day}`
    const day = byKey.get(key) || { user_id: row.assigned_to, date: row.day, first_in: null, last_out: null, worked_seconds: 0, break_seconds: 0, late: false, open: false, corrected: false, entries: [] }
    const worked = row.status === 'OPEN' ? workedSeconds(row.data, now) : Number(row.data.worked_seconds ?? Math.round((row.data.hours || 0) * 3600))
    day.first_in = !day.first_in || row.data.clock_in < day.first_in ? row.data.clock_in : day.first_in
    if (row.data.clock_out && (!day.last_out || row.data.clock_out > day.last_out)) day.last_out = row.data.clock_out
    day.worked_seconds += worked
    day.break_seconds += Math.round(breakSeconds(row.data.breaks, row.data.clock_out ? new Date(row.data.clock_out) : now))
    day.late ||= Boolean(row.data.late)
    day.open ||= row.status === 'OPEN'
    day.corrected ||= Boolean(row.data.corrections?.length)
    day.entries.push({ record_id: row.record_id, clock_in: row.data.clock_in, clock_out: row.data.clock_out || null, status: row.status, corrections: row.data.corrections || [] })
    byKey.set(key, day)
  }
  const names = new Map(people.map((person) => [person.id, person.name]))
  return [...byKey.values()].map((day) => ({ ...day, name: names.get(day.user_id) || '' }))
}

const hhmm = (seconds) => `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`
const madridTime = (iso) => (iso ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : '')
const safe = (text) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text)

/** GET /attendance/report?month=YYYY-MM&user=ID&format=json|csv|xlsx — the monthly working-time record. */
export async function monthReport(req, res) {
  requireViewer(req.user)
  const month = String(req.query.month || new Date().toISOString().slice(0, 7))
  if (!MONTH.test(month)) throw httpError(400, 'Choose a valid month.')
  const leads = HR_ROLES.includes(req.user.role) || req.user.role === 'manager'
  const self = req.query.user === 'me' || Number(req.query.user) === req.user.sub || (!req.query.user && !leads)
  let people
  if (self) {
    // Every employee may see and download their own record.
    people = [{ id: req.user.sub, name: req.user.name, role: req.user.role }]
  } else if (req.query.user) {
    const id = Number(req.query.user)
    if (!Number.isInteger(id) || id < 1) throw httpError(400, 'Invalid person.')
    people = await members(req.user, id)
    if (!people.length) throw httpError(403, 'You can only see the attendance of your team.')
  } else {
    people = await members(req.user)
  }
  const days = await monthRows(people, month)
  const totals = people.map((person) => {
    const mine = days.filter((day) => day.user_id === person.id)
    return { user_id: person.id, name: person.name, days_worked: mine.length, worked_seconds: mine.reduce((sum, day) => sum + day.worked_seconds, 0), late_days: mine.filter((day) => day.late).length }
  })
  const format = String(req.query.format || 'json')
  if (format === 'json') return res.json({ data: { month, days, totals } })

  await writeAudit(req.user.sub, 'ATTENDANCE_EXPORT', 'zx:attendance', null, { month, people: people.length, format })
  const header = ['Employee', 'Date', 'First in', 'Last out', 'Worked (h:mm)', 'Breaks (h:mm)', 'Late', 'Corrected', 'Still open']
  const lines = days.map((day) => [day.name, day.date, madridTime(day.first_in), madridTime(day.last_out), hhmm(day.worked_seconds), hhmm(day.break_seconds), day.late ? 'Yes' : '', day.corrected ? 'Yes' : '', day.open ? 'Yes' : ''].map((value) => safe(String(value))))
  const name = `attendance-${month}${people.length === 1 ? `-${people[0].id}` : ''}`
  res.setHeader('Cache-Control', 'no-store')
  if (format === 'csv') {
    const escape = (text) => (/[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`)
    return res.send(`${String.fromCharCode(0xfeff)}${[header, ...lines].map((line) => line.map(escape).join(',')).join('\r\n')}`)
  }
  if (format !== 'xlsx') throw httpError(400, 'Choose CSV or Excel.')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Grupo Global ZYLAX'
  const sheet = workbook.addWorksheet(`Attendance ${month}`)
  sheet.addRow([`Working-time record ${month} (Europe/Madrid)`]).font = { bold: true, size: 13 }
  sheet.addRow([])
  sheet.addRow(header).font = { bold: true }
  for (const line of lines) sheet.addRow(line)
  sheet.addRow([])
  sheet.addRow(['Totals']).font = { bold: true }
  sheet.addRow(['Employee', 'Days worked', 'Worked (h:mm)', 'Late days']).font = { bold: true }
  for (const total of totals) sheet.addRow([safe(total.name), total.days_worked, hhmm(total.worked_seconds), total.late_days])
  sheet.columns.forEach((column, index) => { column.width = index === 0 ? 28 : 14 })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`)
  return res.send(Buffer.from(await workbook.xlsx.writeBuffer()))
}

/**
 * POST /attendance/entries/:id/correct { clock_in, clock_out, reason } — HR fixes an entry
 * (typically a forgotten clock-out). The previous values and the reason are kept on the record.
 */
export async function correctEntry(req, res) {
  if (!HR_ROLES.includes(req.user.role)) throw httpError(403, 'Only HR can correct attendance records.')
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw httpError(400, 'Invalid id.')
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 5 || reason.length > 500) throw httpError(400, 'Explain the correction (at least 5 characters).')
  const clockIn = new Date(req.body?.clock_in)
  const clockOut = new Date(req.body?.clock_out)
  if (Number.isNaN(clockIn.getTime()) || Number.isNaN(clockOut.getTime())) throw httpError(400, 'Enter a valid start and end time.')
  if (clockOut <= clockIn) throw httpError(400, 'The end must be after the start.')
  if (clockOut - clockIn > MAX_SHIFT_MS) throw httpError(400, 'A shift cannot be longer than 24 hours.')
  if (clockOut.getTime() > Date.now() + 60000) throw httpError(400, 'The end cannot be in the future.')

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT record_id, assigned_to, status, data FROM zx_records
       WHERE record_id = $1 AND module = 'attendance' AND entity = 'attendance' AND ${orgPredicate('owner_org_id', '$2')} FOR UPDATE`,
      [req.params.id, req.user.org_scope ?? null],
    )
    const row = rows[0]
    if (!row) throw httpError(404, 'Attendance entry not found.')
    if (row.assigned_to === req.user.sub) throw httpError(403, 'Ask another HR person to correct your own attendance.')
    await lock(client, `zx-clock-${row.assigned_to}`)
    // Breaks outside the corrected shift are trimmed to it; an open break ends at the new clock-out.
    const breaks = (row.data.breaks || [])
      .map((item) => ({ start: new Date(Math.max(new Date(item.start), clockIn)).toISOString(), end: new Date(Math.min(item.end ? new Date(item.end) : clockOut, clockOut)).toISOString() }))
      .filter((item) => item.end > item.start)
    const fixed = { clock_in: clockIn.toISOString(), clock_out: clockOut.toISOString(), breaks }
    const worked = workedSeconds(fixed, clockOut)
    const pause = Math.round(breakSeconds(breaks, clockOut))
    const correction = {
      at: new Date().toISOString(), by: req.user.sub, by_name: req.user.name, reason,
      before: { clock_in: row.data.clock_in, clock_out: row.data.clock_out || null, status: row.status },
    }
    const data = {
      ...fixed, worked_seconds: worked, break_minutes: Math.round(pause / 60), hours: Math.round((worked / 3600) * 100) / 100,
      corrections: [...(row.data.corrections || []), correction],
    }
    await client.query(`UPDATE zx_records SET status = 'CLOSED', data = data || $2::jsonb, updated_at = now() WHERE record_id = $1`, [row.record_id, JSON.stringify(data)])
    if (row.status !== 'CLOSED') {
      await client.query(`INSERT INTO zx_record_events (record_id, kind, from_status, to_status, created_by) VALUES ($1, 'status', $2, 'CLOSED', $3)`, [row.record_id, row.status, req.user.sub])
    }
    return { record_id: row.record_id, user_id: row.assigned_to, worked_seconds: worked }
  })
  await writeAudit(req.user.sub, 'ATTENDANCE_CORRECTED', 'zx:attendance', result.record_id, { user_id: result.user_id, reason })
  return res.json({ data: result, message: 'Attendance entry corrected.' })
}
