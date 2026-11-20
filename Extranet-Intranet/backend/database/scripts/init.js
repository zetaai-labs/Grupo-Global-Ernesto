import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pool from '../../src/config/database.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const schema = await readFile(path.join(here, '../schema/init.sql'), 'utf8')

await pool.query(schema)
console.log('[OK] Database schema applied.')

await pool.end()
