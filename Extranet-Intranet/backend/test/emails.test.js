import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('mailboxes', () => {
  it('delivers internal mail to the recipient inbox and keeps mailboxes private', async () => {
    const employee = await loginAs('employee@gmail.com')
    const hr = await loginAs('hr@gmail.com')
    const manager = await loginAs('manager@gmail.com')
    const subject = `Mailbox test ${Date.now()}`

    const sent = await request(app)
      .post('/api/emails')
      .set(auth(employee))
      .send({ to: 'hr@gmail.com', subject, body: 'Hello HR' })
    assert.equal(sent.status, 201)
    assert.equal(sent.body.data.status, 'delivered')

    try {
      const inbox = await request(app).get('/api/emails?folder=inbox').set(auth(hr))
      const message = inbox.body.data.find((email) => email.subject === subject)
      assert.ok(message, 'HR should receive the email')
      assert.equal(message.read_at, null)

      const opened = await request(app).get(`/api/emails/${message.id}`).set(auth(hr))
      assert.equal(opened.status, 200)
      assert.equal(opened.body.data.body, 'Hello HR')
      assert.ok(opened.body.data.read_at)

      const snoop = await request(app).get(`/api/emails/${message.id}`).set(auth(manager))
      assert.equal(snoop.status, 404)

      const sentBox = await request(app).get('/api/emails?folder=sent').set(auth(employee))
      assert.ok(sentBox.body.data.some((email) => email.subject === subject))

      const invalid = await request(app).post('/api/emails').set(auth(employee)).send({ to: 'not-an-email', subject: 'x', body: 'y' })
      assert.equal(invalid.status, 400)
    } finally {
      await query('DELETE FROM emails WHERE subject = $1', [subject])
      await query('DELETE FROM notifications WHERE body = $1', [subject])
    }
  })
})
