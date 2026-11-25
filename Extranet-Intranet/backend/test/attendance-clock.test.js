import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const URL = '/api/zylax/hub/attendance/clock'
const shiftOf = async (userId) => (await query(
  "SELECT record_id, status, data FROM zx_records WHERE module = 'attendance' AND entity = 'attendance' AND assigned_to = $1 ORDER BY created_at DESC LIMIT 1",
  [userId],
)).rows[0]
/** Moves the open shift's timestamps back so durations are real without waiting. */
async function shiftBack(recordId, data) {
  await query('UPDATE zx_records SET data = $2::jsonb WHERE record_id = $1', [recordId, JSON.stringify(data)])
}
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString()

describe('Attendance clock: breaks, live worked time and daily totals', () => {
  let hr
  const clock = (action) => request(app).post(URL).set(auth(hr)).send({ action })
  const status = async () => (await request(app).get(URL).set(auth(hr))).body.data

  before(async () => {
    hr = await loginAs('hr@gmail.com')
    await query("DELETE FROM zx_records WHERE module = 'attendance' AND entity = 'attendance' AND assigned_to = $1", [hr.user.id])
  })
  after(async () => {
    await query("DELETE FROM zx_records WHERE module = 'attendance' AND entity = 'attendance' AND assigned_to = $1", [hr.user.id])
  })

  it('shows zero before clocking in and refuses breaks outside a shift', async () => {
    const before = await status()
    assert.equal(before.open, null)
    assert.equal(before.today_seconds, 0)
    assert.ok(before.server_now)
    assert.equal((await clock('break_start')).status, 409)
    assert.equal((await clock('lunch')).status, 400)
  })

  it('counts time from the first minute, live, while the shift is open', async () => {
    assert.equal((await clock('in')).status, 200)
    const shift = await shiftOf(hr.user.id)
    await shiftBack(shift.record_id, { ...shift.data, clock_in: ago(1) })
    const now = await status()
    assert.ok(now.open.worked_seconds >= 59 && now.open.worked_seconds <= 65, `worked ${now.open.worked_seconds}`)
    assert.equal(now.open.on_break, false)
    assert.ok(now.today_seconds >= 59)
  })

  it('pauses the worked time during a break', async () => {
    assert.equal((await clock('break_start')).status, 200)
    assert.equal((await clock('break_start')).status, 409)
    let shift = await shiftOf(hr.user.id)
    // 90 minutes in, of which the last 30 were a break.
    await shiftBack(shift.record_id, { ...shift.data, clock_in: ago(90), breaks: [{ start: ago(30), end: null }] })
    const onBreak = await status()
    assert.equal(onBreak.open.on_break, true)
    assert.ok(Math.abs(onBreak.open.worked_seconds - 3600) <= 5, `worked ${onBreak.open.worked_seconds}`)
    assert.ok(Math.abs(onBreak.open.break_seconds - 1800) <= 5)

    assert.equal((await clock('break_end')).status, 200)
    assert.equal((await clock('break_end')).status, 409)
    shift = await shiftOf(hr.user.id)
    assert.ok(shift.data.breaks[0].end)
  })

  it('clocks out with net hours, closing a break left running', async () => {
    let shift = await shiftOf(hr.user.id)
    await shiftBack(shift.record_id, { ...shift.data, clock_in: ago(120), breaks: [{ start: ago(100), end: ago(90) }, { start: ago(10), end: null }] })
    const out = await clock('out')
    assert.equal(out.status, 200)
    assert.ok(Math.abs(out.body.data.worked_seconds - 6000) <= 5, `worked ${out.body.data.worked_seconds}`)
    assert.ok(Math.abs(out.body.data.break_seconds - 1200) <= 5)
    assert.equal(out.body.data.hours, 1.67)
    shift = await shiftOf(hr.user.id)
    assert.equal(shift.status, 'CLOSED')
    assert.equal(shift.data.break_minutes, 20)
    assert.ok(shift.data.breaks.every((item) => item.end))

    const after = await status()
    assert.equal(after.open, null)
    assert.ok(Math.abs(after.today_seconds - 6000) <= 5, 'closed shifts still count toward today')
    assert.ok(after.week_seconds >= after.today_seconds)
  })
})
