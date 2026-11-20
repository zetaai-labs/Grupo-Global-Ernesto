import path from 'node:path'
import fs from 'node:fs'
import { z } from 'zod'
import { query } from '../config/database.js'
import { config } from '../config/env.js'
import { writeAudit } from '../services/audit.js'
import { sendStoredFile } from '../services/storage.service.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { withRegion } from '../services/scope.js'

const publicSchema = z.object({
  sender_name: z.string().trim().min(1).max(150),
  sender_email: z.string().trim().email(),
  message: z.string().trim().max(1000).optional(),
})

export async function publicUpload(req, res) {
  const parsed = publicSchema.safeParse(req.body || {})
  if (!parsed.success || !req.file) {
    return res.status(400).json({ message: 'Name, valid email and a file are required.' })
  }

  const { rows } = await query(
    `INSERT INTO received_files
       (original_name, stored_name, size_bytes, mime_type, sender_name, sender_email, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, original_name, status, created_at`,
    [
      req.file.originalname,
      req.file.filename,
      req.file.size,
      req.file.mimetype,
      parsed.data.sender_name,
      parsed.data.sender_email,
      parsed.data.message || null,
    ],
  )
  await notifyRoles(['admin', 'manager'], {
    type: 'received-file',
    title: `File received: ${req.file.originalname}`,
    body: `From ${parsed.data.sender_name} <${parsed.data.sender_email}>`,
    link: '/intranet/web-received-files',
  })
  return res.status(201).json({ data: rows[0] })
}

export async function listReceived(req, res) {
  let base = 'WHERE 1=1'
  const params = []
  if (req.query.status) {
    base += ` AND status = $${params.length + 1}`
    params.push(String(req.query.status))
  }
  const scoped = withRegion(req, base, params)
  const { rows } = await query(
    `SELECT id, original_name, size_bytes, mime_type, sender_name, sender_email,
            message, status, created_at
     FROM received_files ${scoped.sql} ORDER BY id DESC`,
    scoped.params,
  )
  return res.json({ data: rows })
}

export async function reviewReceived(req, res) {
  const { status } = req.body || {}
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be approved or rejected.' })
  }
  const { rowCount } = await query(
    'UPDATE received_files SET status = $1, reviewed_by = $2 WHERE id = $3',
    [status, req.user.sub, req.params.id],
  )
  if (!rowCount) return res.status(404).json({ message: 'File not found.' })

  await writeAudit(req.user.sub, 'RECEIVED_FILE_REVIEWED', 'received_files', req.params.id, { status })
  return res.json({ message: 'Review status saved.' })
}

export async function downloadReceived(req, res) {
  const scoped = withRegion(
    req,
    'SELECT original_name, stored_name, mime_type FROM received_files WHERE id = $1',
    [req.params.id],
  )
  const { rows } = await query(scoped.sql, scoped.params)
  if (!rows[0]) return res.status(404).json({ message: 'File not found.' })

  const sent = await sendStoredFile(res, rows[0].stored_name, rows[0].original_name, rows[0].mime_type)
  if (!sent) return res.status(404).json({ message: 'File is missing from storage.' })
  return undefined
}
