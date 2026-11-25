import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const HUB = '/api/zylax/hub/attendance'
const stamp = Date.now()
const made = { users: [], records: [] }
const ago = (hours) => new Date(Date.now() - hours * 3600000).toISOString()
const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)

async function person(name) {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role_id, status)
     SELECT $1, $2, '!test', id, 'active' FROM roles WHERE name = 'employee' RETURNING id`,
    [name, `att-team-${made.users.length}-${stamp}@example.test`],
  )
  made.users.push(rows[0].id)
  return rows[0].id
}

async function record(module, entity, status, data, assignedTo = null, createdBy = null) {
  const { rows } = await query(
    `INSERT INTO zx_records (ref_no, module, entity, title, status, data, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING record_id`,
    [`T-${stamp}-${made.records.length}`, module, entity, `${entity} test`, status, JSON.stringify(data), assignedTo, createdBy],
  )
  made.records.push(rows[0].record_id)
  return rows[0].record_id
}

describe('Attendance for HR and managers', () => {
  let hr
  let manager
  let employee
  let inTeam
  let onLeave
  let outsider
  let forgotten

  before(async () => {
    hr = await loginAs('hr@gmail.com')
    manager = await loginAs('manager@gmail.com')
    employee = await loginAs('employee@gmail.com')
    inTeam = await person(`Team Ana ${stamp}`)
    onLeave = await person(`Team Leo ${stamp}`)
    outsider = await person(`Other Eva ${stamp}`)
    // Ana and Leo report to the manager (employee profiles); Eva does not.
    await record('people', 'profiles', 'ACTIVE', { user: String(inTeam), manager: String(manager.user.id), job_title: 'Analyst' })
    const department = await record('people', 'departments', 'ACTIVE', { head: String(manager.user.id) })
    await record('people', 'profiles', 'ACTIVE', { user: String(onLeave), department, job_title: 'Designer' })
    await record('people', 'profiles', 'ACTIVE', { user: String(outsider), job_title: 'Clerk' })
    // Ana forgot to clock out 15 hours ago (one 30-minute break); Eva worked today; Leo is on approved leave.
    forgotten = await record('attendance', 'attendance', 'OPEN', { clock_in: ago(15), late: true, breaks: [{ start: ago(12), end: ago(11.5) }] }, inTeam, inTeam)
    await record('attendance', 'attendance', 'CLOSED', { clock_in: ago(3), clock_out: ago(1), worked_seconds: 7200, hours: 2 }, outsider, outsider)
    const today = new Date().toISOString().slice(0, 10)
    await record('attendance', 'leave', 'APPROVED', { leave_type: 'ANNUAL', start_date: today, end_date: today, days: 1 }, null, onLeave)
  })

  after(async () => {
    await query('DELETE FROM zx_record_events WHERE record_id = ANY($1::uuid[])', [made.records])
    await query('DELETE FROM zx_records WHERE record_id = ANY($1::uuid[])', [made.records])
    await query('DELETE FROM users WHERE id = ANY($1::int[])', [made.users])
  })

  it('shows HR everyone and a manager only their team, with live state', async () => {
    const all = await request(app).get(`${HUB}/team`).set(auth(hr))
    assert.equal(all.status, 200)
    assert.equal(all.body.meta.scope, 'all')
    const byId = new Map(all.body.data.map((row) => [row.id, row]))
    assert.equal(byId.get(inTeam).state, 'IN')
    assert.equal(byId.get(inTeam).long_shift, true)
    assert.equal(byId.get(inTeam).late, true)
    assert.equal(byId.get(onLeave).state, 'LEAVE')
    assert.equal(byId.get(onLeave).leave_type, 'ANNUAL')
    assert.equal(byId.get(outsider).state, 'DONE')
    assert.equal(byId.get(outsider).today_seconds, 7200)

    const team = await request(app).get(`${HUB}/team`).set(auth(manager))
    assert.equal(team.status, 200)
    assert.equal(team.body.meta.scope, 'team')
    const ids = team.body.data.map((row) => row.id)
    assert.ok(ids.includes(inTeam), 'direct report')
    assert.ok(ids.includes(onLeave), 'member of a department the manager heads')
    assert.ok(!ids.includes(outsider), 'not in the team')

    assert.equal((await request(app).get(`${HUB}/team`).set(auth(employee))).status, 403)
  })

  it('gives the monthly working-time record, scoped the same way', async () => {
    const report = await request(app).get(`${HUB}/report?month=${month}&user=${inTeam}`).set(auth(manager))
    assert.equal(report.status, 200)
    const day = report.body.data.days.find((row) => row.user_id === inTeam)
    assert.ok(day, 'the day appears')
    assert.equal(day.open, true)
    assert.ok(Math.abs(day.break_seconds - 1800) <= 5)
    assert.equal((await request(app).get(`${HUB}/report?month=${month}&user=${outsider}`).set(auth(manager))).status, 403)
    assert.equal((await request(app).get(`${HUB}/report?month=2026-13`).set(auth(hr))).status, 400)

    // Employees always get their own record, and nobody else's.
    const mine = await request(app).get(`${HUB}/report?month=${month}`).set(auth(employee))
    assert.equal(mine.status, 200)
    assert.ok(mine.body.data.totals.every((row) => row.user_id === employee.user.id))
    assert.equal((await request(app).get(`${HUB}/report?month=${month}&user=${inTeam}`).set(auth(employee))).status, 403)
  })

  it('exports Excel and CSV for the labour inspectorate', async () => {
    const xlsx = await request(app).get(`${HUB}/report?month=${month}&format=xlsx`).set(auth(hr)).buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))) })
    assert.equal(xlsx.status, 200)
    assert.match(xlsx.headers['content-type'], /spreadsheetml/)
    assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK')
    const csv = await request(app).get(`${HUB}/report?month=${month}&user=${inTeam}&format=csv`).set(auth(hr))
    assert.equal(csv.status, 200)
    assert.equal(csv.text.charCodeAt(0), 0xfeff, 'BOM so Excel shows accents')
    assert.match(csv.text, /Employee,Date,First in,Last out,Worked/)
    assert.match(csv.text, new RegExp(`Team Ana ${stamp}`))
    const audit = await query("SELECT 1 FROM audit_logs WHERE user_id = $1 AND action = 'ATTENDANCE_EXPORT'", [hr.user.id])
    assert.ok(audit.rowCount > 0)
  })

  it('lets HR correct a forgotten clock-out, keeping the reason and the old values', async () => {
    const body = { clock_in: ago(15), clock_out: ago(7), reason: 'Forgot to clock out; confirmed with the employee.' }
    assert.equal((await request(app).post(`${HUB}/entries/${forgotten}/correct`).set(auth(manager)).send(body)).status, 403)
    assert.equal((await request(app).post(`${HUB}/entries/${forgotten}/correct`).set(auth(hr)).send({ ...body, reason: 'x' })).status, 400)
    assert.equal((await request(app).post(`${HUB}/entries/${forgotten}/correct`).set(auth(hr)).send({ ...body, clock_out: ago(16) })).status, 400)
    assert.equal((await request(app).post(`${HUB}/entries/${forgotten}/correct`).set(auth(hr)).send({ ...body, clock_out: new Date(Date.now() + 3600000).toISOString() })).status, 400)

    const fixed = await request(app).post(`${HUB}/entries/${forgotten}/correct`).set(auth(hr)).send(body)
    assert.equal(fixed.status, 200)
    // 8 hours minus the 30-minute break.
    assert.ok(Math.abs(fixed.body.data.worked_seconds - 27000) <= 5, `worked ${fixed.body.data.worked_seconds}`)
    const { rows } = await query('SELECT status, data FROM zx_records WHERE record_id = $1', [forgotten])
    assert.equal(rows[0].status, 'CLOSED')
    assert.equal(rows[0].data.corrections.length, 1)
    assert.equal(rows[0].data.corrections[0].reason, body.reason)
    assert.equal(rows[0].data.corrections[0].before.status, 'OPEN')
    assert.equal(rows[0].data.corrections[0].by, hr.user.id)
    assert.equal(rows[0].data.break_minutes, 30)

    const team = await request(app).get(`${HUB}/team`).set(auth(hr))
    // No longer working (the shift may have started yesterday, Madrid time).
    assert.ok(['DONE', 'OUT'].includes(team.body.data.find((row) => row.id === inTeam).state))
    const report = await request(app).get(`${HUB}/report?month=${month}&user=${inTeam}`).set(auth(hr))
    const corrected = await request(app).get(`${HUB}/report?month=${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(new Date(body.clock_in)).slice(0, 7)}&user=${inTeam}`).set(auth(hr))
    assert.equal(report.status, 200)
    assert.equal(corrected.body.data.days.find((row) => row.user_id === inTeam).corrected, true)
  })
})
