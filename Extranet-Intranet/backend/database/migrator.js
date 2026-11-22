import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Forward-only database migrations.
 *
 * `schema/init.sql` is the idempotent baseline and is re-applied when it changes.
 * Files in `migrations/` (NNNN_description.sql) run once, in order, each in its own
 * transaction, and must never be edited after they have been applied.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const LOCK_ID = 7216450913
const BASELINE = '0000_baseline'
const FILE_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/

export const DEFAULT_PATHS = {
  baselineFile: path.join(here, 'schema', 'init.sql'),
  migrationsDir: path.join(here, 'migrations'),
}

// Git may check files out with CRLF on Windows; the same migration must hash the same everywhere.
const checksum = (sql) => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')

async function loadMigrations({ baselineFile, migrationsDir }) {
  const baselineSql = await readFile(baselineFile, 'utf8')
  let names = []
  try {
    names = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const numbers = new Set()
  const files = []
  for (const name of names) {
    const match = FILE_NAME.exec(name)
    if (!match) throw new Error(`Invalid migration name "${name}". Use NNNN_description.sql.`)
    if (match[1] === '0000') throw new Error(`Migration number 0000 is reserved for the baseline ("${name}").`)
    if (numbers.has(match[1])) throw new Error(`Duplicate migration number ${match[1]}.`)
    numbers.add(match[1])
    const sql = await readFile(path.join(migrationsDir, name), 'utf8')
    files.push({ name: name.slice(0, -4), sql, checksum: checksum(sql) })
  }
  return { baseline: { name: BASELINE, sql: baselineSql, checksum: checksum(baselineSql) }, files }
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
}

async function appliedMigrations(client) {
  const { rows } = await client.query('SELECT name, checksum, applied_at FROM schema_migrations ORDER BY name')
  return new Map(rows.map((row) => [row.name, row]))
}

function assertHistory(applied, files) {
  const known = new Map(files.map((file) => [file.name, file]))
  for (const [name, row] of applied) {
    if (name === BASELINE) continue
    const file = known.get(name)
    if (!file) throw new Error(`Migration ${name} was applied but its file is missing.`)
    if (file.checksum !== row.checksum) throw new Error(`Migration ${name} was edited after it was applied. Add a new migration instead.`)
  }
  const last = [...applied.keys()].filter((name) => name !== BASELINE).sort().at(-1)
  const late = files.find((file) => !applied.has(file.name) && last && file.name < last)
  if (late) throw new Error(`Migration ${late.name} is older than the applied migration ${last}. Renumber it.`)
}

async function apply(client, migration) {
  try {
    await client.query('BEGIN')
    await client.query(migration.sql)
    await client.query(
      `INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`,
      [migration.name, migration.checksum],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw new Error(`Migration ${migration.name} failed and was rolled back: ${error.message}`, { cause: error })
  }
}

/** Applies everything pending. Safe to run from several servers at once. */
export async function migrate(pool, paths = DEFAULT_PATHS) {
  const { baseline, files } = await loadMigrations(paths)
  const client = await pool.connect()
  const ran = []
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID])
    try {
      await ensureTable(client)
      const applied = await appliedMigrations(client)
      assertHistory(applied, files)
      if (applied.get(BASELINE)?.checksum !== baseline.checksum) {
        await apply(client, baseline)
        ran.push(baseline.name)
      }
      for (const file of files) {
        if (applied.has(file.name)) continue
        await apply(client, file)
        ran.push(file.name)
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID])
    }
  } finally {
    client.release()
  }
  return ran
}

/** Read-only report of what has run and what is pending. */
export async function migrationStatus(pool, paths = DEFAULT_PATHS) {
  const { baseline, files } = await loadMigrations(paths)
  const exists = await pool.query(`SELECT to_regclass('schema_migrations') IS NOT NULL AS found`)
  const applied = exists.rows[0].found ? await appliedMigrations(pool) : new Map()
  assertHistory(applied, files)
  const pending = files.filter((file) => !applied.has(file.name)).map((file) => file.name)
  if (applied.get(BASELINE)?.checksum !== baseline.checksum) pending.unshift(baseline.name)
  return { applied: [...applied.keys()], pending }
}
