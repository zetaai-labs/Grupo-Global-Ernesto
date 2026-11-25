import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const EMAIL = 'session-test@example.test'
const PASSWORD = 'Session-Test-2026'
const auth = (token) => ({ Authorization: `Bearer ${token}` })
const me = (token) => request(app).get('/api/auth/me').set(auth(token))
const login = async () => (await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })).body.data.token

before(async () => {
  await query(
    `INSERT INTO users (name, email, password_hash, role_id, status)
     SELECT 'Session Test', $1, $2, id, 'active' FROM roles WHERE name = 'employee'
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active', mfa_enabled = false`,
    [EMAIL, await bcrypt.hash(PASSWORD, 4)],
  )
})

describe('session revocation', () => {
  it('ends all sessions on "sign out everywhere"', async () => {
    const [a, b] = [await login(), await login()]
    assert.equal((await me(a)).status, 200)
    assert.equal((await request(app).post('/api/auth/logout-everywhere').set(auth(a))).status, 200)
    assert.equal((await me(a)).status, 401)
    assert.equal((await me(b)).status, 401)
    assert.equal((await me(await login())).status, 200, 'a new sign-in works')
  })

  it('signs out other devices on password change but keeps this one', async () => {
    const [here, other] = [await login(), await login()]
    const changed = await request(app).post('/api/auth/password').set(auth(here)).send({ current_password: PASSWORD, new_password: 'Session-Test-2027' })
    assert.equal(changed.status, 200)
    assert.equal((await me(other)).status, 401)
    assert.equal((await me(here)).status, 401, 'the old token is replaced')
    assert.equal((await me(changed.body.data.token)).status, 200)
    await query('UPDATE users SET password_hash = $2 WHERE email = $1', [EMAIL, await bcrypt.hash(PASSWORD, 4)])
  })

  it('does not bring old sessions back when a suspended account is reactivated', async () => {
    const token = await login()
    const admin = await loginAs('admin@gmail.com')
    const id = (await query('SELECT id FROM users WHERE email = $1', [EMAIL])).rows[0].id
    assert.equal((await request(app).patch(`/api/users/${id}/status`).set(auth(admin.token)).send({ status: 'suspended' })).status, 200)
    assert.equal((await request(app).patch(`/api/users/${id}/status`).set(auth(admin.token)).send({ status: 'active' })).status, 200)
    assert.equal((await me(token)).status, 401)
  })
})
