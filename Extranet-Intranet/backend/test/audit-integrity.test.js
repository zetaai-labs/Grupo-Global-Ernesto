import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import request from 'supertest'
import { config } from '../src/config/env.js'
import { anchorAuditChain, verifyAuditChain } from '../src/services/auditIntegrity.service.js'
import { app, loginAs } from './helpers.js'

/** Fake Object Lock bucket; tampering tests run in a private schema, never on the real log. */
function fakeStore({ lock = true } = {}) {
  const objects = new Map()
  return {
    objects,
    puts: [],
    configured: () => true,
    retentionDays: () => 30,
    mode: () => 'COMPLIANCE',
    lockEnabled: async () => lock,
    async put(input) {
      this.puts.push(input)
      if (objects.has(input.key)) return false
      objects.set(input.key, { body: input.body, checksum: input.checksum, retainUntil: input.retainUntil })
      return true
    },
    head: async (key) => objects.get(key),
    read: async (key) => objects.get(key).body,
  }
}

describe('audit log integrity', () => {
  const schema = `audit_test_${randomBytes(6).toString('hex')}`
  let admin
  let db

  const add = async (action, details = {}, userId = null) => {
    await db.query(
      `WITH head AS (SELECT last_seq + 1 AS seq, last_hash FROM audit_chain_head),
       row AS (
         SELECT seq, last_hash, now() AS at, audit_sha256($2::jsonb::text) AS details_hash, audit_actor_ref($3::int) AS actor FROM head
       ), entry AS (
         SELECT row.*, audit_entry_hash(last_hash, seq, $1, 'test', NULL, at, actor, details_hash) AS hash FROM row
       ), inserted AS (
         INSERT INTO audit_logs (id, user_id, action, entity, details, created_at, chain_seq, prev_hash, entry_hash, details_hash, actor_ref)
         SELECT seq, $3::int, $1, 'test', $2::jsonb, at, seq, last_hash, hash, details_hash, actor FROM entry RETURNING chain_seq, entry_hash
       )
       UPDATE audit_chain_head SET last_seq = inserted.chain_seq, last_hash = inserted.entry_hash FROM inserted`,
      [action, JSON.stringify(details), userId],
    )
  }

  before(async () => {
    admin = new pg.Pool({ connectionString: config.databaseUrl, max: 1 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    await admin.query(`CREATE TABLE ${schema}.audit_logs (LIKE public.audit_logs)`)
    await admin.query(`CREATE TABLE ${schema}.audit_chain_head (LIKE public.audit_chain_head INCLUDING ALL)`)
    await admin.query(`CREATE TABLE ${schema}.audit_anchors (LIKE public.audit_anchors INCLUDING ALL)`)
    db = new pg.Pool({ connectionString: config.databaseUrl, max: 4, options: `-c search_path=${schema},public` })
  })

  beforeEach(async () => {
    await db.query('TRUNCATE audit_logs, audit_anchors, audit_chain_head')
    await db.query('INSERT INTO audit_chain_head (id) VALUES (1)')
    await add('ONE', { email: 'person@example.test', note: 'kept' }, 7)
    await add('TWO')
    await add('THREE')
  })

  after(async () => {
    await db.end()
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
  })

  it('accepts an untouched chain and a lawful GDPR redaction', async () => {
    assert.deepEqual((await verifyAuditChain({ db })).valid, true)
    await db.query("UPDATE audit_logs SET details = details - 'email', details_redacted_at = now(), user_id = NULL WHERE chain_seq = 1")
    assert.equal((await verifyAuditChain({ db })).valid, true)
  })

  for (const [name, sql, type] of [
    ['a changed action', "UPDATE audit_logs SET action = 'FORGED' WHERE chain_seq = 2", 'ENTRY_CHANGED'],
    ['changed details', `UPDATE audit_logs SET details = '{"note":"forged"}' WHERE chain_seq = 1`, 'DETAILS_CHANGED'],
    ['a reassigned actor', 'UPDATE audit_logs SET user_id = 8 WHERE chain_seq = 1', 'ACTOR_CHANGED'],
    ['a removed entry', 'DELETE FROM audit_logs WHERE chain_seq = 2', 'MISSING_ENTRY'],
    ['a removed last entry', 'DELETE FROM audit_logs WHERE chain_seq = 3', 'HEAD_MISMATCH'],
    ['a broken link', "UPDATE audit_logs SET prev_hash = repeat('a', 64) WHERE chain_seq = 3", 'BROKEN_LINK'],
    ['an entry outside the chain', "INSERT INTO audit_logs (id, action, details, created_at) VALUES (99, 'INJECTED', '{}', now())", 'UNCHAINED_ENTRY'],
  ]) {
    it(`detects ${name}`, async () => {
      await db.query(sql)
      const result = await verifyAuditChain({ db })
      assert.equal(result.valid, false)
      assert.equal(result.issue.type, type)
    })
  }

  it('writes a locked copy without event details, then continues from there', async () => {
    const store = fakeStore()
    const first = await anchorAuditChain({ db, store })
    assert.deepEqual([first.anchored, first.from_seq, first.to_seq], [true, 1, 3])
    const text = store.objects.get(first.object_key).body.toString()
    const document = JSON.parse(text)
    assert.equal(document['@graph'].length, 3)
    assert.ok(document['@context'])
    assert.equal(text.includes('person@example.test'), false)
    assert.ok(store.puts[0].retainUntil > new Date(Date.now() + 29 * 86400000))
    assert.equal((await anchorAuditChain({ db, store })).reason, 'UP_TO_DATE')
    await add('FOUR')
    const second = await anchorAuditChain({ db, store })
    assert.deepEqual([second.from_seq, second.to_seq], [4, 4])
    assert.equal((await verifyAuditChain({ db, store })).valid, true)
  })

  it('recovers when an upload succeeded but was not recorded', async () => {
    const store = fakeStore()
    const first = await anchorAuditChain({ db, store })
    await db.query('TRUNCATE audit_anchors')
    const retry = await anchorAuditChain({ db, store })
    assert.equal(retry.anchored, true)
    assert.equal(retry.object_key, first.object_key)
    assert.equal(store.objects.size, 1)
  })

  it('refuses to copy a broken chain or use an unlocked bucket', async () => {
    assert.equal((await anchorAuditChain({ db, store: fakeStore({ lock: false }) })).reason, 'OBJECT_LOCK_DISABLED')
    await db.query("UPDATE audit_logs SET action = 'FORGED' WHERE chain_seq = 2")
    const store = fakeStore()
    assert.equal((await anchorAuditChain({ db, store })).reason, 'CHAIN_INVALID')
    assert.equal(store.puts.length, 0)
  })

  it('detects a rewritten database using the locked copy', async () => {
    const store = fakeStore()
    await anchorAuditChain({ db, store })
    await db.query("UPDATE audit_anchors SET head_hash = (SELECT entry_hash FROM audit_logs WHERE chain_seq = 3)")
    const [key] = store.objects.keys()
    const stored = JSON.parse(store.objects.get(key).body)
    stored['gg:headHash'] = 'f'.repeat(64)
    store.objects.get(key).body = Buffer.from(JSON.stringify(stored))
    const result = await verifyAuditChain({ db, store })
    assert.equal(result.issue.type, 'ANCHOR_MISMATCH')
  })

  it('protects the real log and limits the check to system admins', async () => {
    // Signing in guarantees a row exists. Each attempt is rolled back whatever happens.
    const owner = await loginAs('admin@gmail.com')
    const attempt = async (sql) => {
      await admin.query('BEGIN')
      try {
        await admin.query(sql)
      } finally {
        await admin.query('ROLLBACK')
      }
    }
    await assert.rejects(attempt("UPDATE public.audit_logs SET action = 'FORGED' WHERE id = (SELECT MAX(id) FROM public.audit_logs)"), /append-only/)
    await assert.rejects(attempt('DELETE FROM public.audit_logs WHERE id = (SELECT MAX(id) FROM public.audit_logs)'), /append-only/)
    const response = await request(app).get('/api/audit-logs/integrity').set('Authorization', `Bearer ${owner.token}`)
    assert.equal(response.status, 200)
    assert.equal(response.body.data.valid, true)
    const employee = await loginAs('employee@gmail.com')
    assert.equal((await request(app).get('/api/audit-logs/integrity').set('Authorization', `Bearer ${employee.token}`)).status, 403)
  })
})
