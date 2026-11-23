import { createHash } from 'node:crypto'
import pool from '../config/database.js'
import { auditStore } from '../integrations/aws/s3Storage.js'
import { writeAudit } from './audit.js'
import { notifyRoles } from './notification.service.js'

/**
 * Technical Spec §3.2: verifies the audit hash chain and copies it to write-once storage.
 * The copies hold hashes and pseudonymous actor references, never the event details,
 * because locked objects cannot be erased if a person later exercises GDPR rights.
 */
const ZERO_HASH = '0'.repeat(64)
const ANCHOR_BATCH = 50000
const ANCHORS_CHECKED = 20
const ANCHOR_LOCK_ID = 7216450914

const CHAIN_CHECK = `
  WITH chain AS (
    SELECT a.*,
           lag(entry_hash) OVER (ORDER BY chain_seq) AS prior_hash,
           lag(chain_seq) OVER (ORDER BY chain_seq) AS prior_seq,
           audit_entry_hash(prev_hash, chain_seq, action, entity, entity_id, created_at, actor_ref, details_hash) AS computed
    FROM audit_logs a WHERE chain_seq IS NOT NULL
  ), checked AS (
    SELECT chain_seq, entry_hash,
      CASE
        WHEN chain_seq <> COALESCE(prior_seq, 0) + 1 THEN 'MISSING_ENTRY'
        WHEN prev_hash <> COALESCE(prior_hash, '${ZERO_HASH}') THEN 'BROKEN_LINK'
        WHEN computed <> entry_hash THEN 'ENTRY_CHANGED'
        WHEN details_redacted_at IS NULL AND audit_sha256(details::text) <> details_hash THEN 'DETAILS_CHANGED'
        WHEN user_id IS NOT NULL AND audit_actor_ref(user_id) IS DISTINCT FROM actor_ref THEN 'ACTOR_CHANGED'
      END AS problem
    FROM chain
  )
  SELECT (SELECT COUNT(*)::int FROM checked) AS entries,
         (SELECT COUNT(*)::int FROM checked WHERE problem IS NOT NULL) AS problems,
         (SELECT problem FROM checked WHERE problem IS NOT NULL ORDER BY chain_seq LIMIT 1) AS first_problem,
         (SELECT chain_seq FROM checked WHERE problem IS NOT NULL ORDER BY chain_seq LIMIT 1) AS first_seq,
         (SELECT chain_seq FROM checked ORDER BY chain_seq DESC LIMIT 1) AS last_seq,
         (SELECT entry_hash FROM checked ORDER BY chain_seq DESC LIMIT 1) AS last_hash,
         (SELECT COUNT(*)::int FROM audit_logs WHERE chain_seq IS NULL) AS unchained
`

