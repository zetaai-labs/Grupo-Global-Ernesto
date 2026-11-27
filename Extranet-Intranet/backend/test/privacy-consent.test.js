import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { config } from '../src/config/env.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('Privacy policy acceptance', () => {
  const email = `consent-${Date.now()}@example.test`
  let userId

  before(async () => {
    config.privacy.enforce = true
    // A dedicated account: withdrawing consent ends its sessions, which must not disturb other test files.
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role_id, region_id, status)
       SELECT 'Consent Tester', $1, password_hash, role_id, region_id, 'active' FROM users WHERE email = 'employee@gmail.com'
       RETURNING id`,
      [email],
    )
    userId = rows[0].id
  })
  after(async () => {
    config.privacy.enforce = false
    await query('DELETE FROM privacy_consents WHERE user_id = $1', [userId])
    await query("UPDATE users SET status = 'deleted' WHERE id = $1", [userId])
  })

  it('publishes the policy version and the essential-only cookie list', async () => {
    const res = await request(app).get('/api/public/legal')
    assert.equal(res.status, 200)
    assert.equal(res.body.data.version, config.privacy.version)
    assert.ok(res.body.data.cookies.every((cookie) => cookie.essential), 'no analytics or advertising cookies')
  })

  it('blocks the platform until the policy is accepted, and records the acceptance', async () => {
    const session = await loginAs(email)
    const me = await request(app).get('/api/auth/me').set(auth(session))
    assert.equal(me.status, 200, 'own account is always readable')
    assert.equal(me.body.data.privacy.required, true)

    const blocked = await request(app).get('/api/notifications').set(auth(session))
    assert.equal(blocked.status, 403)
    assert.equal(blocked.body.code, 'CONSENT_REQUIRED')
    const exported = await request(app).get('/api/auth/me/export').set(auth(session))
    assert.equal(exported.status, 200, 'GDPR access to own data is never blocked')

    const unticked = await request(app).post('/api/auth/consent').set(auth(session)).send({ accept: false })
    assert.equal(unticked.status, 400)
    const accepted = await request(app).post('/api/auth/consent').set(auth(session)).send({ accept: true, language: 'es' })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.data.privacy.required, false)

    const open = await request(app).get('/api/notifications').set(auth(session))
    assert.equal(open.status, 200)
    const history = await request(app).get('/api/auth/consent').set(auth(session))
    assert.equal(history.body.data[0].action, 'ACCEPTED')
    assert.equal(history.body.data[0].language, 'es')
    assert.equal(history.body.data[0].policy_version, config.privacy.version)
  })

  it('never blocks the Super Administrator, who acts for Grupo Global', async () => {
    const admin = await loginAs('admin@gmail.com')
    const me = await request(app).get('/api/auth/me').set(auth(admin))
    assert.equal(me.body.data.privacy.required, false)
    const audit = await request(app).get('/api/audit-logs').set(auth(admin))
    assert.equal(audit.status, 200)
  })

  it('asks again when the policy version changes', async () => {
    const session = await loginAs(email)
    const original = config.privacy.version
    config.privacy.version = `${original}-r2`
    try {
      const blocked = await request(app).get('/api/notifications').set(auth(session))
      assert.equal(blocked.body.code, 'CONSENT_REQUIRED')
    } finally {
      config.privacy.version = original
    }
  })

  it('withdrawing ends every session and blocks until accepted again', async () => {
    const session = await loginAs(email)
    const withdrawn = await request(app).delete('/api/auth/consent').set(auth(session)).send({})
    assert.equal(withdrawn.status, 200)
    const old = await request(app).get('/api/auth/me').set(auth(session))
    assert.equal(old.status, 401, 'the old session no longer works')

    const again = await loginAs(email)
    const blocked = await request(app).get('/api/notifications').set(auth(again))
    assert.equal(blocked.body.code, 'CONSENT_REQUIRED')
    const actions = (await request(app).get('/api/auth/consent').set(auth(again))).body.data.map((row) => row.action)
    assert.deepEqual(actions.slice(0, 2), ['WITHDRAWN', 'ACCEPTED'])
  })

  it('refuses a registration that has not accepted the policy', async () => {
    const res = await request(app).post('/api/public/onboarding').send({
      legal_name: `No Consent ${Date.now()} SL`, tax_id: 'B12345678', country: 'ESP', region_corridor: 'SPAIN_EU',
      org_type: 'CLIENT', contact_name: 'Ana Ruiz', contact_email: 'ana@example.test',
    })
    assert.equal(res.status, 400)
    assert.match(res.body.message, /privacy policy/i)
  })
})
