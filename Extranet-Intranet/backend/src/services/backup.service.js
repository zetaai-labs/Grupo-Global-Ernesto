import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { config } from '../config/env.js'
import { query } from '../config/database.js'
import { storageDriver, uploadBackupOffsite } from './storage.service.js'

const backupDir = path.resolve(process.cwd(), 'storage/backups')
fs.mkdirSync(backupDir, { recursive: true })

const container = process.env.BACKUP_CONTAINER || 'grupo_global_db'

function runDocker(args, { stdoutFile, stdinFile } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''

    if (stdinFile) fs.createReadStream(stdinFile).pipe(child.stdin)
    else child.stdin.end()

    const out = stdoutFile ? fs.createWriteStream(stdoutFile) : null
    child.stdout.on('data', (chunk) => out?.write(chunk))
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    child.on('close', (code) => {
      out?.end()
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `Backup command failed (${code})`))
    })
    child.on('error', reject)
  })
}

function sizeOf(target) {
  const stat = fs.statSync(target)
  if (stat.isFile()) return stat.size
  return fs.readdirSync(target).reduce((sum, name) => sum + sizeOf(path.join(target, name)), 0)
}

export async function createBackup(type, userId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  if (!['database', 'files'].includes(type)) throw new Error('Invalid backup type.')

  let target
  if (type === 'database') {
    target = path.join(backupDir, `database-${stamp}.sql`)
    await runDocker(
      ['exec', container, 'pg_dump', '-U', 'grupo_global', '-Fp', 'grupo_global'],
      { stdoutFile: target },
    )
  } else {
    if (storageDriver() === 's3') {
      throw Object.assign(new Error('Files are stored in S3 — use S3 bucket versioning for file backups.'), { status: 400 })
    }
    target = path.join(backupDir, `files-${stamp}`)
    fs.cpSync(config.uploadDir, target, { recursive: true })
  }

  // Off-site copy of database dumps (when BACKUP_TO_S3=true).
  const offsite = type === 'database' ? await uploadBackupOffsite(target) : null

  const size = sizeOf(target)
  const { rows } = await query(
    `INSERT INTO backups (type, path, size_bytes, created_by, offsite_key)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, type, path, size_bytes, offsite_key, created_at`,
    [type, target, size, userId, offsite],
  )
  return rows[0]
}

export async function restoreBackup(id, userId = null) {
  const { rows } = await query('SELECT * FROM backups WHERE id = $1', [id])
  const backup = rows[0]
  if (!backup) throw Object.assign(new Error('Backup not found.'), { status: 404 })
  if (!fs.existsSync(backup.path)) throw Object.assign(new Error('Backup file is missing.'), { status: 404 })

  if (backup.type === 'database') {
    await runDocker(
      ['exec', '-i', container, 'psql', '-U', 'grupo_global', 'grupo_global'],
      { stdinFile: backup.path },
    )
  } else {
    fs.mkdirSync(config.uploadDir, { recursive: true })
    fs.cpSync(backup.path, config.uploadDir, { recursive: true, force: true })
  }

  await query(
    'INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES ($1, $2, $3, $4)',
    [userId, 'BACKUP_RESTORED', 'backups', id],
  )
}
