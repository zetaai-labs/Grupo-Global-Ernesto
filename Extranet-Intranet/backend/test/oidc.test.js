import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { app } from './helpers.js'
import { query } from '../src/config/database.js'
import { resetOidcCache } from '../src/integrations/oidc/oidcClient.js'
import { integrationReport } from '../src/services/integrationStatus.service.js'

const NAMES = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI', 'OIDC_PROVIDER_NAME', 'OIDC_SCOPES']
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]))
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' }
const CLIENT = 'test-client'
const SECRET = 'test-client-secret'
let server
let issuer
let provider
let lastPkceOk

const cookieFrom = (response, name) => (response.headers['set-cookie'] || []).map((value) => value.split(';')[0]).find((value) => value.startsWith(`${name}=`) && value.length > name.length + 1)

function idToken(nonce) {
  const claims = { sub: 'provider-user-1', email: provider.email, email_verified: provider.verified, nonce: provider.nonce ?? nonce, ...provider.claims }
  if (provider.sign) return provider.sign(claims)
  return jwt.sign(claims, privateKey, { algorithm: 'RS256', keyid: 'test-key', issuer: provider.issuer ?? issuer, audience: provider.audience ?? CLIENT, expiresIn: provider.expiresIn ?? 300 })
}

async function startFlow() {
  const start = await request(app).get('/api/auth/oidc/start')
  assert.equal(start.status, 302)
  const url = new URL(start.headers.location)
  return { url, cookie: cookieFrom(start, 'gg_oidc_flow') }
}

async function runFlow() {
  const { url, cookie } = await startFlow()
  provider.pending = { nonce: url.searchParams.get('nonce'), challenge: url.searchParams.get('code_challenge') }
  return request(app).get('/api/auth/oidc/callback').query({ code: 'test-code', state: url.searchParams.get('state') }).set('Cookie', cookie)
}

const errorOf = (response) => new URL(response.headers.location).searchParams.get('sso_error')

