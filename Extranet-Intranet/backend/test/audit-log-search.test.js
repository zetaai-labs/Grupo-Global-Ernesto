import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('Audit log for administrators', () => {
  let admin
  before(async () => {
    admin = await loginAs('admin@gmail.com')
    // A failed sign-in, so there is at least one problem to find.
    await request(app).post('/api/auth/login').send({ email: 'employee@gmail.com', password: 'wrong-password-123' })
  })

  it('is for administrators only', async () => {
    const employee = await loginAs('employee@gmail.com')
    assert.equal((await request(app).get('/api/audit-logs').set(auth(employee))).status, 403)
    assert.equal((await request(app).get('/api/audit-logs/export.csv').set(auth(employee))).status, 403)
  })

  it('summarises today and points to problems', async () => {
    const res = await request(app).get('/api/audit-logs/summary').set(auth(admin))
    assert.equal(res.status, 200)
    assert.ok(res.body.data.today > 0)
    assert.ok(res.body.data.failed_sign_ins_24h >= 1)
    assert.ok(res.body.data.areas.includes('privacy'))
  })

  it('filters by area, problems, person and text, and pages through older entries', async () => {
    const signIns = await request(app).get('/api/audit-logs?area=sign_in&only=problems').set(auth(admin))
    assert.ok(signIns.body.data.length >= 1)
    assert.ok(signIns.body.data.every((row) => /^(LOGIN|LOGOUT|SSO|MFA|PASSWORD|WEBAUTHN|SESSION)_/.test(row.action)))
    assert.ok(signIns.body.data.every((row) => /(FAIL|REJECT|DENIED|BLOCKED|INVALID|MISMATCH|DUPLICATE|LOCKED|SUSPEND|WITHDRAWN|EXPELLED)/.test(row.action)))

    const byText = await request(app).get('/api/audit-logs?q=admin%40gmail.com&limit=5').set(auth(admin))
    assert.ok(byText.body.data.every((row) => row.user_email === 'admin@gmail.com' || JSON.stringify(row).includes('admin@gmail.com')))

    const first = await request(app).get('/api/audit-logs?limit=3').set(auth(admin))
    assert.equal(first.body.data.length, 3)
    assert.equal(first.body.has_more, true)
    const next = await request(app).get(`/api/audit-logs?limit=3&before=${first.body.data[2].id}`).set(auth(admin))
    assert.ok(next.body.data.every((row) => row.id < first.body.data[2].id), 'the next page is older')

    const today = new Date().toISOString().slice(0, 10)
    const dated = await request(app).get(`/api/audit-logs?from=${today}&to=${today}&limit=5`).set(auth(admin))
    assert.equal(dated.status, 200)
    const odd = await request(app).get("/api/audit-logs?q=%25'%3B--&area=nonsense&from=not-a-date").set(auth(admin))
    assert.equal(odd.status, 200, 'unexpected input is ignored, never run as SQL')
  })

  it('exports the filtered log as CSV and records the export', async () => {
    const csv = await request(app).get('/api/audit-logs/export.csv?area=sign_in').set(auth(admin))
    assert.equal(csv.status, 200)
    assert.match(csv.headers['content-type'], /text\/csv/)
    assert.match(csv.text, /id,when,action,user,email,entity,entity_id,details/)
    const recorded = await request(app).get('/api/audit-logs?q=AUDIT_EXPORTED&limit=1').set(auth(admin))
    assert.equal(recorded.body.data[0].action, 'AUDIT_EXPORTED')
  })
})
