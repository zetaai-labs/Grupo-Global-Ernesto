import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { config } from '../src/config/env.js'

describe('authentication', () => {
  it('issues a JWT for seeded credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@gmail.com', password: config.seedUserPassword })

    assert.equal(response.status, 200)
    assert.ok(response.body.data.token)
    assert.equal(response.body.data.user.role, 'admin')
    assert.equal(response.body.data.user.region, 'GLOBAL')
  })

  it('rejects an incorrect password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@gmail.com', password: 'definitely-wrong' })
    assert.equal(response.status, 401)
  })

  it('blocks a suspended user even with a valid token', async () => {
    // A dedicated account: suspending a shared demo account would end other tests' sessions.
    const { query } = await import('../src/config/database.js')
    const { default: bcrypt } = await import('bcryptjs')
    const email = 'suspend-test@example.test'
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role_id, status)
       SELECT 'Suspend Test', $1, $2, id, 'active' FROM roles WHERE name = 'partner'
       ON CONFLICT (email) DO UPDATE SET status = 'active', password_hash = EXCLUDED.password_hash RETURNING id`,
      [email, await bcrypt.hash('Suspend-Test-2026', 4)],
    )
    const admin = await loginAs('admin@gmail.com')
    const user = (await request(app).post('/api/auth/login').send({ email, password: 'Suspend-Test-2026' })).body.data
    const headers = { Authorization: `Bearer ${admin.token}` }

    await request(app).patch(`/api/users/${rows[0].id}/status`).set(headers).send({ status: 'suspended' })

    try {
      const denied = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${user.token}`)
      assert.equal(denied.status, 401)
    } finally {
      await request(app).patch(`/api/users/${rows[0].id}/status`).set(headers).send({ status: 'active' })
    }
  })
})
