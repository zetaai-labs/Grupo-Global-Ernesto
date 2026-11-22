import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import JSZip from 'jszip'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { config } from '../src/config/env.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const binary = (res, done) => {
  const chunks = []
  res.on('data', (chunk) => chunks.push(chunk))
  res.on('end', () => done(null, Buffer.concat(chunks)))
}

describe('GDPR ARCO rights', () => {
  it('handles access, rectification, opposition and cancellation', async () => {
    const admin = await loginAs('admin@gmail.com')
    const hr = await loginAs('hr@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const email = `arco-${Date.now()}@example.test`
    const id = (await query(
      `INSERT INTO users (name, email, password_hash, role_id, status)
       VALUES ('Arco Person', $1, $2, (SELECT id FROM roles WHERE name = 'employee'), 'active') RETURNING id`,
      [email, await bcrypt.hash(config.seedUserPassword, 4)],
    )).rows[0].id

    try {
      const session = await loginAs(email)

      // Access: ZIP with one file per category and no secrets.
      const exported = await request(app).get('/api/privacy/export').set(auth(session)).buffer(true).parse(binary)
      assert.equal(exported.status, 200)
      const zip = await JSZip.loadAsync(exported.body)
      assert.ok(zip.file('README.txt') && zip.file('profile.json') && zip.file('emails.json'))
      const profile = await zip.file('profile.json').async('string')
      assert.ok(profile.includes(email))
      assert.equal(profile.includes('password_hash'), false)

      // Rectification.
      const rect = await request(app).post('/api/privacy/requests').set(auth(session))
        .send({ request_type: 'RECTIFICATION', field: 'name', requested_value: 'Arco Corrected', details: 'My surname is spelled wrongly.' })
      assert.equal(rect.status, 201)
      assert.equal((await request(app).post('/api/privacy/requests').set(auth(session))
        .send({ request_type: 'RECTIFICATION', field: 'name', requested_value: 'Other Name', details: 'A second pending request.' })).status, 409)
      assert.equal((await request(app).post(`/api/privacy/requests/${rect.body.data.request_id}/decide`).set(auth(employee))
        .send({ decision: 'APPROVED', response: 'Not an officer' })).status, 403)
      assert.equal((await request(app).post(`/api/privacy/requests/${rect.body.data.request_id}/decide`).set(auth(hr))
        .send({ decision: 'APPROVED', response: 'Corrected, thank you.' })).status, 200)
      assert.equal((await query('SELECT name FROM users WHERE id = $1', [id])).rows[0].name, 'Arco Corrected')

      // Opposition removes the person from the directory.
      const opposition = await request(app).post('/api/privacy/requests').set(auth(session))
        .send({ request_type: 'OPPOSITION', details: 'I object to appearing in the directory.' })
      await request(app).post(`/api/privacy/requests/${opposition.body.data.request_id}/decide`).set(auth(hr))
        .send({ decision: 'APPROVED', response: 'Opposition applied.' })
      const directory = await request(app).get('/api/community/directory?q=Arco').set(auth(employee))
      assert.equal(directory.body.data.some((person) => person.id === id), false)

      // Cancellation: HR cannot approve, the Super Admin can.
      const cancel = await request(app).post('/api/privacy/requests').set(auth(session))
        .send({ request_type: 'CANCELLATION', details: 'Please delete my personal data.' })
      assert.equal((await request(app).post(`/api/privacy/requests/${cancel.body.data.request_id}/decide`).set(auth(hr))
        .send({ decision: 'APPROVED', response: 'Trying as HR.' })).status, 403)
      assert.equal((await request(app).post(`/api/privacy/requests/${cancel.body.data.request_id}/decide`).set(auth(admin))
        .send({ decision: 'APPROVED', response: 'Your data has been erased.' })).status, 200)
      const erased = (await query('SELECT name, status FROM users WHERE id = $1', [id])).rows[0]
      assert.equal(erased.status, 'erased')
      assert.equal(erased.name, 'Deleted user')
      assert.equal((await query('SELECT details FROM gdpr_requests WHERE request_id = $1', [cancel.body.data.request_id])).rows[0].details, '[erased]')
    } finally {
      await query('DELETE FROM users WHERE id = $1', [id])
      await query("DELETE FROM notifications WHERE title LIKE 'GDPR %'")
    }
  })
})
