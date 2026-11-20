import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { query } from '../config/database.js'
import { config } from '../config/env.js'
import { notify } from '../services/notification.service.js'

export function imapConfigured() {
  return Boolean(config.imap.host && config.imap.user && config.imap.pass)
}

function addresses(field) {
  const groups = Array.isArray(field) ? field : field ? [field] : []
  return groups.flatMap((group) => group.value || []).map((entry) => String(entry.address || '').toLowerCase()).filter(Boolean)
}

/**
 * Pulls new messages from the company IMAP mailbox and files each one into the Inbox
 * of every platform user it is addressed to (To/Cc). Messages for nobody on the
 * platform go to IMAP_FALLBACK_RECIPIENT. Duplicate imports are prevented by Message-ID.
 */
export async function syncInbox() {
  if (!imapConfigured()) return { skipped: true }

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.pass },
    logger: false,
  })

  let imported = 0
  await client.connect()
  const lock = await client.getMailboxLock(config.imap.mailbox)
  try {
    const since = new Date(Date.now() - config.imap.lookbackDays * 24 * 60 * 60 * 1000)
    for await (const message of client.fetch({ since }, { source: true, uid: true })) {
      const mail = await simpleParser(message.source)
      const messageId = mail.messageId || `imap-uid-${message.uid}`
      const recipients = [...addresses(mail.to), ...addresses(mail.cc)]

      let owners = (await query(
        "SELECT id FROM users WHERE LOWER(email) = ANY($1::text[]) AND status = 'active'",
        [recipients],
      )).rows.map((row) => row.id)
      if (!owners.length && config.imap.fallbackRecipient) {
        owners = (await query("SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND status = 'active'", [config.imap.fallbackRecipient])).rows.map((row) => row.id)
      }

      const from = mail.from?.value?.[0] || {}
      for (const ownerId of owners) {
        const { rowCount } = await query(
          `INSERT INTO emails (user_id, folder, from_address, from_name, to_address, subject, body, status, message_id, source, created_at)
           VALUES ($1, 'inbox', $2, $3, $4, $5, $6, 'received', $7, 'imap', COALESCE($8, now()))
           ON CONFLICT (user_id, message_id) WHERE message_id IS NOT NULL DO NOTHING`,
          [
            ownerId,
            from.address || null,
            from.name || from.address || 'Unknown sender',
            recipients.join(', '),
            mail.subject || '(no subject)',
            mail.text || (mail.html ? String(mail.html).replace(/<[^>]+>/g, ' ') : ''),
            messageId,
            mail.date || null,
          ],
        )
        if (rowCount) {
          imported += 1
          await notify([ownerId], {
            type: 'email',
            title: `New email from ${from.name || from.address || 'external sender'}`,
            body: mail.subject || '(no subject)',
            link: '/intranet/emails',
          })
        }
      }
    }
  } finally {
    lock.release()
    await client.logout().catch(() => {})
  }
  return { imported }
}

export default { syncInbox, imapConfigured }
