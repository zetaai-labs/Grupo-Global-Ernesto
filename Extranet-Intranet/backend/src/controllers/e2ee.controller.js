import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { STAFF_ROLES, isExternal } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'

/**
 * End-to-end encrypted private chat (Technical Document, Module 1). The server stores public keys, private
 * keys already locked with the owner's passphrase in their browser, and messages already encrypted by the
 * sender's browser. It can relay and store them but never read them.
 */

const fail = (status, message) => Object.assign(new Error(message), { status })
const B64 = /^[A-Za-z0-9+/_=-]+$/
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** e2ee:v1:<sender key>:<recipient key>:<iv>:<ciphertext>, all produced in the browser. */
export const E2EE_MESSAGE = new RegExp(`^e2ee:v1:(${UUID}):(${UUID}):([A-Za-z0-9+/=]{16,24}):([A-Za-z0-9+/=]{8,32000})$`)

const publicJwk = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: z.string().regex(B64).min(40).max(64),
  y: z.string().regex(B64).min(40).max(64),
  ext: z.boolean().optional(),
  key_ops: z.array(z.string()).max(4).optional(),
}).strict() // A private part ("d") is refused: it must never leave the browser unlocked.

const keySchema = z.object({
  public_jwk: publicJwk,
  wrapped_private: z.string().regex(B64).min(40).max(4000),
  kdf_salt: z.string().regex(B64).min(16).max(64),
  kdf_iterations: z.coerce.number().int().min(210000).max(5000000),
  replace: z.boolean().default(false),
})

/** My current locked key (to unlock in the browser) and the ids of my earlier keys. */
export async function myKey(req, res) {
  const { rows } = await query(
    'SELECT key_id, public_jwk, wrapped_private, kdf_salt, kdf_iterations, created_at, retired_at FROM e2ee_keys WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.sub],
  )
  const current = rows.find((row) => !row.retired_at) || null
  return res.json({ data: { current, earlier_key_ids: rows.filter((row) => row.retired_at).map((row) => row.key_id) } })
}

/** Turns private chat on, or resets it after a forgotten passphrase (earlier messages stay unreadable to me). */
export async function saveMyKey(req, res) {
  const parsed = keySchema.safeParse(req.body || {})
  if (!parsed.success) throw fail(400, 'The encryption key could not be saved. Reload the page and try again.')
  const d = parsed.data
  const saved = await withTransaction(async (client) => {
    const existing = await client.query('SELECT key_id FROM e2ee_keys WHERE user_id = $1 AND retired_at IS NULL FOR UPDATE', [req.user.sub])
    if (existing.rows[0] && !d.replace) throw fail(409, 'Private chat is already set up on your account.')
    if (existing.rows[0]) await client.query('UPDATE e2ee_keys SET retired_at = now() WHERE key_id = $1', [existing.rows[0].key_id])
    const { rows } = await client.query(
      `INSERT INTO e2ee_keys (user_id, public_jwk, wrapped_private, kdf_salt, kdf_iterations) VALUES ($1, $2, $3, $4, $5) RETURNING key_id`,
      [req.user.sub, JSON.stringify(d.public_jwk), d.wrapped_private, d.kdf_salt, d.kdf_iterations],
    )
    return { key_id: rows[0].key_id, reset: Boolean(existing.rows[0]) }
  })
  await writeAudit(req.user.sub, saved.reset ? 'E2EE_KEY_RESET' : 'E2EE_KEY_CREATED', 'e2ee_keys', saved.key_id)
  return res.status(201).json({ data: { key_id: saved.key_id } })
}

/** Public keys by id, only for people I share a private conversation with (or myself). */
export async function publicKeys(req, res) {
  const ids = String(req.query.ids || '').split(',').filter((id) => new RegExp(`^${UUID}$`).test(id)).slice(0, 50)
  if (!ids.length) return res.json({ data: [] })
  const { rows } = await query(
    `SELECT k.key_id, k.user_id, k.public_jwk FROM e2ee_keys k
     WHERE k.key_id = ANY($1::uuid[]) AND (k.user_id = $2 OR EXISTS (
       SELECT 1 FROM conversation_members a JOIN conversation_members b ON b.conversation_id = a.conversation_id
       JOIN conversations c ON c.id = a.conversation_id AND c.e2ee
       WHERE a.user_id = $2 AND b.user_id = k.user_id))`,
    [ids, req.user.sub],
  )
  return res.json({ data: rows })
}

