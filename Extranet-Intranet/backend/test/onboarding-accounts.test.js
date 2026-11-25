import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const realFetch = globalThis.fetch
const NAMES = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_DOMAIN']
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]))
const EMAIL = 'onboard-accounts@example.test'
let planId

describe('onboarding plan → company accounts', () => {
  after(async () => {
    globalThis.fetch = realFetch
    for (const name of NAMES) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    if (planId) await query("DELETE FROM zx_records WHERE record_id = $1 OR (module = 'onboarding' AND entity = 'tasks' AND data->>'plan' = $1::text)", [planId])
    await query('DELETE FROM provisioning_jobs WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [EMAIL])
  })

  it('creates the new employee’s Microsoft 365 account from the plan and ticks off the access task', async () => {
    const [hr, employee] = await Promise.all(['hr', 'employee'].map((n) => loginAs(`${n}@gmail.com`)))
    const userId = (await query(
      `INSERT INTO users (name, email, password_hash, role_id, status)
       SELECT 'Nuevo Empleado Prueba', $1, '!test', id, 'active' FROM roles WHERE name = 'employee'
       ON CONFLICT (email) DO UPDATE SET status = 'active' RETURNING id`,
      [EMAIL],
    )).rows[0].id
    await query('DELETE FROM provisioning_jobs WHERE user_id = $1', [userId])

    const plan = await request(app).post('/api/zylax/hub/onboarding/plans').set(auth(hr))
      .send({ title: `Welcome plan ${Date.now()}`, employee: userId, start_date: '2026-12-01' })
    assert.equal(plan.status, 201, JSON.stringify(plan.body))
    planId = plan.body.data.record_id
    const path = `/api/zylax/hub/onboarding/plans/${planId}/accounts`
    const accessTask = async () => (await query("SELECT status FROM zx_records WHERE module = 'onboarding' AND entity = 'tasks' AND data->>'plan' = $1 AND title = 'Create platform account and access'", [planId])).rows[0]?.status

    assert.equal((await request(app).post(path).set(auth(employee)).send({ provider: 'MICROSOFT' })).status, 403)
    for (const name of NAMES) delete process.env[name]
    assert.equal((await request(app).post(path).set(auth(hr)).send({ provider: 'MICROSOFT' })).status, 503, 'not connected yet')

    const dry = await request(app).post(path).set(auth(hr)).send({ provider: 'MICROSOFT', dry_run: true })
    assert.equal(dry.status, 201)
    assert.equal(dry.body.data.temporary_password, null)
    assert.equal(await accessTask(), 'TODO', 'a dry run changes nothing')

    Object.assign(process.env, { MS_TENANT_ID: 'tenant-1', MS_CLIENT_ID: 'client-1', MS_CLIENT_SECRET: 'secret-1', MS_DOMAIN: 'grupo.es' })
    globalThis.fetch = async (url) => (String(url).includes('oauth2')
      ? new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ id: 'ms-user-1' }), { status: 201 }))
    const real = await request(app).post(path).set(auth(hr)).send({ provider: 'MICROSOFT' })
    assert.equal(real.status, 201, JSON.stringify(real.body))
    assert.match(real.body.data.job.target_email, /@grupo\.es$/)
    assert.ok(real.body.data.temporary_password)
    assert.equal(await accessTask(), 'DONE')
    assert.equal((await request(app).post(path).set(auth(hr)).send({ provider: 'MICROSOFT' })).status, 409, 'only once per provider')

    const events = await query("SELECT body FROM zx_record_events WHERE record_id = $1 AND kind = 'comment'", [planId])
    assert.ok(events.rows.some((row) => row.body.includes('Microsoft 365 account created')))
  })
})
