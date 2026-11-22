import pool from '../../src/config/database.js'
import { migrate, migrationStatus } from '../migrator.js'

const showStatus = process.argv.includes('--status')

try {
  if (showStatus) {
    const { applied, pending } = await migrationStatus(pool)
    console.log(`[OK] Applied: ${applied.length ? applied.join(', ') : 'none'}`)
    console.log(`[OK] Pending: ${pending.length ? pending.join(', ') : 'none'}`)
  } else {
    const ran = await migrate(pool)
    console.log(ran.length ? `[OK] Database schema applied: ${ran.join(', ')}.` : '[OK] Database schema is up to date.')
  }
} catch (error) {
  console.error(`[FAILED] ${error.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
