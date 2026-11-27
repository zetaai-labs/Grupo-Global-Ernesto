import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
// The exact module the browser uses.
import {
  conversationKey, createIdentity, decryptMessage, encryptMessage, parseMessage, unlockIdentity,
} from '../../frontend/src/components/Portals/Shared/privateChat/e2ee.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const FAST = 210000 // the lowest the server accepts, to keep tests quick
const secret = `Board meeting moved to Friday ${Date.now()}`

describe('End-to-end encrypted private chat', () => {
  let alice
  let bob
  let outsider
  let conversationId
  const keys = {}

  before(async () => {
    alice = await loginAs('employee@gmail.com')
    bob = await loginAs('finance@gmail.com')
    outsider = await loginAs('hr@gmail.com')
    await query('DELETE FROM e2ee_keys WHERE user_id = ANY($1)', [[alice.user.id, bob.user.id]])
  })
  after(async () => {
    if (conversationId) await query('DELETE FROM conversations WHERE id = $1', [conversationId])
    await query('DELETE FROM e2ee_keys WHERE user_id = ANY($1)', [[alice.user.id, bob.user.id]])
  })

  it('stores only a public key and a passphrase-locked private key', async () => {
    const leaked = await createIdentity('correct horse battery', FAST)
    const withPrivate = await request(app).post('/api/chat/e2ee/me').set(auth(alice)).send({ ...leaked, public_jwk: { ...leaked.public_jwk, d: 'secret-part' } })
    assert.equal(withPrivate.status, 400, 'an unlocked private key is refused')
    const weak = await request(app).post('/api/chat/e2ee/me').set(auth(alice)).send({ ...leaked, kdf_iterations: 1000 })
    assert.equal(weak.status, 400, 'a weak passphrase derivation is refused')

    for (const [name, session] of [['alice', alice], ['bob', bob]]) {
      const identity = await createIdentity(`${name} passphrase`, FAST)
      const saved = await request(app).post('/api/chat/e2ee/me').set(auth(session)).send(identity)
      assert.equal(saved.status, 201)
      keys[name] = { id: saved.body.data.key_id, public_jwk: identity.public_jwk }
    }
    const again = await request(app).post('/api/chat/e2ee/me').set(auth(alice)).send(await createIdentity('x passphrase', FAST))
    assert.equal(again.status, 409, 'a reset must be explicit')

    const mine = await request(app).get('/api/chat/e2ee/me').set(auth(alice))
    assert.equal(await unlockIdentity(mine.body.data.current, 'wrong passphrase'), null)
    keys.alice.private = await unlockIdentity(mine.body.data.current, 'alice passphrase')
    assert.ok(keys.alice.private)
    keys.bob.private = await unlockIdentity((await request(app).get('/api/chat/e2ee/me').set(auth(bob))).body.data.current, 'bob passphrase')
  })

  it('opens one private conversation per pair, and keeps partners from chatting with each other', async () => {
    const started = await request(app).post('/api/chat/private').set(auth(alice)).send({ user_id: bob.user.id })
    assert.equal(started.status, 201)
    conversationId = started.body.data.id
    const reverse = await request(app).post('/api/chat/private').set(auth(bob)).send({ user_id: alice.user.id })
    assert.equal(reverse.body.data.id, conversationId, 'the same conversation from both sides')
    const customer = await loginAs('customer@gmail.com')
    const partner = (await query("SELECT id FROM users WHERE email = 'partner@gmail.com'")).rows[0].id
    assert.equal((await request(app).post('/api/chat/private').set(auth(customer)).send({ user_id: partner })).status, 403)
    const list = await request(app).get('/api/chat/conversations?portal=intranet').set(auth(alice))
    const row = list.body.data.find((item) => item.id === conversationId)
    assert.equal(row.e2ee, true)
    assert.equal(row.with_user_id, bob.user.id)
    assert.equal(row.with_key_id, keys.bob.id)
  })

  it('carries only ciphertext: the server stores and relays text it cannot read', async () => {
    const plain = await request(app).post(`/api/chat/conversations/${conversationId}/messages`).set(auth(alice)).send({ body: 'hello in clear' })
    assert.equal(plain.status, 400, 'plain text is refused in a private chat')

    const shared = await conversationKey(keys.alice.private, keys.bob.public_jwk, conversationId, keys.alice.id, keys.bob.id)
    const body = await encryptMessage(shared, secret, conversationId, keys.alice.id, keys.bob.id)
    const sent = await request(app).post(`/api/chat/conversations/${conversationId}/messages`).set(auth(alice)).send({ body })
    assert.equal(sent.status, 201)

    const stored = await query('SELECT body FROM messages WHERE conversation_id = $1', [conversationId])
    assert.ok(!JSON.stringify(stored.rows).includes('Board meeting'), 'nothing readable reaches the database')
    const alert = await query(`SELECT body FROM notifications WHERE user_id = $1 AND link = '/intranet/chat' ORDER BY id DESC LIMIT 1`, [bob.user.id])
    assert.equal(alert.rows[0].body, 'New encrypted message')

    const received = await request(app).get(`/api/chat/conversations/${conversationId}/messages`).set(auth(bob))
    const parsed = parseMessage(received.body.data[0].body)
    const pub = await request(app).get(`/api/chat/e2ee/keys?ids=${parsed.senderKeyId}`).set(auth(bob))
    const bobShared = await conversationKey(keys.bob.private, pub.body.data[0].public_jwk, conversationId, keys.bob.id, parsed.senderKeyId)
    assert.equal(await decryptMessage(bobShared, parsed, conversationId), secret)

    const tampered = { ...parsed, data: `${parsed.data.slice(0, -4)}AAAA` }
    assert.equal(await decryptMessage(bobShared, tampered, conversationId), null, 'a changed message is detected')
    assert.equal(await decryptMessage(bobShared, parsed, conversationId + 1), null, 'and cannot be moved to another conversation')

    assert.equal((await request(app).get(`/api/chat/conversations/${conversationId}/messages`).set(auth(outsider))).status, 403)
    const outsiderKeys = await request(app).get(`/api/chat/e2ee/keys?ids=${keys.alice.id}`).set(auth(outsider))
    assert.deepEqual(outsiderKeys.body.data, [], 'keys are only shared with chat partners')
  })

  it('after a passphrase reset, old keys are refused for new messages but Bob can still read the past', async () => {
    const fresh = await createIdentity('alice new passphrase', FAST)
    const reset = await request(app).post('/api/chat/e2ee/me').set(auth(alice)).send({ ...fresh, replace: true })
    assert.equal(reset.status, 201)
    const oldKeyMessage = await encryptMessage(
      await conversationKey(keys.alice.private, keys.bob.public_jwk, conversationId, keys.alice.id, keys.bob.id),
      'sent with the old key', conversationId, keys.alice.id, keys.bob.id,
    )
    const refused = await request(app).post(`/api/chat/conversations/${conversationId}/messages`).set(auth(alice)).send({ body: oldKeyMessage })
    assert.equal(refused.status, 409)
    const mine = await request(app).get('/api/chat/e2ee/me').set(auth(alice))
    assert.deepEqual(mine.body.data.earlier_key_ids, [keys.alice.id])

    const history = await request(app).get(`/api/chat/conversations/${conversationId}/messages`).set(auth(bob))
    const parsed = parseMessage(history.body.data[0].body)
    const oldPublic = await request(app).get(`/api/chat/e2ee/keys?ids=${parsed.senderKeyId}`).set(auth(bob))
    const readable = await decryptMessage(
      await conversationKey(keys.bob.private, oldPublic.body.data[0].public_jwk, conversationId, keys.bob.id, parsed.senderKeyId), parsed, conversationId,
    )
    assert.equal(readable, secret)
  })
})
