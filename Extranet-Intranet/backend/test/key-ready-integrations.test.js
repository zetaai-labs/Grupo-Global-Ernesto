import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { encryptProfile, sealProfile, openProfile } from '../src/services/vault.service.js'
import { reencryptVault } from '../src/services/vaultReencrypt.service.js'
import { setKmsClientForTests } from '../src/integrations/vault/keyProvider.js'
import { signPlayback, streamingProvider } from '../src/services/streaming.service.js'
import { cloudflareEdge, isTrustedProxy, originSecretValid } from '../src/middleware/cloudflare.js'

// All external services are mocked: nothing here contacts AWS, Vault, LiveKit, Mux or Cloudflare.
const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const MANAGED = [
  'VAULT_KEY_PROVIDER', 'VAULT_ENCRYPTION_KEY', 'VAULT_KMS_KEY_ID', 'VAULT_KMS_REGION', 'VAULT_TRANSIT_ADDR', 'VAULT_TRANSIT_TOKEN',
  'VAULT_TRANSIT_KEY', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'STREAMING_PROVIDER', 'MUX_SIGNING_KEY_ID',
  'MUX_SIGNING_PRIVATE_KEY', 'CF_STREAM_CUSTOMER_CODE', 'CF_STREAM_KEY_ID', 'CF_STREAM_PRIVATE_KEY',
  'CLOUDFLARE_ENABLED', 'CLOUDFLARE_TRUSTED_PROXIES', 'CLOUDFLARE_ORIGIN_SECRET',
]
let saved
const realFetch = globalThis.fetch

beforeEach(() => {
  saved = Object.fromEntries(MANAGED.map((name) => [name, process.env[name]]))
  for (const name of MANAGED) delete process.env[name]
  process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})
afterEach(() => {
  for (const name of MANAGED) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
  setKmsClientForTests(null)
  globalThis.fetch = realFetch
})

function mockKms() {
  const master = randomBytes(32)
  const wrap = (key) => Buffer.from(key.map((byte, index) => byte ^ master[index]))
  return {
    calls: [],
    async send(command) {
      this.calls.push(command.constructor.name)
      assert.equal(command.input.EncryptionContext.purpose, 'gg-investor-vault')
      if (command.constructor.name === 'GenerateDataKeyCommand') {
        const plaintext = randomBytes(32)
        return { Plaintext: Buffer.from(plaintext), CiphertextBlob: wrap(plaintext) }
      }
      return { Plaintext: wrap(Buffer.from(command.input.CiphertextBlob)) }
    },
  }
}

