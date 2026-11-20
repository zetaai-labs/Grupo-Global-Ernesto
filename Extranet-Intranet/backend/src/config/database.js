import pg from 'pg'
import { config } from './env.js'

const { Pool } = pg

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
})

export async function query(text, params) {
  return pool.query(text, params)
}

export async function checkConnection() {
  await pool.query('SELECT 1')
}

export default pool

/** Runs `work(client)` inside a transaction; rolls back on error. */
export async function withTransaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
