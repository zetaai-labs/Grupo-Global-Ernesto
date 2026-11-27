import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { chatEncryptionOn, openMessage, sealMessage } from '../services/chatCrypto.service.js'
import { checkEncryptedMessage } from './e2ee.controller.js'
import { STAFF_ROLES } from '../config/roles.js'

async function isMember(conversationId, userId) {
  const { rowCount } = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  )
  return rowCount > 0
}

export async function listConversations(req, res) {
  const portal = req.query.portal || 'intranet'
  // Private (end-to-end encrypted) chats are listed in whichever portal each person uses.
  const { rows } = await query(
    `SELECT c.id, c.name, c.portal, c.e2ee,
            (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
            other.id AS with_user_id, other.name AS with_name,
            (SELECT k.key_id FROM e2ee_keys k WHERE k.user_id = other.id AND k.retired_at IS NULL) AS with_key_id
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
     LEFT JOIN LATERAL (
       SELECT u.id, u.name FROM conversation_members m JOIN users u ON u.id = m.user_id
       WHERE c.e2ee AND m.conversation_id = c.id AND m.user_id <> $1 LIMIT 1
     ) other ON true
     WHERE c.portal = $2 OR c.e2ee
     ORDER BY c.e2ee, COALESCE((SELECT max(m.id) FROM messages m WHERE m.conversation_id = c.id), 0) DESC, c.id`,
    [req.user.sub, portal],
  )
  // The last message of a private chat is ciphertext: the app shows a lock instead.
  return res.json({ data: rows.map((row) => ({ ...row, last_message: row.e2ee ? null : openMessage(row.last_message) })) })
}

export async function listMessages(req, res) {
  if (!(await isMember(req.params.id, req.user.sub))) {
    return res.status(403).json({ message: 'You are not a member of this conversation.' })
  }
  const { rows } = await query(
    `SELECT m.id, m.body, m.sender_name, m.user_id, m.created_at
     FROM messages m WHERE m.conversation_id = $1 ORDER BY m.id LIMIT 200`,
    [req.params.id],
  )
  return res.json({ data: rows.map((row) => ({ ...row, body: openMessage(row.body) })) })
}

export async function createMessage(req, res) {
  if (!(await isMember(req.params.id, req.user.sub))) {
    return res.status(403).json({ message: 'You are not a member of this conversation.' })
  }
  const body = String(req.body?.body || '').trim()
  if (!body) return res.status(400).json({ message: 'A message is required.' })
  const encrypted = (await query('SELECT e2ee FROM conversations WHERE id = $1', [req.params.id])).rows[0]?.e2ee === true
  if (encrypted) await checkEncryptedMessage(req.params.id, req.user.sub, body)
  else if (body.length > 5000) return res.status(400).json({ message: 'The message is too long.' })

  const { rows } = await query(
    `INSERT INTO messages (conversation_id, user_id, sender_name, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, body, sender_name, user_id, created_at, conversation_id`,
    [req.params.id, req.user.sub, req.user.name || req.user.email, sealMessage(body)],
  )
  rows[0].body = body
  await writeAudit(req.user.sub, 'CHAT_MESSAGE_SENT', 'conversations', req.params.id)

  const members = await query(
    `SELECT cm.user_id, c.name, c.portal, r.name AS role FROM conversation_members cm
     JOIN conversations c ON c.id = cm.conversation_id
     JOIN users u ON u.id = cm.user_id JOIN roles r ON r.id = u.role_id
     WHERE cm.conversation_id = $1 AND cm.user_id <> $2`,
    [req.params.id, req.user.sub],
  )
  // A private chat can join staff and a partner: each person is sent to the chat of their own portal.
  for (const group of [members.rows.filter((row) => !encrypted || STAFF_ROLES.includes(row.role)), members.rows.filter((row) => encrypted && !STAFF_ROLES.includes(row.role))]) {
    if (!group.length) continue
    const { name } = group[0]
    const portal = encrypted ? (STAFF_ROLES.includes(group[0].role) ? 'intranet' : 'extranet') : group[0].portal
    await notify(group.map((row) => row.user_id), {
      type: 'chat',
      title: encrypted ? `${req.user.name || 'New message'} · private chat` : `${req.user.name || 'New message'} in ${name}`,
      // A private chat's text is unreadable to the server, and other chats hide it when encryption at rest is on.
      body: encrypted ? 'New encrypted message' : chatEncryptionOn() ? 'New message' : body.length > 120 ? `${body.slice(0, 117)}…` : body,
      link: `/${portal}/chat`,
    })
  }
  return res.status(201).json({ data: rows[0] })
}