describe('vault key providers (mocked)', () => {
  it('uses v1 locally and keeps v1 readable after moving to KMS', async () => {
    const profile = { full_name: 'Test Investor', iban: 'ES00' }
    const legacy = await sealProfile(profile)
    assert.ok(legacy.startsWith('v1:'))

    process.env.VAULT_KEY_PROVIDER = 'aws_kms'
    process.env.VAULT_KMS_KEY_ID = 'alias/mock'
    process.env.VAULT_KMS_REGION = 'eu-south-2'
    const kms = mockKms()
    setKmsClientForTests(kms)

    const sealed = await sealProfile(profile)
    assert.ok(sealed.startsWith('v2:kms:'))
    assert.equal(sealed.includes('Test Investor'), false)
    assert.deepEqual(await openProfile(sealed), profile)
    assert.deepEqual(await openProfile(legacy), profile)

    const parts = sealed.split(':')
    parts[5] = Buffer.from(parts[5], 'base64').map((byte) => byte ^ 1).toString('base64')
    await assert.rejects(openProfile(parts.join(':')), 'tampered ciphertext is rejected')
  })

  it('fails closed when an external provider is selected but not configured', async () => {
    process.env.VAULT_KEY_PROVIDER = 'aws_kms'
    await assert.rejects(sealProfile({ full_name: 'x' }), (error) => error.status === 503)
    process.env.VAULT_KEY_PROVIDER = 'typo'
    await assert.rejects(sealProfile({ full_name: 'x' }), (error) => error.status === 503)
  })

  it('supports HashiCorp Vault Transit', async () => {
    Object.assign(process.env, {
      VAULT_KEY_PROVIDER: 'hashicorp', VAULT_TRANSIT_ADDR: 'https://vault.example.test', VAULT_TRANSIT_TOKEN: 'mock', VAULT_TRANSIT_KEY: 'investors',
    })
    const store = new Map()
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers['x-vault-token'], 'mock')
      const body = JSON.parse(options.body)
      if (String(url).includes('/transit/datakey/plaintext/investors')) {
        const plaintext = randomBytes(32).toString('base64')
        const ciphertext = `vault:v1:${randomBytes(8).toString('hex')}`
        store.set(ciphertext, plaintext)
        return { ok: true, json: async () => ({ data: { plaintext, ciphertext } }) }
      }
      return { ok: true, json: async () => ({ data: { plaintext: store.get(body.ciphertext) } }) }
    }
    const sealed = await sealProfile({ full_name: 'Transit Investor' })
    assert.ok(sealed.startsWith('v2:transit:'))
    assert.equal((await openProfile(sealed)).full_name, 'Transit Investor')

    process.env.VAULT_TRANSIT_ADDR = 'http://vault.example.test'
    await assert.rejects(sealProfile({ full_name: 'x' }), (error) => error.status === 503, 'plain HTTP to a remote Vault is refused')
  })

  it('re-encrypts in dry-run by default and only writes with apply', async () => {
    const legacy = encryptProfile({ full_name: 'Migration Test' })
    const id = (await query(
      `INSERT INTO investors_vault (encrypted_profile, investment_ticket_range, sector_focus)
       VALUES ($1, 'EUR 1M-5M', 'FINTECH') RETURNING investor_id`, [legacy],
    )).rows[0].investor_id
    try {
      process.env.VAULT_KEY_PROVIDER = 'aws_kms'
      process.env.VAULT_KMS_KEY_ID = 'alias/mock'
      process.env.VAULT_KMS_REGION = 'eu-south-2'
      setKmsClientForTests(mockKms())

      const dry = await reencryptVault({ investorIds: [id] })
      assert.deepEqual([dry.mode, dry.pending, dry.migrated, dry.failed.length], ['dry-run', 1, 0, 0])
      assert.equal((await query('SELECT encrypted_profile FROM investors_vault WHERE investor_id = $1', [id])).rows[0].encrypted_profile, legacy)

      const applied = await reencryptVault({ apply: true, investorIds: [id] })
      assert.equal(applied.migrated, 1)
      const stored = (await query('SELECT encrypted_profile FROM investors_vault WHERE investor_id = $1', [id])).rows[0].encrypted_profile
      assert.ok(stored.startsWith('v2:kms:'))
      assert.equal((await openProfile(stored)).full_name, 'Migration Test')
      assert.equal((await reencryptVault({ investorIds: [id] })).already_current, 1)
    } finally {
      await query('DELETE FROM investors_vault WHERE investor_id = $1', [id])
    }
  })
})

describe('video sessions', () => {
  it('stays on mesh by default and issues room-scoped SFU tokens when configured', async () => {
    const employee = await loginAs('employee@gmail.com')
    const customer = await loginAs('customer@gmail.com')

    const mesh = await request(app).post('/api/video/session').set(auth(employee)).send({ room: 'intranet-meeting' })
    assert.deepEqual(mesh.body.data, { mode: 'mesh' })
    assert.equal((await request(app).post('/api/video/session').set(auth(customer)).send({ room: 'intranet-meeting' })).status, 403)
    assert.equal((await request(app).post('/api/video/session').set(auth(employee)).send({ room: '../bad' })).status, 400)

    Object.assign(process.env, { LIVEKIT_URL: 'wss://sfu.example.test', LIVEKIT_API_KEY: 'mock-key', LIVEKIT_API_SECRET: 'mock-secret-with-enough-length' })
    const sfu = await request(app).post('/api/video/session').set(auth(employee)).send({ room: 'intranet-meeting' })
    assert.equal(sfu.body.data.mode, 'sfu')
    const claims = jwt.verify(sfu.body.data.token, 'mock-secret-with-enough-length', { algorithms: ['HS256'] })
    assert.equal(claims.iss, 'mock-key')
    assert.equal(claims.sub, employee.user.uuid)
    assert.equal(claims.video.room, 'intranet-meeting')
    assert.equal(claims.video.roomJoin, true)
    assert.equal(claims.video.roomAdmin, undefined)
    assert.equal((await request(app).post('/api/video/session').set(auth(customer)).send({ room: 'intranet-meeting' })).status, 403)
  })
})