before(async () => {
  server = http.createServer((req, res) => {
    const send = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (req.url === '/.well-known/openid-configuration') {
      return send({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, token_endpoint_auth_methods_supported: ['client_secret_basic'] })
    }
    if (req.url === '/jwks') return send({ keys: [jwk] })
    if (req.url === '/token') {
      let raw = ''
      req.on('data', (chunk) => { raw += chunk })
      req.on('end', () => {
        const form = new URLSearchParams(raw)
        const basic = Buffer.from(String(req.headers.authorization).replace('Basic ', ''), 'base64').toString()
        lastPkceOk = createHash('sha256').update(form.get('code_verifier')).digest('base64url') === provider.pending.challenge
        if (basic !== `${CLIENT}:${SECRET}` || !lastPkceOk) return send({ error: 'invalid_grant' }, 400)
        return send({ id_token: idToken(provider.pending.nonce), access_token: 'unused' })
      })
      return undefined
    }
    return send({}, 404)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  issuer = `http://127.0.0.1:${server.address().port}`
  Object.assign(process.env, { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: CLIENT, OIDC_CLIENT_SECRET: SECRET, OIDC_REDIRECT_URI: 'http://localhost:5173/api/auth/oidc/callback', OIDC_PROVIDER_NAME: 'Test Provider' })
})

after(async () => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
  resetOidcCache()
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  provider = { email: 'employee@gmail.com', verified: true, claims: {} }
})

describe('OIDC single sign-on', () => {
  it('stays off without settings', async () => {
    const issuerValue = process.env.OIDC_ISSUER
    delete process.env.OIDC_ISSUER
    assert.deepEqual((await request(app).get('/api/auth/oidc/status')).body.data, { enabled: false, provider: null })
    assert.equal(errorOf(await request(app).get('/api/auth/oidc/start')), 'unavailable')
    process.env.OIDC_ISSUER = issuerValue
    assert.deepEqual((await request(app).get('/api/auth/oidc/status')).body.data, { enabled: true, provider: 'Test Provider' })
    assert.equal((await integrationReport()).items.find((item) => item.key === 'wordpress_sso').status, 'CONFIGURED')
  })

  it('signs in without putting a token in any URL, and the result works only with its cookie', async () => {
    const { url } = await startFlow()
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(url.searchParams.get('client_secret'), null)
    const callback = await runFlow()
    assert.equal(lastPkceOk, true)
    assert.match(callback.headers.location, /\/login\?sso=1$/)
    const result = cookieFrom(callback, 'gg_oidc_result')
    assert.ok(result)
    assert.match(callback.headers['set-cookie'].find((value) => value.startsWith('gg_oidc_result=')), /HttpOnly/)
    assert.equal((await request(app).post('/api/auth/oidc/complete')).status, 401)
    const done = await request(app).post('/api/auth/oidc/complete').set('Cookie', result)
    assert.equal(done.status, 200)
    assert.equal(done.body.data.user.email, 'employee@gmail.com')
    assert.equal(done.body.data.user.password_hash, undefined)
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${done.body.data.token}`)).status, 200)
    assert.match(done.headers['set-cookie'].join(), /gg_oidc_result=;/)
  })

  it('rejects a forged state or a missing flow cookie', async () => {
    const { cookie } = await startFlow()
    assert.equal(errorOf(await request(app).get('/api/auth/oidc/callback').query({ code: 'x', state: 'forged' }).set('Cookie', cookie)), 'failed')
    assert.equal(errorOf(await request(app).get('/api/auth/oidc/callback').query({ code: 'x', state: 'forged' })), 'failed')
    assert.equal((await request(app).post('/api/auth/oidc/complete').set('Cookie', `gg_oidc_result=${cookie.split('=')[1]}`)).status, 401, 'a flow cookie is not a result')
  })

  for (const [name, change] of [
    ['wrong nonce', { nonce: 'other' }],
    ['wrong audience', { audience: 'other-client' }],
    ['wrong issuer', { issuer: 'https://evil.example' }],
    ['expired token', { expiresIn: -600 }],
    ['wrong authorized party', { claims: { azp: 'other-client' } }],
  ]) {
    it(`rejects a token with ${name}`, async () => {
      Object.assign(provider, change)
      assert.equal(errorOf(await runFlow()), 'failed')
    })
  }

  it('rejects unsigned, HMAC and wrongly signed tokens', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    const base = { issuer: undefined }
    for (const sign of [
      (claims) => jwt.sign(claims, '', { algorithm: 'none', issuer, audience: CLIENT }),
      (claims) => jwt.sign(claims, publicKey.export({ type: 'spki', format: 'pem' }).toString().slice(0, 60), { algorithm: 'HS256', issuer, audience: CLIENT }),
      (claims) => jwt.sign(claims, other, { algorithm: 'RS256', keyid: 'test-key', issuer, audience: CLIENT, expiresIn: 300 }),
    ]) {
      Object.assign(provider, base, { sign })
      assert.equal(errorOf(await runFlow()), 'failed')
    }
  })

  it('refuses unverified emails and unknown accounts without creating users', async () => {
    const before = (await query('SELECT count(*)::int AS total FROM users')).rows[0].total
    provider.verified = false
    assert.equal(errorOf(await runFlow()), 'not_allowed')
    provider.verified = 'true'
    assert.equal(errorOf(await runFlow()), 'not_allowed')
    provider = { email: 'nobody-oidc@example.test', verified: true, claims: {} }
    assert.equal(errorOf(await runFlow()), 'not_allowed')
    assert.equal((await query('SELECT count(*)::int AS total FROM users')).rows[0].total, before)
  })

  it('never lets privileged accounts skip MFA', async () => {
    for (const email of ['admin@gmail.com', 'techadmin@gmail.com', 'hr@gmail.com', 'finance@gmail.com', 'investor@gmail.com']) {
      provider.email = email
      assert.equal(errorOf(await runFlow()), 'not_allowed', email)
    }
    const row = (await query(`SELECT mfa_enabled, mfa_secret FROM users WHERE email = 'finance@gmail.com'`)).rows[0]
    try {
      await query(`UPDATE users SET mfa_enabled = true, mfa_secret = 'JBSWY3DPEHPK3PXP' WHERE email = 'finance@gmail.com'`)
      provider.email = 'finance@gmail.com'
      const callback = await runFlow()
      const done = await request(app).post('/api/auth/oidc/complete').set('Cookie', cookieFrom(callback, 'gg_oidc_result'))
      assert.equal(done.body.data.mfa_required, true)
      assert.equal(done.body.data.token, undefined)
      assert.ok(done.body.data.mfa_token)
    } finally {
      await query(`UPDATE users SET mfa_enabled = $1, mfa_secret = $2 WHERE email = 'finance@gmail.com'`, [row.mfa_enabled, row.mfa_secret])
    }
  })
})
