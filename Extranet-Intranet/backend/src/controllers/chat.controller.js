import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { chatEncryptionOn, openMessage, sealMessage } from '../services/chatCrypto.service.js'

async function isMember(conversationId, userId) {
  const { rowCount } = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  )
  return rowCount > 0
}

export async function listConversations(req, res) {
  const portal = req.query.portal || 'intranet'
  const { rows } = await query(
    `SELECT c.id, c.name, c.portal,
            (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
     WHERE c.portal = $2
     ORDER BY c.id`,
    [req.user.sub, portal],
  )
  return res.json({ data: rows.map((row) => ({ ...row, last_message: openMessage(row.last_message) })) })
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

  const { rows } = await query(
    `INSERT INTO messages (conversation_id, user_id, sender_name, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, body, sender_name, user_id, created_at, conversation_id`,
    [req.params.id, req.user.sub, req.user.name || req.user.email, sealMessage(body)],
  )
  rows[0].body = body
  await writeAudit(req.user.sub, 'CHAT_MESSAGE_SENT', 'conversations', req.params.id)

  const members = await query(
    `SELECT cm.user_id, c.name, c.portal FROM conversation_members cm
     JOIN conversations c ON c.id = cm.conversation_id
     WHERE cm.conversation_id = $1 AND cm.user_id <> $2`,
    [req.params.id, req.user.sub],
  )
  if (members.rows.length) {
    const { name, portal } = members.rows[0]
    await notify(members.rows.map((row) => row.user_id), {
      type: 'chat',
      title: `${req.user.name || 'New message'} in ${name}`,
      body: chatEncryptionOn() ? 'New message' : body.length > 120 ? `${body.slice(0, 117)}…` : body,
      link: `/${portal}/chat`,
    })
  }
  return res.status(201).json({ data: rows[0] })
}
