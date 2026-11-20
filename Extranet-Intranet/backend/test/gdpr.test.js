import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('GDPR export and erasure', () => {
  it('exports a user’s data and erases them on request', async () => {
    const admin = await loginAs('admin@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const email = `gdpr-${Date.now()}@example.test`
    const meta = await request(app).get('/api/users/meta').set(auth(admin))
    const roleId = meta.body.data.roles.find((role) => role.name === 'employee').id

    const created = await request(app).post('/api/users').set(auth(admin))
      .send({ name: 'Temporary Person', email, password: 'TempPass123!', role_id: roleId })
    assert.equal(created.status, 201)
    const id = created.body.data.id

    try {
      await request(app).post('/api/emails').set(auth(employee)).send({ to: email, subject: 'GDPR test', body: 'Personal data' })

      const self = await request(app).post('/api/auth/login').send({ email, password: 'TempPass123!' })
      const own = await request(app).get('/api/auth/me/export').set(auth(self.body.data))
      assert.equal(own.status, 200)
      assert.equal(own.body.profile.email, email)
      assert.equal(own.body.emails.length, 1)
      assert.equal('password_hash' in own.body.profile, false)

      const hrDenied = await request(app).get(`/api/users/${id}/export`).set(auth(employee))
      assert.equal(hrDenied.status, 403)

      const selfErase = await request(app).post(`/api/users/${admin.user.id}/erase`).set(auth(admin))
      assert.equal(selfErase.status, 400)

      const erased = await request(app).post(`/api/users/${id}/erase`).set(auth(admin))
      assert.equal(erased.status, 200)

      const row = (await query('SELECT name, email, status FROM users WHERE id = $1', [id])).rows[0]
      assert.equal(row.status, 'erased')
      assert.equal(row.name, 'Deleted user')
      assert.notEqual(row.email, email)
      assert.equal((await query('SELECT COUNT(*)::int AS n FROM emails WHERE user_id = $1', [id])).rows[0].n, 0)

      const loginAfter = await request(app).post('/api/auth/login').send({ email, password: 'TempPass123!' })
      assert.equal(loginAfter.status, 401)

      const reactivate = await request(app).patch(`/api/users/${id}/status`).set(auth(admin)).send({ status: 'active' })
      assert.equal(reactivate.status, 404, 'erased accounts cannot be reactivated')
    } finally {
      await query("DELETE FROM emails WHERE subject = 'GDPR test'")
      await query('DELETE FROM users WHERE id = $1', [id])
    }
  })
})
