// Creates the first Super Administrator on a new production database. Never use the demo seed there.
//
//   npm run admin:create -- --email it@example.com --name "Full Name"
//   npm run admin:create -- --email it@example.com --name "Full Name" --org "Legal name" --tax-id B12345678 --country ESP
//
// --org, --tax-id and --country are needed only while the parent company does not exist yet.
// The password comes from ADMIN_INITIAL_PASSWORD (at least 12 characters). If that is not set,
// a random one is generated and shown once. Change it after the first sign-in.
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import pool from '../../src/config/database.js'

export function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`)
    args[key.slice(2)] = value.trim()
    index += 1
  }
  return args
}

export function validate(args, password) {
  const problems = []
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email || '')) problems.push('--email must be a valid address.')
  if (!args.name || args.name.length < 2) problems.push('--name is required.')
  if (password && password.length < 12) problems.push('ADMIN_INITIAL_PASSWORD must have at least 12 characters.')
  if (args.country && !/^[A-Z]{3}$/.test(args.country)) problems.push('--country must be a 3-letter code such as ESP.')
  return problems
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const supplied = process.env.ADMIN_INITIAL_PASSWORD || ''
  const problems = validate(args, supplied)
  if (problems.length) throw new Error(problems.join(' '))

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const exists = await client.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [args.email])
    if (exists.rowCount) throw new Error('A user with this email already exists. Nothing was changed.')

    let parent = (await client.query(`SELECT org_id, legal_name FROM organizations WHERE org_type = 'PARENT' ORDER BY created_at LIMIT 1`)).rows[0]
    if (!parent) {
      if (!args.org || !args['tax-id']) throw new Error('No parent company exists yet. Add --org "Legal name" --tax-id <tax id> (and --country, default ESP).')
      parent = (await client.query(
        `INSERT INTO organizations (legal_name, org_type, tax_id, country, region_corridor, verification_status, onboarding_stage)
         VALUES ($1, 'PARENT', $2, $3, 'GLOBAL', 'VERIFIED', 5) RETURNING org_id, legal_name`,
        [args.org, args['tax-id'], args.country || 'ESP'],
      )).rows[0]
    }

    const role = (await client.query(`SELECT id FROM roles WHERE name = 'admin'`)).rows[0]
    const region = (await client.query(`SELECT id FROM regions WHERE code = 'GLOBAL'`)).rows[0]
    if (!role || !region) throw new Error('Database is not set up. Run the migrations first.')

    const password = supplied || randomBytes(18).toString('base64url')
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role_id, region_id, status, org_id)
       VALUES ($1, $2, $3, $4, $5, 'active', $6) RETURNING id`,
      [args.name, args.email.toLowerCase(), await bcrypt.hash(password, 12), role.id, region.id, parent.org_id],
    )
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES ($1, 'ADMIN_BOOTSTRAPPED', 'users', $2, '{}'::jsonb)`,
      [rows[0].id, String(rows[0].id)],
    )
    await client.query('COMMIT')

    console.log(`[OK] Super Administrator created for ${args.email.toLowerCase()} in ${parent.legal_name}.`)
    if (!supplied) {
      console.log(`[ONCE] Temporary password: ${password}`)
      console.log('       It is not stored anywhere else. Sign in, then change it under Security > Change password.')
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

if (process.argv[1]?.endsWith('create-admin.js')) {
  try {
    await main()
  } catch (error) {
    console.error(`[FAILED] ${error.message}`)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
