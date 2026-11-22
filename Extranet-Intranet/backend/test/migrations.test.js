import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { config } from '../src/config/env.js'
import { migrate, migrationStatus } from '../database/migrator.js'

describe('database migrations', () => {
  const schema = `migration_test_${randomBytes(6).toString('hex')}`
  let admin
  let pool
  let dir
  let paths

  const write = (name, sql) => writeFile(path.join(paths.migrationsDir, name), sql)
  const exists = async (table) => (await pool.query('SELECT to_regclass($1) IS NOT NULL AS found', [`${schema}.${table}`])).rows[0].found

  before(async () => {
    admin = new pg.Pool({ connectionString: config.databaseUrl, max: 1 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4, options: `-c search_path=${schema}` })
    dir = await mkdtemp(path.join(os.tmpdir(), 'migrations-'))
  })

  beforeEach(async () => {
    await admin.query(`DROP SCHEMA ${schema} CASCADE; CREATE SCHEMA ${schema}`)
    await rm(dir, { recursive: true, force: true })
    await mkdir(path.join(dir, 'migrations'), { recursive: true })
    paths = { baselineFile: path.join(dir, 'init.sql'), migrationsDir: path.join(dir, 'migrations') }
    await writeFile(paths.baselineFile, 'CREATE TABLE IF NOT EXISTS base_table (id INT);')
  })

  after(async () => {
    await pool.end()
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin.end()
    await rm(dir, { recursive: true, force: true })
  })

  it('applies pending migrations once and in order', async () => {
    await write('0002_second.sql', 'ALTER TABLE first_table ADD COLUMN extra INT;')
    await write('0001_first.sql', 'CREATE TABLE first_table (id INT);')
    assert.deepEqual(await migrate(pool, paths), ['0000_baseline', '0001_first', '0002_second'])
    assert.deepEqual(await migrate(pool, paths), [])
    assert.deepEqual((await migrationStatus(pool, paths)).pending, [])
  })

  it('rolls back a failed migration and keeps earlier ones', async () => {
    await write('0001_good.sql', 'CREATE TABLE good_table (id INT);')
    await write('0002_bad.sql', 'CREATE TABLE partial_table (id INT); SELECT * FROM missing_table;')
    await assert.rejects(migrate(pool, paths), /0002_bad failed and was rolled back/)
    assert.equal(await exists('good_table'), true)
    assert.equal(await exists('partial_table'), false)
    assert.deepEqual((await migrationStatus(pool, paths)).pending, ['0002_bad'])
  })

  it('refuses edited, missing, and out-of-order migrations', async () => {
    await write('0002_applied.sql', 'CREATE TABLE applied_table (id INT);')
    await migrate(pool, paths)
    await write('0001_late.sql', 'CREATE TABLE late_table (id INT);')
    await assert.rejects(migrate(pool, paths), /older than the applied migration/)
    await rm(path.join(paths.migrationsDir, '0001_late.sql'))
    await write('0002_applied.sql', 'CREATE TABLE changed_table (id INT);')
    await assert.rejects(migrate(pool, paths), /edited after it was applied/)
    await rm(path.join(paths.migrationsDir, '0002_applied.sql'))
    await assert.rejects(migrate(pool, paths), /file is missing/)
  })

  it('treats CRLF and LF copies of a migration as the same file', async () => {
    await write('0001_lines.sql', 'CREATE TABLE line_table (\n  id INT\n);\n')
    await migrate(pool, paths)
    await write('0001_lines.sql', 'CREATE TABLE line_table (\r\n  id INT\r\n);\r\n')
    assert.deepEqual(await migrate(pool, paths), [])
  })

  it('re-applies the baseline when it changes', async () => {
    await migrate(pool, paths)
    await writeFile(paths.baselineFile, 'CREATE TABLE IF NOT EXISTS base_table (id INT); CREATE TABLE IF NOT EXISTS new_base (id INT);')
    assert.deepEqual(await migrate(pool, paths), ['0000_baseline'])
    assert.equal(await exists('new_base'), true)
  })

  it('runs each migration once when servers start together', async () => {
    await write('0001_once.sql', 'CREATE TABLE once_table (id INT);')
    const results = await Promise.all([migrate(pool, paths), migrate(pool, paths), migrate(pool, paths)])
    assert.equal(results.flat().filter((name) => name === '0001_once').length, 1)
  })
})