/** Who I may start a private chat with: staff with anyone active; partners and clients with staff only. */
function allowedPair(me, other) {
  if (STAFF_ROLES.includes(me)) return true
  return isExternal(me) && STAFF_ROLES.includes(other)
}

export async function privateContacts(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 80)
  if (q.length < 2) return res.json({ data: [] })
  const roles = STAFF_ROLES.includes(req.user.role) ? null : STAFF_ROLES
  const { rows } = await query(
    `SELECT u.id, u.name, r.name AS role, o.legal_name AS organization,
            EXISTS (SELECT 1 FROM e2ee_keys k WHERE k.user_id = u.id AND k.retired_at IS NULL) AS has_key
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN organizations o ON o.org_id = u.org_id
     WHERE u.status = 'active' AND u.id <> $1 AND (u.name ILIKE $2 OR u.email ILIKE $2)
       AND ($3::text[] IS NULL OR r.name = ANY($3::text[]))
     ORDER BY u.name LIMIT 20`,
    [req.user.sub, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, roles],
  )
  return res.json({ data: rows })
}

/** Opens (or reuses) the private conversation between me and one other person. */
export async function startPrivate(req, res) {
  const otherId = Number(req.body?.user_id)
  if (!Number.isInteger(otherId) || otherId <= 0 || otherId === req.user.sub) throw fail(400, 'Choose who to talk to.')
  const other = (await query(
    `SELECT u.id, u.name, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.status = 'active'`, [otherId],
  )).rows[0]
  if (!other || !allowedPair(req.user.role, other.role)) throw fail(403, 'You cannot start a private chat with this person.')
  const conversation = await withTransaction(async (client) => {
    // Serialise per pair, so two people starting a chat with each other at once get the same conversation.
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [Math.min(req.user.sub, otherId), Math.max(req.user.sub, otherId)])
    const existing = await client.query(
      `SELECT c.id FROM conversations c
       WHERE c.e2ee AND (SELECT count(*) FROM conversation_members m WHERE m.conversation_id = c.id) = 2
         AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = $1)
         AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = $2)
       LIMIT 1`,
      [req.user.sub, otherId],
    )
    if (existing.rows[0]) return { id: existing.rows[0].id, created: false }
    const { rows } = await client.query(
      `INSERT INTO conversations (name, portal, e2ee, created_by) VALUES ($1, $2, true, $3) RETURNING id`,
      ['Private chat', isExternal(req.user.role) ? 'extranet' : 'intranet', req.user.sub],
    )
    await client.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)', [rows[0].id, req.user.sub, otherId])
    return { id: rows[0].id, created: true }
  })
  if (conversation.created) await writeAudit(req.user.sub, 'E2EE_CHAT_STARTED', 'conversations', String(conversation.id), { with: otherId })
  return res.status(conversation.created ? 201 : 200).json({ data: { id: conversation.id } })
}

/**
 * Checks an encrypted message before it is stored: the right format, sent with the sender's current key,
 * addressed to a key that belongs to the other member. The server cannot (and does not try to) read it.
 */
export async function checkEncryptedMessage(conversationId, senderId, body) {
  const match = E2EE_MESSAGE.exec(body)
  if (!match) throw fail(400, 'Private chats only accept encrypted messages. Unlock private chat and try again.')
  const [, senderKey, recipientKey] = match
  const { rows } = await query(
    `SELECT
       EXISTS (SELECT 1 FROM e2ee_keys WHERE key_id = $1 AND user_id = $3 AND retired_at IS NULL) AS sender_ok,
       EXISTS (SELECT 1 FROM e2ee_keys k JOIN conversation_members m ON m.user_id = k.user_id
               WHERE k.key_id = $2 AND m.conversation_id = $4 AND k.user_id <> $3 AND k.retired_at IS NULL) AS recipient_ok`,
    [senderKey, recipientKey, senderId, conversationId],
  )
  if (!rows[0].sender_ok || !rows[0].recipient_ok) throw fail(409, 'The encryption keys changed. Reload the conversation and send again.')
}
