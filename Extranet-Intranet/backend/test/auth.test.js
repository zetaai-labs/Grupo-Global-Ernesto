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
    const admin = await loginAs('admin@gmail.com')
    const partner = await loginAs('partner@gmail.com')
    const headers = { Authorization: `Bearer ${admin.token}` }

    await request(app).patch('/api/users/3/status').set(headers).send({ status: 'suspended' })

    try {
      const denied = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${partner.token}`)
      assert.equal(denied.status, 401)
    } finally {
      await request(app).patch('/api/users/3/status').set(headers).send({ status: 'active' })
    }
  })
})
