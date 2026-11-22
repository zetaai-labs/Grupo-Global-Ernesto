import JSZip from 'jszip'
import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { exportUserData, eraseUser } from '../services/gdpr.service.js'

/** GDPR ARCO rights: Access, Rectification, Cancellation, Opposition (Technical Spec §3.2). */

const OFFICERS = ['admin', 'hr']
const uuid = z.string().uuid()
const fail = (res, status, message) => res.status(status).json({ message })

const requestSchema = z.object({
  request_type: z.enum(['RECTIFICATION', 'CANCELLATION', 'OPPOSITION']),
  field: z.enum(['name', 'email', 'other']).optional().nullable(),
  requested_value: z.string().trim().min(2).max(255).optional().nullable(),
  details: z.string().trim().min(10).max(2000),
}).refine((data) => data.request_type !== 'RECTIFICATION' || (data.field && data.requested_value), 'Say which data is wrong and the correct value.')

export async function myPrivacy(req, res) {
  const [user, requests] = await Promise.all([
    query('SELECT processing_opposed FROM users WHERE id = $1', [req.user.sub]),
    query(
      `SELECT request_id, request_type, field, requested_value, details, status, due_at, decided_at, response, created_at
       FROM gdpr_requests WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.sub],
    ),
  ])
  return res.json({ data: { processing_opposed: user.rows[0]?.processing_opposed || false, requests: requests.rows } })
}

/** Right of access: a ZIP with one JSON file per data category. */
export async function exportZip(req, res) {
  const data = await exportUserData(req.user.sub)
  const zip = new JSZip()
  zip.file('README.txt', [
    'Global Group: your personal data export (GDPR right of access).',
    `Generated: ${data.exported_at}`,
    '',
    'Each JSON file holds one category of data the platform stores about you.',
    'Passwords and security secrets are never included.',
  ].join('\n'))
  for (const [section, content] of Object.entries(data)) {
    if (section !== 'exported_at') zip.file(`${section}.json`, JSON.stringify(content, null, 2))
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await writeAudit(req.user.sub, 'GDPR_ACCESS_EXPORT', 'users', req.user.sub, { format: 'zip' })
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', 'attachment; filename="my-global-group-data.zip"')
  return res.send(buffer)
}

export async function createRequest(req, res) {
  const parsed = requestSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Describe your request (at least 10 characters).')
  const { request_type: type, field, requested_value: value, details } = parsed.data
  try {
    const { rows } = await query(
      `INSERT INTO gdpr_requests (user_id, request_type, field, requested_value, details)
       VALUES ($1, $2, $3, $4, $5) RETURNING request_id, due_at`,
      [req.user.sub, type, type === 'RECTIFICATION' ? field : null, type === 'RECTIFICATION' ? value : null, details],
    )
    await writeAudit(req.user.sub, 'GDPR_REQUEST_CREATED', 'gdpr_requests', rows[0].request_id, { type })
    await notifyRoles(OFFICERS, { type: 'privacy', title: `GDPR ${type.toLowerCase()} request`, body: `From ${req.user.name}`, link: '/intranet/privacy' }, req.user.sub)
    return res.status(201).json({ data: rows[0], message: 'Request received. We will respond within one month.' })
  } catch (error) {
    if (error.code === '23505') return fail(res, 409, 'You already have a pending request of this type.')
    throw error
  }
}

export async function listRequests(req, res) {
  if (!OFFICERS.includes(req.user.role)) return fail(res, 403, 'Only HR and the Super Administrator can review privacy requests.')
  const { rows } = await query(
    `SELECT g.request_id, g.user_id, g.request_type, g.field, g.requested_value, g.details, g.status, g.due_at,
            g.decided_at, g.response, g.created_at, u.name AS user_name, u.email AS user_email, d.name AS decided_by_name
     FROM gdpr_requests g
     JOIN users u ON u.id = g.user_id
     LEFT JOIN users d ON d.id = g.decided_by
     ORDER BY (g.status = 'PENDING') DESC, g.due_at
     LIMIT 300`,
  )
  return res.json({ data: rows })
}

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  response: z.string().trim().min(5).max(2000),
})

export async function decideRequest(req, res) {
  if (!OFFICERS.includes(req.user.role)) return fail(res, 403, 'Only HR and the Super Administrator can decide privacy requests.')
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid request id.')
  const parsed = decisionSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, 'Choose a decision and explain it to the person.')
  const { decision, response } = parsed.data

  const found = await query('SELECT * FROM gdpr_requests WHERE request_id = $1', [req.params.id])
  const request = found.rows[0]
  if (!request) return fail(res, 404, 'Request not found.')
  if (request.status !== 'PENDING') return fail(res, 409, 'This request has already been decided.')
  if (request.user_id === req.user.sub) return fail(res, 400, 'Another officer must decide your own request.')

  const approved = decision === 'APPROVED'
  if (approved && request.request_type === 'CANCELLATION' && req.user.role !== 'admin') {
    return fail(res, 403, 'Only the Super Administrator can approve erasure.')
  }
  if (approved && request.request_type === 'RECTIFICATION' && request.field === 'email') {
    const taken = await query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2', [request.requested_value, request.user_id])
    if (taken.rowCount) return fail(res, 409, 'That email address is already in use.')
    if (!z.string().email().safeParse(request.requested_value).success) return fail(res, 400, 'The requested email address is not valid.')
  }

  // Notify before an erasure, while the person's account still exists.
  await notify([request.user_id], {
    type: 'privacy',
    title: `Your privacy request was ${decision.toLowerCase()}`,
    body: response.slice(0, 140),
  })

  if (approved && request.request_type === 'CANCELLATION') {
    try {
      await eraseUser(request.user_id, req.user.sub)
    } catch (error) {
      if (error.status) return fail(res, error.status, error.message)
      throw error
    }
  }

  await withTransaction(async (client) => {
    if (approved && request.request_type === 'RECTIFICATION' && ['name', 'email'].includes(request.field)) {
      await client.query(`UPDATE users SET ${request.field === 'name' ? 'name' : 'email'} = $1 WHERE id = $2`, [request.requested_value, request.user_id])
    }
    if (approved && request.request_type === 'OPPOSITION') {
      await client.query('UPDATE users SET processing_opposed = true WHERE id = $1', [request.user_id])
    }
    const erased = approved && request.request_type === 'CANCELLATION'
    await client.query(
      `UPDATE gdpr_requests SET status = $2, decided_by = $3, decided_at = now(), response = $4,
              details = CASE WHEN $5 THEN '[erased]' ELSE details END,
              requested_value = CASE WHEN $5 THEN NULL ELSE requested_value END
       WHERE request_id = $1`,
      [request.request_id, decision, req.user.sub, response, erased],
    )
  })

  await writeAudit(req.user.sub, 'GDPR_REQUEST_DECIDED', 'gdpr_requests', request.request_id, { type: request.request_type, decision })
  return res.json({ message: `Request ${decision.toLowerCase()}.` })
}
