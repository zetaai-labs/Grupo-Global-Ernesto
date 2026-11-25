import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { resetDirectoryTokens, suggestedEmail } from '../src/integrations/directory/providers.js'

const realFetch = globalThis.fetch
const NAMES = ['GOOGLE_SA_CLIENT_EMAIL', 'GOOGLE_SA_PRIVATE_KEY', 'GOOGLE_ADMIN_SUBJECT', 'GOOGLE_WORKSPACE_DOMAIN', 'MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_DOMAIN', 'PROVISIONING_AUTO_SUSPEND']
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]))
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const auth = (s) => ({ Authorization: `Bearer ${s.token}` })
const EMAIL = 'provision-test@example.test'
let userId
let admin

before(async () => {
  admin = await loginAs('admin@gmail.com')
  userId = (await query(
    `INSERT INTO users (name, email, password_hash, role_id, status)
     SELECT 'Lucía Fernández Pérez', $1, $2, id, 'active' FROM roles WHERE name = 'employee'
     ON CONFLICT (email) DO UPDATE SET status = 'active' RETURNING id`,
    [EMAIL, await bcrypt.hash('Provision-Test-2026', 4)],
  )).rows[0].id
  await query('DELETE FROM provisioning_jobs WHERE user_id = $1', [userId])
})

afterEach(() => {
  globalThis.fetch = realFetch
  resetDirectoryTokens()
  for (const name of NAMES) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name] }
})

const provision = (body, session = admin) => request(app).post(`/api/provisioning/users/${userId}`).set(auth(session)).send(body)

describe('Google Workspace and Microsoft 365 accounts', () => {
  it('builds clean addresses', () => {
    assert.equal(suggestedEmail('Lucía Fernández Pérez', 'grupo.es'), 'lucia.perez@grupo.es')
    assert.equal(suggestedEmail('Ana', 'grupo.es'), 'ana.ana@grupo.es')
  })

  it('allows only system administrators, and dry runs without keys', async () => {
    const hr = await loginAs('hr@gmail.com')
    assert.equal((await provision({ provider: 'GOOGLE', action: 'CREATE', dry_run: true }, hr)).status, 403)
    assert.equal((await provision({ provider: 'GOOGLE', action: 'CREATE' })).status, 503)
    const dry = await provision({ provider: 'GOOGLE', action: 'CREATE', dry_run: true })
    assert.equal(dry.status, 201)
    assert.equal(dry.body.data.job.status, 'PLANNED')
    assert.equal(dry.body.data.job.target_email, 'lucia.perez@company-domain.invalid')
    assert.equal(dry.body.data.temporary_password, undefined)
  })

  it('creates a Google account with a signed service-account request, then suspends it with the user', async () => {
    Object.assign(process.env, {
      GOOGLE_SA_CLIENT_EMAIL: 'sa@project.iam.gserviceaccount.com',
      GOOGLE_SA_PRIVATE_KEY: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64'),
      GOOGLE_ADMIN_SUBJECT: 'it-admin@grupo.es', GOOGLE_WORKSPACE_DOMAIN: 'grupo.es', PROVISIONING_AUTO_SUSPEND: 'true',
    })
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options })
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        const assertion = new URLSearchParams(options.body.toString()).get('assertion')
        const claims = jwt.verify(assertion, publicKey, { algorithms: ['RS256'] })
        assert.equal(claims.sub, 'it-admin@grupo.es')
        assert.match(claims.scope, /admin\.directory\.user/)
        return new Response(JSON.stringify({ access_token: 'g-token', expires_in: 3600 }))
      }
      if (String(url).endsWith('/admin/directory/v1/users')) return new Response(JSON.stringify({ id: 'google-123' }))
      if (String(url).includes('/admin/directory/v1/users/')) return new Response('{}')
      return new Response('{}', { status: 404 })
    }
    assert.equal((await provision({ provider: 'GOOGLE', action: 'CREATE', email: 'x@other.com' })).status, 400)
    const created = await provision({ provider: 'GOOGLE', action: 'CREATE' })
    assert.equal(created.status, 201)
    assert.equal(created.body.data.job.target_email, 'lucia.perez@grupo.es')
    assert.ok(created.body.data.temporary_password.length >= 16)
    const body = JSON.parse(calls.find((call) => call.url.endsWith('/admin/directory/v1/users')).options.body)
    assert.deepEqual([body.primaryEmail, body.changePasswordAtNextLogin, body.name.givenName], ['lucia.perez@grupo.es', true, 'Lucía'])
    const stored = (await query('SELECT request, result FROM provisioning_jobs WHERE user_id = $1 AND status = $2', [userId, 'SUCCESS'])).rows
    assert.equal(JSON.stringify(stored).includes(created.body.data.temporary_password), false, 'password never stored')
    assert.equal((await provision({ provider: 'GOOGLE', action: 'CREATE' })).status, 409)

    assert.equal((await request(app).patch(`/api/users/${userId}/status`).set(auth(admin)).send({ status: 'suspended' })).status, 200)
    const suspend = calls.find((call) => call.options?.method === 'PUT')
    assert.match(suspend.url, /lucia\.perez%40grupo\.es$/)
    assert.deepEqual(JSON.parse(suspend.options.body), { suspended: true })
    await request(app).patch(`/api/users/${userId}/status`).set(auth(admin)).send({ status: 'active' })
  })

  it('creates a Microsoft 365 account that must change its password', async () => {
    Object.assign(process.env, { MS_TENANT_ID: 'tenant', MS_CLIENT_ID: 'client', MS_CLIENT_SECRET: 'secret', MS_DOMAIN: 'grupo.onmicrosoft.com' })
    let created
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('login.microsoftonline.com/tenant/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'm-token', expires_in: 3600 }))
      if (String(url) === 'https://graph.microsoft.com/v1.0/users') {
        created = JSON.parse(options.body)
        assert.equal(options.headers.Authorization, 'Bearer m-token')
        return new Response(JSON.stringify({ id: 'ms-1' }), { status: 201 })
      }
      return new Response('{}', { status: 404 })
    }
    const result = await provision({ provider: 'MICROSOFT', action: 'CREATE' })
    assert.equal(result.status, 201)
    assert.equal(created.userPrincipalName, 'lucia.perez@grupo.onmicrosoft.com')
    assert.equal(created.passwordProfile.forceChangePasswordNextSignIn, true)
  })

  it('records a failure without leaking provider details', async () => {
    Object.assign(process.env, { MS_TENANT_ID: 'tenant', MS_CLIENT_ID: 'client', MS_CLIENT_SECRET: 'wrong', MS_DOMAIN: 'grupo.onmicrosoft.com' })
    await query(`DELETE FROM provisioning_jobs WHERE user_id = $1 AND provider = 'MICROSOFT'`, [userId])
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid_client', secret_echo: 'wrong' }), { status: 401 })
    const failed = await provision({ provider: 'MICROSOFT', action: 'CREATE' })
    assert.equal(failed.status, 502)
    assert.equal(JSON.stringify(failed.body).includes('secret_echo'), false)
    const job = (await query(`SELECT status FROM provisioning_jobs WHERE user_id = $1 AND provider = 'MICROSOFT' ORDER BY created_at DESC LIMIT 1`, [userId])).rows[0]
    assert.equal(job.status, 'FAILED')
  })
})
