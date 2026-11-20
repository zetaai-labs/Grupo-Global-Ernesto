import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'

describe('role checks', () => {
  it('allows admins to list users', async () => {
    const admin = await loginAs('admin@gmail.com')
    const response = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
    assert.equal(response.status, 200)
    assert.ok(response.body.data.length >= 3)
  })

  it('denies partners access to user management', async () => {
    const partner = await loginAs('partner@gmail.com')
    const response = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${partner.token}`)
    assert.equal(response.status, 403)
  })

  it('shows an employee only their own conversations', async () => {
    const employee = await loginAs('employee@gmail.com')
    const response = await request(app)
      .get('/api/chat/conversations?portal=extranet')
      .set('Authorization', `Bearer ${employee.token}`)
    assert.equal(response.status, 200)
    assert.equal(response.body.data.length, 0)
  })
})