async function inSnapshot(db, work) {
  const client = await db.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** Confirms locked copies still match the database, which catches a rewrite of the whole chain. */
async function checkStoredAnchors(anchors, store) {
  for (const anchor of anchors.slice(-ANCHORS_CHECKED)) {
    let document
    try {
      document = JSON.parse((await store.read(anchor.object_key)).toString('utf8'))
    } catch {
      return { type: 'ANCHOR_UNREADABLE', seq: Number(anchor.to_seq) }
    }
    if (document['gg:headHash'] !== anchor.head_hash || String(document['gg:toSeq']) !== String(anchor.to_seq)) {
      return { type: 'ANCHOR_MISMATCH', seq: Number(anchor.to_seq) }
    }
  }
  return null
}

export async function verifyAuditChain({ db = pool, store = null } = {}) {
  const { summary, head, anchors, badAnchor } = await inSnapshot(db, async (client) => ({
    summary: (await client.query(CHAIN_CHECK)).rows[0],
    head: (await client.query('SELECT last_seq, last_hash FROM audit_chain_head WHERE id = 1')).rows[0],
    anchors: (await client.query('SELECT to_seq, head_hash, object_key FROM audit_anchors ORDER BY to_seq')).rows,
    badAnchor: (await client.query(
      `SELECT an.to_seq FROM audit_anchors an LEFT JOIN audit_logs a ON a.chain_seq = an.to_seq
       WHERE a.entry_hash IS DISTINCT FROM an.head_hash ORDER BY an.to_seq LIMIT 1`,
    )).rows[0],
  }))

  let issue = null
  if (summary.problems) issue = { type: summary.first_problem, seq: Number(summary.first_seq), count: summary.problems }
  else if (summary.unchained) issue = { type: 'UNCHAINED_ENTRY', count: summary.unchained }
  else if (!head || String(head.last_seq) !== String(summary.last_seq ?? 0) || head.last_hash !== (summary.last_hash ?? ZERO_HASH)) {
    issue = { type: 'HEAD_MISMATCH', seq: Number(head?.last_seq ?? 0) }
  } else if (badAnchor) issue = { type: 'ANCHOR_MISMATCH', seq: Number(badAnchor.to_seq) }
  else if (store) issue = await checkStoredAnchors(anchors, store)

  return {
    valid: !issue,
    entries: summary.entries,
    head_seq: Number(summary.last_seq ?? 0),
    head_hash: summary.last_hash ?? ZERO_HASH,
    anchored_to_seq: anchors.length ? Number(anchors.at(-1).to_seq) : 0,
    issue,
  }
}

function anchorDocument(rows) {
  const first = rows[0]
  const last = rows.at(-1)
  return JSON.stringify({
    '@context': { gg: 'urn:grupo-global:audit#', xsd: 'http://www.w3.org/2001/XMLSchema#' },
    '@type': 'gg:AuditChainSegment',
    'gg:hashAlgorithm': 'SHA-256',
    'gg:fromSeq': Number(first.chain_seq),
    'gg:toSeq': Number(last.chain_seq),
    'gg:previousHash': first.prev_hash,
    'gg:headHash': last.entry_hash,
    '@graph': rows.map((row) => ({
      '@id': `urn:grupo-global:audit:${row.chain_seq}`,
      '@type': 'gg:AuditEntry',
      'gg:seq': Number(row.chain_seq),
      'gg:action': row.action,
      'gg:entity': row.entity,
      'gg:entityId': row.entity_id,
      'gg:createdAt': { '@value': row.created_utc, '@type': 'xsd:dateTime' },
      'gg:actorRef': row.actor_ref,
      'gg:detailsHash': row.details_hash,
      'gg:previousHash': row.prev_hash,
      'gg:entryHash': row.entry_hash,
    })),
  })
}

/** Copies the next unanchored part of the chain to write-once storage. */
export async function anchorAuditChain({ db = pool, store = auditStore } = {}) {
  if (!store.configured()) return { anchored: false, reason: 'NOT_CONFIGURED' }
  const lock = await db.connect()
  try {
    const { rows: [{ locked }] } = await lock.query('SELECT pg_try_advisory_lock($1) AS locked', [ANCHOR_LOCK_ID])
    if (!locked) return { anchored: false, reason: 'ALREADY_RUNNING' }
    try {
      const check = await verifyAuditChain({ db })
      if (!check.valid) return { anchored: false, reason: 'CHAIN_INVALID', issue: check.issue }
      if (!(await store.lockEnabled())) return { anchored: false, reason: 'OBJECT_LOCK_DISABLED' }

      const start = await lock.query('SELECT COALESCE(MAX(to_seq), 0) + 1 AS next FROM audit_anchors')
      const { rows } = await lock.query(
        `SELECT chain_seq, action, entity, entity_id, actor_ref, details_hash, prev_hash, entry_hash,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_utc
         FROM audit_logs WHERE chain_seq >= $1 ORDER BY chain_seq LIMIT $2`,
        [start.rows[0].next, ANCHOR_BATCH],
      )
      if (!rows.length) return { anchored: false, reason: 'UP_TO_DATE' }

      const body = Buffer.from(anchorDocument(rows))
      const checksum = createHash('sha256').update(body).digest('base64')
      const fromSeq = rows[0].chain_seq
      const toSeq = rows.at(-1).chain_seq
      const headHash = rows.at(-1).entry_hash
      const key = `audit/chain/${String(fromSeq).padStart(12, '0')}-${String(toSeq).padStart(12, '0')}-${headHash.slice(0, 16)}.jsonld`
      let retainUntil = new Date(Date.now() + store.retentionDays() * 86400000)

      if (!(await store.put({ key, body, checksum, retainUntil }))) {
        // A previous run uploaded this object but stopped before recording it.
        const existing = await store.head(key)
        if (existing.checksum !== checksum) return { anchored: false, reason: 'OBJECT_CONFLICT' }
        retainUntil = existing.retainUntil
      }
      await lock.query(
        'INSERT INTO audit_anchors (from_seq, to_seq, head_hash, object_key, retain_until) VALUES ($1, $2, $3, $4, $5)',
        [fromSeq, toSeq, headHash, key, retainUntil],
      )
      return { anchored: true, from_seq: Number(fromSeq), to_seq: Number(toSeq), object_key: key }
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1)', [ANCHOR_LOCK_ID])
    }
  } finally {
    lock.release()
  }
}

let lastAlert = null

/** Scheduled check: raises one alert per distinct problem, then anchors a healthy chain. */
export async function runAuditIntegrityJob() {
  const check = await verifyAuditChain({ store: auditStore.configured() ? auditStore : null })
  if (!check.valid) {
    const alert = `${check.issue.type}:${check.issue.seq ?? ''}`
    if (alert !== lastAlert) {
      lastAlert = alert
      await writeAudit(null, 'AUDIT_CHAIN_BROKEN', 'audit_logs', check.issue.seq ?? null, { type: check.issue.type })
      await notifyRoles(['admin', 'tech_admin'], {
        type: 'security',
        title: 'Audit log integrity check failed',
        body: `Problem ${check.issue.type} near entry ${check.issue.seq ?? 'unknown'}.`,
        link: '/intranet/audit-log',
      })
    }
    return check
  }
  lastAlert = null
  const anchor = await anchorAuditChain()
  if (anchor.anchored) await writeAudit(null, 'AUDIT_CHAIN_ANCHORED', 'audit_anchors', null, { to_seq: anchor.to_seq })
  else if (!['NOT_CONFIGURED', 'UP_TO_DATE', 'ALREADY_RUNNING'].includes(anchor.reason)) {
    await writeAudit(null, 'AUDIT_ANCHOR_FAILED', 'audit_anchors', null, { reason: anchor.reason })
  }
  return check
}
