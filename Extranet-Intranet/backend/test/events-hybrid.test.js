import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { canJoinRoom } from '../src/controllers/calendar.controller.js'
import { openMessage, sealMessage, chatEncryptionOn } from '../src/services/chatCrypto.service.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const records = []

describe('hybrid events and B2B meetings', () => {
  after(async () => {
    if (records.length) await query('DELETE FROM zx_records WHERE record_id = ANY($1::uuid[])', [records])
  })

  it('opens the online room to confirmed participants and books 1:1 meetings without double booking', async () => {
    const [admin, employee, manager, hr] = await Promise.all(['admin', 'employee', 'manager', 'hr'].map((n) => loginAs(`${n}@gmail.com`)))
    const ids = Object.fromEntries((await query("SELECT email, id FROM users WHERE email IN ('employee@gmail.com', 'manager@gmail.com', 'hr@gmail.com')")).rows.map((r) => [r.email.split('@')[0], r.id]))
    const start = new Date(Date.now() + 24 * 3600 * 1000)
    start.setUTCMinutes(0, 0, 0)
    const end = new Date(start.getTime() + 4 * 3600 * 1000)
    const event = await request(app).post('/api/zylax/hub/events/events').set(auth(admin)).send({
      title: `Hybrid forum ${Date.now()}`, kind: 'CONFERENCE', mode: 'HYBRID', venue: 'Madrid HQ',
      start_at: start.toISOString(), end_at: end.toISOString(), capacity: 50,
    })
    assert.equal(event.status, 201, JSON.stringify(event.body))
    const eventId = event.body.data.record_id
    records.push(eventId)
    const base = `/api/zylax/hub/events/events/${eventId}`

    // Not registered yet: no online room, no B2B.
    assert.equal((await request(app).get(`${base}/join`).set(auth(employee))).status, 403)
    assert.equal((await request(app).get(`${base}/b2b/participants`).set(auth(employee))).status, 403)

    const register = async (who, email, attendance) => {
      const response = await request(app).post('/api/zylax/hub/events/registrations').set(auth(who)).send({ title: email, event: eventId, email, attendance })
      assert.equal(response.status, 201, JSON.stringify(response.body))
      records.push(response.body.data.record_id)
    }
    await register(employee, 'employee@gmail.com', 'ONLINE')
    await register(manager, 'manager@gmail.com', 'IN_PERSON')
    await register(hr, 'hr@gmail.com', 'ONLINE')

    const join = await request(app).get(`${base}/join`).set(auth(employee))
    assert.equal(join.status, 200)
    assert.equal(join.body.data.room, `ev-${eventId}`)
    const employeeUser = { sub: ids.employee, role: 'employee' }
    assert.equal(await canJoinRoom(employeeUser, `ev-${eventId}`), true)
    assert.equal(await canJoinRoom({ sub: 999999, role: 'employee' }, `ev-${eventId}`), false)

    const people = await request(app).get(`${base}/b2b/participants`).set(auth(employee))
    assert.ok(people.body.data.some((p) => p.id === ids.manager))
    assert.ok(!people.body.data.some((p) => p.id === ids.employee), 'not listing yourself')

    const slot = new Date(start.getTime() + 3600 * 1000).toISOString()
    const ask = (who, body) => request(app).post(`${base}/b2b/meetings`).set(auth(who)).send(body)
    assert.equal((await ask(employee, { recipient_id: ids.manager, slot_start: new Date(end.getTime() + 3600e3).toISOString(), mode: 'ONLINE' })).status, 400, 'outside the event')
    const first = await ask(employee, { recipient_id: ids.manager, slot_start: slot, mode: 'IN_PERSON', message: 'Retail roll-out' })
    assert.equal(first.status, 201)
    const second = await ask(hr, { recipient_id: ids.manager, slot_start: slot, mode: 'ONLINE' })
    assert.equal(second.status, 201)

    // Only the recipient can respond.
    const respond = (who, id, accept) => request(app).post(`${base}/b2b/meetings/${id}/respond`).set(auth(who)).send({ accept })
    assert.equal((await respond(employee, first.body.data.meeting_id, true)).status, 404)
    const accepted = await respond(manager, first.body.data.meeting_id, true)
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.data.table_label, 'B2B-1')
    assert.equal((await respond(manager, second.body.data.meeting_id, true)).status, 409, 'the manager is already booked then')
    assert.equal((await respond(manager, second.body.data.meeting_id, false)).status, 200)

    // An accepted online meeting gets a private room for the two people only.
    const third = await ask(hr, { recipient_id: ids.employee, slot_start: new Date(start.getTime() + 2 * 3600e3).toISOString(), mode: 'ONLINE' })
    const online = await respond(employee, third.body.data.meeting_id, true)
    assert.equal(online.body.data.room, `b2b-${third.body.data.meeting_id}`)
    assert.equal(await canJoinRoom(employeeUser, online.body.data.room), true)
    assert.equal(await canJoinRoom({ sub: ids.manager, role: 'manager' }, online.body.data.room), false)

    const mine = await request(app).get(`${base}/b2b/meetings`).set(auth(employee))
    assert.equal(mine.body.data.length, 2)
    assert.equal((await request(app).post(`${base}/b2b/meetings/${third.body.data.meeting_id}/cancel`).set(auth(hr))).status, 200)
    assert.equal(await canJoinRoom(employeeUser, online.body.data.room), false, 'cancelled meetings close the room')
  })
})

describe('chat encryption at rest', () => {
  it('stores messages encrypted and returns them in clear to members', async () => {
    assert.equal(chatEncryptionOn(), true, 'STORAGE_ENCRYPTION_KEY is set in the test environment')
    const sealed = sealMessage('Hola equipo')
    assert.match(sealed, /^enc:v1:/)
    assert.equal(openMessage(sealed), 'Hola equipo')
    assert.equal(openMessage('old plain message'), 'old plain message')

    const employee = await loginAs('employee@gmail.com')
    const conversation = (await request(app).get('/api/chat/conversations?portal=intranet').set(auth(employee))).body.data[0]
    const text = `Secret plan ${Date.now()}`
    const sent = await request(app).post(`/api/chat/conversations/${conversation.id}/messages`).set(auth(employee)).send({ body: text })
    assert.equal(sent.status, 201)
    assert.equal(sent.body.data.body, text)
    const stored = (await query('SELECT body FROM messages WHERE id = $1', [sent.body.data.id])).rows[0].body
    assert.match(stored, /^enc:v1:/)
    assert.ok(!stored.includes('Secret plan'))
    const list = await request(app).get(`/api/chat/conversations/${conversation.id}/messages`).set(auth(employee))
    assert.ok(list.body.data.some((m) => m.body === text))
    const note = await query("SELECT body FROM notifications WHERE type = 'chat' ORDER BY created_at DESC LIMIT 1")
    assert.ok(!String(note.rows[0]?.body).includes('Secret plan'), 'notifications do not copy the text')
    await query('DELETE FROM messages WHERE id = $1', [sent.body.data.id])
  })
})
