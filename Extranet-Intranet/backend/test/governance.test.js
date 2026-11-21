import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { config } from '../src/config/env.js'
import { addBusinessDays, requiredTier } from '../src/controllers/governance.controller.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

async function tempUser(role, stamp) {
  const email = `gov-${role}-${stamp}@example.test`
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role_id, status)
     VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name = $4), 'active') RETURNING id`,
    [`Gov Test ${role}`, email, await bcrypt.hash(config.seedUserPassword, 4), role],
  )
  return { id: rows[0].id, email }
}

describe('Code of Ethics', () => {
  it('computes business days and required tiers', () => {
    assert.equal(addBusinessDays('2026-11-20T10:00:00Z', 5), '2026-11-27') // Friday + 5 business days
    assert.equal(requiredTier('employee'), 'TIER_1_BASIC')
    assert.equal(requiredTier('hr'), 'TIER_2_EXECUTIVE')
    assert.equal(requiredTier('investor'), 'TIER_3_CRITICAL_VAULT')
  })

  it('applies the three-tier sanction regime with HR clearance', async () => {
    const admin = await loginAs('admin@gmail.com')
    const hr = await loginAs('hr@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const stamp = Date.now()
    const user = await tempUser('employee', stamp)

    try {
      // Signing the code.
      const session = await loginAs(user.email)
      const signed = await request(app).post('/api/governance/acknowledge').set(auth(session)).send({ accept: true })
      assert.equal(signed.status, 201)
      assert.match(signed.body.data.employment_contract_ref, /^[0-9a-f]{64}$/)
      assert.equal((await request(app).get('/api/governance/me').set(auth(session))).body.data.acknowledged, true)

      // Permissions.
      assert.equal((await request(app).get('/api/governance/register').set(auth(employee))).status, 403)
      assert.equal((await request(app).post('/api/governance/sanctions').set(auth(employee))
        .send({ user_id: user.id, tier: 1, reason: 'Not allowed to do this' })).status, 403)
      assert.equal((await request(app).post('/api/governance/sanctions').set(auth(hr))
        .send({ user_id: user.id, tier: 3, reason: 'HR cannot expel a user' })).status, 403)

      // Tier 1: warning, account stays active, 5 business days to remediate.
      const warning = await request(app).post('/api/governance/sanctions').set(auth(hr))
        .send({ user_id: user.id, tier: 1, reason: 'Procedural oversight on document sharing' })
      assert.equal(warning.status, 201)
      assert.ok(warning.body.data.remediation_due)
      assert.equal((await request(app).get('/api/governance/me').set(auth(session))).status, 200)

      // Tier 2: requires 14–30 days, suspends immediately, admin toggle cannot lift it.
      assert.equal((await request(app).post('/api/governance/sanctions').set(auth(hr))
        .send({ user_id: user.id, tier: 2, reason: 'Unauthorised sharing of a document', suspension_days: 5 })).status, 400)
      const suspension = await request(app).post('/api/governance/sanctions').set(auth(hr))
        .send({ user_id: user.id, tier: 2, reason: 'Unauthorised sharing of a document', suspension_days: 14 })
      assert.equal(suspension.status, 201)
      assert.equal((await request(app).get('/api/governance/me').set(auth(session))).status, 401)
      assert.equal((await request(app).patch(`/api/users/${user.id}/status`).set(auth(admin)).send({ status: 'active' })).status, 409)

      // HR clearance restores access.
      const cleared = await request(app).post(`/api/governance/sanctions/${suspension.body.data.sanction_id}/clear`).set(auth(hr)).send({ notes: 'Training completed, cleared.' })
      assert.equal(cleared.status, 200)
      assert.equal((await request(app).get('/api/governance/me').set(auth(session))).status, 200)

      // Tier 3: permanent, credentials revoked, cannot be cleared or reactivated.
      const expulsion = await request(app).post('/api/governance/sanctions').set(auth(admin))
        .send({ user_id: user.id, tier: 3, reason: 'Attempted access to the investor vault' })
      assert.equal(expulsion.status, 201)
      assert.equal((await request(app).post('/api/auth/login').send({ email: user.email, password: config.seedUserPassword })).status, 401)
      assert.equal((await request(app).post(`/api/governance/sanctions/${expulsion.body.data.sanction_id}/clear`).set(auth(admin)).send({ notes: 'Try to clear it' })).status, 409)
      assert.equal((await request(app).patch(`/api/users/${user.id}/status`).set(auth(admin)).send({ status: 'active' })).status, 404)

      // Self-sanction and sanctioning the Super Admin are blocked.
      assert.equal((await request(app).post('/api/governance/sanctions').set(auth(hr)).send({ user_id: hr.user.id, tier: 1, reason: 'Sanctioning myself here' })).status, 400)
      assert.equal((await request(app).post('/api/governance/sanctions').set(auth(hr)).send({ user_id: admin.user.id, tier: 1, reason: 'Sanctioning the president' })).status, 403)
    } finally {
      await query('DELETE FROM users WHERE id = $1', [user.id])
      await query("DELETE FROM notifications WHERE title LIKE 'Tier % sanction: Gov Test%'")
    }
  })
})
