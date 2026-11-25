import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { query } from '../src/config/database.js'
import { pruneOldBackups } from '../src/services/backup.service.js'

describe('Backup retention', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-backups-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-outside-'))
  const ids = []

  async function backup(name, daysAgo, type = 'database', where = dir) {
    const file = path.join(where, name)
    fs.writeFileSync(file, 'dump')
    const { rows } = await query(
      `INSERT INTO backups (type, path, size_bytes, created_at) VALUES ($1, $2, 4, now() - make_interval(days => $3)) RETURNING id`,
      [type, file, daysAgo],
    )
    ids.push(rows[0].id)
    return file
  }

  after(async () => {
    await query('DELETE FROM backups WHERE id = ANY($1)', [ids])
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })

  it('removes old local backups but always keeps the newest ones', async () => {
    const files = []
    for (let i = 0; i < 10; i += 1) files.push(await backup(`database-${i}.sql`, 5 + i * 10)) // 5..95 days old
    const outsider = await backup('elsewhere.sql', 200, 'database', outside)
    const lonelyFiles = await backup('files-old', 400, 'files')

    const result = await pruneOldBackups({ days: 30, keepAtLeast: 7, dir })
    // Database: 11 backups; the 7 newest stay (5..65 days), 3 older than 30 days go (75, 85, 95) plus... the outsider is skipped.
    assert.equal(result.removed, 3)
    assert.equal(result.freed_bytes, 12)
    for (const file of files.slice(0, 7)) assert.ok(fs.existsSync(file), `${path.basename(file)} kept`)
    for (const file of files.slice(7)) assert.ok(!fs.existsSync(file), `${path.basename(file)} removed`)
    assert.ok(fs.existsSync(outsider), 'never deletes outside the backups folder')
    assert.ok(fs.existsSync(lonelyFiles), 'the only files backup is kept however old')
    const { rows } = await query('SELECT count(*)::int AS n FROM backups WHERE id = ANY($1)', [ids])
    assert.equal(rows[0].n, 9)
  })

  it('keeps everything when retention is 0', async () => {
    assert.deepEqual(await pruneOldBackups({ days: 0, dir }), { removed: 0, freed_bytes: 0 })
  })
})
