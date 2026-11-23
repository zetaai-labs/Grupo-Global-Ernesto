import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { query } from '../src/config/database.js'
import { config } from '../src/config/env.js'
import { generateSecret } from '../src/services/totp.js'
import { app } from './helpers.js'

const ORIGIN = config.frontendOrigin.split(',')[0].trim()
const RP_ID = config.security.webauthnRpId || new URL(ORIGIN).hostname
const PASSWORD = 'WebAuthn-Test-Pass1!'
const b64 = (value) => Buffer.from(value).toString('base64url')
const sha = (value) => createHash('sha256').update(value).digest()

// Minimal CBOR, enough for a "none" attestation object and a COSE ES256 key.
function cbor(value) {
  const head = (major, length) => {
    if (length < 24) return Buffer.from([(major << 5) | length])
    if (length < 256) return Buffer.from([(major << 5) | 24, length])
    return Buffer.from([(major << 5) | 25, length >> 8, length & 255])
  }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)])
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value])
  const entries = value instanceof Map ? [...value] : Object.entries(value)
  return Buffer.concat([head(5, entries.length), ...entries.flat().map(cbor)])
}

/** A software security key that follows the WebAuthn protocol. */
class SoftKey {
  constructor(origin = ORIGIN) {
    this.origin = origin
    this.id = randomBytes(32)
    this.counter = 0
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    this.privateKey = privateKey
    const jwk = publicKey.export({ format: 'jwk' })
    this.cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]))
  }

  clientData(type, challenge) {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }))
  }

  register(options) {
    const length = Buffer.alloc(2)
    length.writeUInt16BE(this.id.length)
    const counter = Buffer.alloc(4)
    const authData = Buffer.concat([sha(options.rp.id), Buffer.from([0x45]), counter, Buffer.alloc(16), length, this.id, this.cose])
    const attestationObject = cbor({ fmt: 'none', attStmt: {}, authData })
    return {
      id: b64(this.id), rawId: b64(this.id), type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64(this.clientData('webauthn.create', options.challenge)), attestationObject: b64(attestationObject), transports: ['usb'] },
    }
  }

  assert(options, { counter = this.counter + 1 } = {}) {
    this.counter = counter
    const count = Buffer.alloc(4)
    count.writeUInt32BE(counter)
    const authenticatorData = Buffer.concat([sha(options.rpId), Buffer.from([0x05]), count])
    const clientDataJSON = this.clientData('webauthn.get', options.challenge)
    const signature = sign('sha256', Buffer.concat([authenticatorData, sha(clientDataJSON)]), this.privateKey)
    return {
      id: b64(this.id), rawId: b64(this.id), type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authenticatorData), signature: b64(signature) },
    }
  }
}

