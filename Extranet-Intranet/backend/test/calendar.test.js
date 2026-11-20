import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { canJoinRoom, sendEventReminders } from '../src/controllers/calendar.controller.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('calendar invitations and meeting rooms', () => {
  it('invites a client to an online meeting, handles RSVP, reminders and room access', async () => {
    const manager = await loginAs('manager@gmail.com')
    const customer = await loginAs('customer@gmail.com')
    const supplier = await loginAs('supplier@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const title = `Client call ${Date.now()}`

    const created = await request(app)
      .post('/api/content/calendar/events')
      .set(auth(manager))
      .send({
        title,
        starts_at: new Date(Date.now() + 10 * 60000).toISOString(),
        online: true,
        attendee_ids: [customer.user.id],
      })
    assert.equal(created.status, 201)
    const { id, video_room: room } = created.body.data
    assert.match(room, /^gg-[0-9a-f]{12}$/)

    try {
      const notes = await request(app).get('/api/notifications').set(auth(customer))
      const invite = notes.body.data.find((n) => n.title === `Invitation: ${title}`)
      assert.ok(invite, 'customer is notified')
      assert.equal(invite.link, `/extranet/video-conferencing?room=${room}`)

      const customerEvents = await request(app).get('/api/content/calendar/events').set(auth(customer))
      assert.ok(customerEvents.body.data.some((e) => e.id === id), 'invitee sees the event')
      const supplierEvents = await request(app).get('/api/content/calendar/events').set(auth(supplier))
      assert.equal(supplierEvents.body.data.some((e) => e.id === id), false, 'other externals do not')

      const rsvp = await request(app).post(`/api/content/calendar/events/${id}/respond`).set(auth(customer)).send({ response: 'accepted' })
      assert.equal(rsvp.status, 200)
      const notInvited = await request(app).post(`/api/content/calendar/events/${id}/respond`).set(auth(supplier)).send({ response: 'accepted' })
      assert.equal(notInvited.status, 404)

      assert.equal(await canJoinRoom({ sub: customer.user.id, role: 'client' }, room), true)
      assert.equal(await canJoinRoom({ sub: supplier.user.id, role: 'supplier' }, room), false)
      assert.equal(await canJoinRoom({ sub: supplier.user.id, role: 'supplier' }, 'intranet-meeting'), false)

      assert.ok((await sendEventReminders(15)) >= 1, 'event starting in 10 min gets a reminder')
      assert.equal(await sendEventReminders(15) >= 0, true)
      const reminded = await query('SELECT reminded_at FROM calendar_events WHERE id = $1', [id])
      assert.ok(reminded.rows[0].reminded_at, 'reminder sent only once')

      const externalCreate = await request(app).post('/api/content/calendar/events').set(auth(customer)).send({ title: 'x', starts_at: new Date().toISOString() })
      assert.equal(externalCreate.status, 403)

      const notOrganiser = await request(app).delete(`/api/content/calendar/events/${id}`).set(auth(employee))
      assert.equal(notOrganiser.status, 403)
      const cancelled = await request(app).delete(`/api/content/calendar/events/${id}`).set(auth(manager))
      assert.equal(cancelled.status, 200)
    } finally {
      await query('DELETE FROM calendar_events WHERE id = $1', [id])
      await query('DELETE FROM notifications WHERE title LIKE $1', [`%${title}%`])
    }
  })
})
