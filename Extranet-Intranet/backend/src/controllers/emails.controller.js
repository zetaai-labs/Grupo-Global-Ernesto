import { z } from 'zod'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { sendMail, smtpConfigured } from '../services/email.service.js'
import { notify } from '../services/notification.service.js'

const FOLDERS = ['inbox', 'sent']

const composeSchema = z.object({
  to: z.string().trim().min(3).max(1000),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(50000),
  in_reply_to: z.coerce.number().int().positive().optional().nullable(),
})

const emailListSchema = z.array(z.string().email())

/** Splits "a@x.com, b@y.com; c@z.com" into a de-duplicated, validated list. */
function parseRecipients(value) {
  const list = [...new Set(String(value).split(/[,;\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))]
  return emailListSchema.safeParse(list).success ? list : null
}

/** A user's own mailbox: ?folder=inbox|sent (default inbox). Mailboxes are always private. */
export async function listEmails(req, res) {
  const folder = FOLDERS.includes(req.query.folder) ? req.query.folder : 'inbox'
  const [list, counts] = await Promise.all([
    query(
      `SELECT id, folder, from_address, from_name, to_address, subject,
              LEFT(body, 160) AS preview, status, read_at, source, created_at
       FROM emails WHERE user_id = $1 AND folder = $2
       ORDER BY created_at DESC, id DESC LIMIT 200`,
      [req.user.sub, folder],
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE folder = 'inbox')::int AS inbox,
         COUNT(*) FILTER (WHERE folder = 'inbox' AND read_at IS NULL)::int AS unread,
         COUNT(*) FILTER (WHERE folder = 'sent')::int AS sent,
         COUNT(*) FILTER (WHERE folder = 'sent' AND status IN ('failed', 'not_sent'))::int AS undelivered
       FROM emails WHERE user_id = $1`,
      [req.user.sub],
    ),
  ])
  return res.json({ data: list.rows, counts: counts.rows[0], smtp: smtpConfigured() })
}

/** Opens one message from the user's own mailbox and marks it read. */
export async function getEmail(req, res) {
  const { rows } = await query(
    `UPDATE emails SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2
     RETURNING id, folder, from_address, from_name, to_address, subject, body, status, read_at, source, in_reply_to, created_at`,
    [req.params.id, req.user.sub],
  )
  if (!rows[0]) return res.status(404).json({ message: 'Email not found.' })
  return res.json({ data: rows[0] })
}

export async function deleteEmail(req, res) {
  const { rowCount } = await query('DELETE FROM emails WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub])
  if (!rowCount) return res.status(404).json({ message: 'Email not found.' })
  await writeAudit(req.user.sub, 'EMAIL_DELETED', 'emails', req.params.id)
  return res.json({ message: 'Email deleted.' })
}

/**
 * Sends a message. Recipients who are platform users receive it in their Inbox immediately;
 * other addresses are delivered through SMTP when it is configured.
 */
export async function sendEmail(req, res) {
  const parsed = composeSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ message: 'To, subject and body are required.' })
  const recipients = parseRecipients(parsed.data.to)
  if (!recipients?.length) return res.status(400).json({ message: 'Enter valid recipient email addresses.' })
  const { subject, body, in_reply_to: inReplyTo } = parsed.data

  const internal = await query(
    "SELECT id, email FROM users WHERE LOWER(email) = ANY($1::text[]) AND status = 'active'",
    [recipients],
  )
  const internalEmails = new Set(internal.rows.map((row) => row.email.toLowerCase()))
  const external = recipients.filter((address) => !internalEmails.has(address))

  let status = 'delivered'
  let message
  if (external.length) {
    if (smtpConfigured()) {
      try {
        await sendMail({ to: external.join(', '), subject, text: body })
        status = 'sent'
      } catch (error) {
        status = internal.rowCount ? 'partially_sent' : 'failed'
        message = 'Delivery to external addresses failed.'
        await writeAudit(req.user.sub, 'EMAIL_FAILED', 'emails', null, { to: external, error: error.message })
      }
    } else {
      status = internal.rowCount ? 'partially_sent' : 'not_sent'
      message = `Delivered inside the platform only. Configure SMTP to reach: ${external.join(', ')}`
    }
  }

  const sender = { address: req.user.email, name: req.user.name }
  const { rows } = await query(
    `INSERT INTO emails (user_id, folder, from_address, from_name, to_address, subject, body, status, read_at, in_reply_to, region)
     VALUES ($1, 'sent', $2, $3, $4, $5, $6, $7, now(), $8, $9)
     RETURNING id, to_address, subject, status, created_at`,
    [req.user.sub, sender.address, sender.name, recipients.join(', '), subject, body, status, inReplyTo || null, req.user.region],
  )

  // Inbox copies for platform users.
  for (const recipient of internal.rows) {
    await query(
      `INSERT INTO emails (user_id, folder, from_address, from_name, to_address, subject, body, status, region)
       VALUES ($1, 'inbox', $2, $3, $4, $5, $6, 'received', $7)`,
      [recipient.id, sender.address, sender.name, recipients.join(', '), subject, body, req.user.region],
    )
  }
  await notify(internal.rows.map((row) => row.id).filter((id) => id !== req.user.sub), {
    type: 'email',
    title: `New email from ${sender.name}`,
    body: subject,
    link: '/intranet/emails',
  })

  await writeAudit(req.user.sub, 'EMAIL_SENT', 'emails', rows[0].id, { to: recipients, status })
  return res.status(201).json({ data: rows[0], message })
}
