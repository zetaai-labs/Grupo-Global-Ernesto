import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { createBackup, restoreBackup } from '../services/backup.service.js'

export async function listBackups(_req, res) {
  const { rows } = await query(
    `SELECT b.id, b.type, b.size_bytes, b.offsite_key, b.created_at, u.name AS created_by
     FROM backups b LEFT JOIN users u ON u.id = b.created_by
     ORDER BY b.id DESC`,
  )
  return res.json({ data: rows })
}

export async function createBackupNow(req, res) {
  const type = req.body?.type || 'database'
  try {
    const backup = await createBackup(type, req.user.sub)
    await writeAudit(req.user.sub, 'BACKUP_CREATED', 'backups', backup.id, { type })
    return res.status(201).json({ data: backup })
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
}

export async function restore(req, res) {
  try {
    await restoreBackup(req.params.id, req.user.sub)
    return res.json({ message: 'Backup restored.' })
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message })
  }
}
