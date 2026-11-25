import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { parseArgs, validate } from '../database/scripts/create-admin.js'

// A dedicated account: test files run in parallel, so changing a shared demo password would break them.
const EMAIL = 'password-test@example.test'
const START = 'Start-Password-2026'
const auth = (s) => ({ Authorization: `Bearer ${s.token}` })
const change = (session, body) => request(app).post('/api/auth/password').set(auth(session)).send(body)
const login = (password) => request(app).post('/api/auth/login').send({ email: EMAIL, password })

before(async () => {
  const hash = await bcrypt.hash(START, 4)
  await query(
    `INSERT INTO users (name, email, password_hash, role_id, status)
     SELECT 'Password Test', $1, $2, id, 'active' FROM roles WHERE name = 'employee'
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active', mfa_enabled = false`,
    [EMAIL, hash],
  )
})

describe('change password', () => {
  it('requires the current password and a strong new one', async () => {
    const session = (await login(START)).body.data
    assert.ok(session?.token)
    assert.equal((await request(app).post('/api/auth/password').send({})).status, 401)
    assert.equal((await change(session, { current_password: 'wrong-password', new_password: 'A-new-password-123' })).status, 400)
    assert.equal((await change(session, { current_password: START, new_password: 'short' })).status, 400)
    assert.equal((await change(session, { current_password: START, new_password: START })).status, 400)
    assert.equal((await change(session, { current_password: START, new_password: 'A-new-password-123' })).status, 200)
    assert.equal((await login(START)).status, 401)
    assert.equal((await login('A-new-password-123')).status, 200)
  })

  it('is open to external users too', async () => {
    const customer = await loginAs('customer@gmail.com')
    assert.equal((await change(customer, { current_password: 'wrong-password', new_password: 'A-new-password-123' })).status, 400)
  })
})

describe('first administrator script', () => {
  it('validates its arguments before touching the database', () => {
    assert.deepEqual(parseArgs(['--email', 'a@b.es', '--name', 'Ana Ruiz']), { email: 'a@b.es', name: 'Ana Ruiz' })
    assert.throws(() => parseArgs(['--email']), /Missing value/)
    assert.throws(() => parseArgs(['stray']), /Unexpected argument/)
    assert.deepEqual(validate({ email: 'a@b.es', name: 'Ana Ruiz' }, ''), [])
    assert.equal(validate({ email: 'nope', name: 'A' }, 'short').length, 3)
    assert.equal(validate({ email: 'a@b.es', name: 'Ana', country: 'es' }, '').length, 1)
  })
})