describe('WebAuthn security keys', () => {
  let userId
  let email
  let session
  const bearer = (token = session) => ({ Authorization: `Bearer ${token}` })
  const signIn = async () => (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data
  const addKey = async (key, name = 'Test key') => {
    const options = await request(app).post('/api/auth/mfa/webauthn/register/options').set(bearer()).send({ password: PASSWORD })
    assert.equal(options.status, 200, options.body.message)
    return request(app).post('/api/auth/mfa/webauthn/register/verify').set(bearer()).send({ name, response: key.register(options.body.data) })
  }
  const loginWith = async (key, mfaToken, assertOptions) => {
    const options = await request(app).post('/api/auth/mfa/webauthn/login/options').send({ mfa_token: mfaToken })
    assert.equal(options.status, 200, options.body.message)
    return request(app).post('/api/auth/mfa/webauthn/login/verify').send({ mfa_token: mfaToken, response: key.assert(options.body.data, assertOptions) })
  }

  before(async () => {
    email = `webauthn-${randomUUID()}@example.test`
    const role = await query("SELECT id FROM roles WHERE name = 'employee'")
    const hash = await bcrypt.hash(PASSWORD, 4)
    userId = (await query('INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id', ['WebAuthn User', email, hash, role.rows[0].id])).rows[0].id
    session = (await signIn()).token
  })

  after(async () => {
    await query('DELETE FROM users WHERE id = $1', [userId])
  })

  it('needs the password to start adding a key', async () => {
    const response = await request(app).post('/api/auth/mfa/webauthn/register/options').set(bearer()).send({ password: 'wrong' })
    assert.equal(response.status, 401)
  })

  it('rejects a key registered from another website', async () => {
    assert.equal((await addKey(new SoftKey('https://evil.example'))).status, 400)
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM webauthn_credentials WHERE user_id = $1', [userId])).rows[0].n, 0)
  })

  it('registers a key, then requires it at sign-in', async () => {
    const key = new SoftKey()
    const added = await addKey(key)
    assert.equal(added.status, 201, added.body.message)
    const first = await signIn()
    assert.equal(first.mfa_required, true)
    assert.equal(first.token, undefined)
    assert.deepEqual(first.mfa_methods, { totp: false, webauthn: true })

    const signedIn = await loginWith(key, first.mfa_token)
    assert.equal(signedIn.status, 200, signedIn.body.message)
    assert.equal((await request(app).get('/api/auth/me').set(bearer(signedIn.body.data.token))).status, 200)

    // Replaying the same counter is what a cloned key would do.
    const cloned = await loginWith(key, first.mfa_token, { counter: key.counter })
    assert.equal(cloned.status, 401)
    this_key = key
  })

  it('rejects a different key, a reused challenge, and a non-MFA token', async () => {
    const { mfa_token: token } = await signIn()
    assert.equal((await loginWith(new SoftKey(), token)).status, 401)

    const options = await request(app).post('/api/auth/mfa/webauthn/login/options').send({ mfa_token: token })
    const assertion = this_key.assert(options.body.data)
    assert.equal((await request(app).post('/api/auth/mfa/webauthn/login/verify').send({ mfa_token: token, response: assertion })).status, 200)
    assert.equal((await request(app).post('/api/auth/mfa/webauthn/login/verify').send({ mfa_token: token, response: assertion })).status, 401)
    assert.equal((await request(app).post('/api/auth/mfa/webauthn/login/options').send({ mfa_token: session })).status, 401)
  })

  it('does not let a session replace active MFA without a code', async () => {
    const before = (await query('SELECT mfa_enabled, mfa_secret FROM users WHERE id = $1', [userId])).rows[0]
    assert.equal((await request(app).post('/api/auth/mfa/setup').set(bearer()).send({})).status, 409)
    assert.deepEqual((await query('SELECT mfa_enabled, mfa_secret FROM users WHERE id = $1', [userId])).rows[0], before)
  })

  it('removes the last key with the password and turns MFA off', async () => {
    const { data } = (await request(app).get('/api/auth/mfa/webauthn/credentials').set(bearer())).body
    assert.equal(JSON.stringify(data).includes('public_key'), false)
    const id = data.credentials[0].webauthn_id
    assert.equal((await request(app).delete(`/api/auth/mfa/webauthn/credentials/${id}`).set(bearer()).send({ password: 'wrong' })).status, 401)
    assert.equal((await request(app).delete(`/api/auth/mfa/webauthn/credentials/${id}`).set(bearer()).send({ password: PASSWORD })).status, 200)
    assert.equal((await query('SELECT mfa_enabled FROM users WHERE id = $1', [userId])).rows[0].mfa_enabled, false)
    assert.ok((await signIn()).token)
  })

  it('does not activate an unconfirmed authenticator secret when a key is added', async () => {
    await query('UPDATE users SET mfa_secret = $2 WHERE id = $1', [userId, generateSecret()])
    assert.equal((await addKey(new SoftKey())).status, 201)
    const row = (await query('SELECT mfa_enabled, mfa_secret FROM users WHERE id = $1', [userId])).rows[0]
    assert.deepEqual([row.mfa_enabled, row.mfa_secret], [true, null])
  })

  it('blocks removing the last factor when MFA is mandatory', async () => {
    const { data } = (await request(app).get('/api/auth/mfa/webauthn/credentials').set(bearer())).body
    const original = config.security.enforceMfa
    await query("UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'finance') WHERE id = $1", [userId])
    config.security.enforceMfa = true
    try {
      const response = await request(app).delete(`/api/auth/mfa/webauthn/credentials/${data.credentials[0].webauthn_id}`).set(bearer()).send({ password: PASSWORD })
      assert.equal(response.status, 409)
    } finally {
      config.security.enforceMfa = original
      await query("UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'employee') WHERE id = $1", [userId])
    }
  })
})

let this_key