describe('signed streaming', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })

  it('is off by default', () => {
    assert.equal(streamingProvider(), null)
    assert.equal(signPlayback({ videoId: 'abcdef123' }), null)
  })

  it('signs Mux HLS playback', () => {
    Object.assign(process.env, { STREAMING_PROVIDER: 'mux', MUX_SIGNING_KEY_ID: 'mock-kid', MUX_SIGNING_PRIVATE_KEY: Buffer.from(privateKey).toString('base64') })
    const playback = signPlayback({ videoId: 'muxPlayback123', ttlSeconds: 120 })
    assert.equal(playback.dash, null)
    const token = new URL(playback.hls).searchParams.get('token')
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'], complete: true })
    assert.equal(decoded.header.kid, 'mock-kid')
    assert.equal(decoded.payload.sub, 'muxPlayback123')
    assert.equal(decoded.payload.aud, 'v')
    assert.throws(() => signPlayback({ videoId: '../../secret' }), (error) => error.status === 400)
  })

  it('signs Cloudflare Stream HLS and DASH playback', () => {
    Object.assign(process.env, { STREAMING_PROVIDER: 'cloudflare', CF_STREAM_CUSTOMER_CODE: 'abc123xyz', CF_STREAM_KEY_ID: 'mock-kid', CF_STREAM_PRIVATE_KEY: privateKey })
    const playback = signPlayback({ videoId: 'cfVideoUid123' })
    assert.ok(playback.hls.endsWith('/manifest/video.m3u8'))
    assert.ok(playback.dash.endsWith('/manifest/video.mpd'))
    const token = new URL(playback.hls).pathname.split('/')[1]
    assert.equal(jwt.verify(token, publicKey, { algorithms: ['RS256'] }).sub, 'cfVideoUid123')
  })
})

describe('Cloudflare edge', () => {
  const edgeApp = () => {
    const instance = express()
    instance.use(cloudflareEdge)
    instance.get('/api/health', (_req, res) => res.json({ ok: true }))
    instance.get('/ip', (req, res) => res.json({ ip: req.ip }))
    return instance
  }

  it('does nothing unless enabled', async () => {
    const response = await request(edgeApp()).get('/ip').set('CF-Connecting-IP', '203.0.113.9')
    assert.notEqual(response.body.ip, '203.0.113.9')
    assert.equal(originSecretValid(undefined), true)
  })

  it('trusts CF-Connecting-IP only from a configured proxy', async () => {
    process.env.CLOUDFLARE_ENABLED = 'true'
    const spoofed = await request(edgeApp()).get('/ip').set('CF-Connecting-IP', '203.0.113.9')
    assert.notEqual(spoofed.body.ip, '203.0.113.9')

    process.env.CLOUDFLARE_TRUSTED_PROXIES = '127.0.0.0/8,::1/128'
    assert.equal(isTrustedProxy('::ffff:127.0.0.1'), true)
    assert.equal(isTrustedProxy('198.51.100.7'), false)
    const trusted = await request(edgeApp()).get('/ip').set('CF-Connecting-IP', '203.0.113.9')
    assert.equal(trusted.body.ip, '203.0.113.9')
    const invalid = await request(edgeApp()).get('/ip').set('CF-Connecting-IP', 'not-an-ip')
    assert.notEqual(invalid.body.ip, 'not-an-ip')
  })

  it('enforces the origin secret except on the health check', async () => {
    process.env.CLOUDFLARE_ENABLED = 'true'
    process.env.CLOUDFLARE_ORIGIN_SECRET = 'mock-origin-secret'
    assert.equal((await request(edgeApp()).get('/ip')).status, 403)
    assert.equal((await request(edgeApp()).get('/ip').set('X-Origin-Secret', 'wrong')).status, 403)
    assert.equal((await request(edgeApp()).get('/ip').set('X-Origin-Secret', 'mock-origin-secret')).status, 200)
    assert.equal((await request(edgeApp()).get('/api/health')).status, 200)
  })
})
