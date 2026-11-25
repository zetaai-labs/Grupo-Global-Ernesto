import { z } from 'zod'
import { query } from '../config/database.js'
import { STAFF_ROLES } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import {
  createAccount, googleConfigured, microsoftConfigured, providerConfigured, providerDomain, suggestedEmail, suspendAccount, temporaryPassword,
} from '../integrations/directory/providers.js'

/** Google Workspace / Microsoft 365 accounts for staff. Every attempt is recorded in provisioning_jobs. */

export const PROVISIONING_ROLES = ['admin', 'tech_admin']
const httpError = (status, message) => Object.assign(new Error(message), { status })

const body = z.object({
  provider: z.enum(['GOOGLE', 'MICROSOFT']),
  action: z.enum(['CREATE', 'SUSPEND']),
  email: z.string().trim().toLowerCase().email().max(255).optional(),
  dry_run: z.boolean().default(false),
})

async function record(job) {
  const { rows } = await query(
    `INSERT INTO provisioning_jobs (provider, action, user_id, target_email, dry_run, status, request, result, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING job_id, provider, action, target_email, dry_run, status, result, created_at`,
    [job.provider, job.action, job.userId, job.email, job.dryRun, job.status, JSON.stringify(job.request || {}), JSON.stringify(job.result || {}), job.actorId],
  )
  return rows[0]
}

/** The address created for this user earlier, if any. */
async function provisionedEmail(provider, userId) {
  const { rows } = await query(
    `SELECT target_email FROM provisioning_jobs WHERE provider = $1 AND user_id = $2 AND action = 'CREATE' AND status = 'SUCCESS' AND NOT dry_run
     ORDER BY created_at DESC LIMIT 1`,
    [provider, userId],
  )
  return rows[0]?.target_email || null
}

export async function status(_req, res) {
  return res.json({ data: { google: googleConfigured(), microsoft: microsoftConfigured() } })
}

export async function listStaff(_req, res) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.status, r.name AS role,
            (SELECT json_agg(json_build_object('provider', j.provider, 'email', j.target_email, 'action', j.action, 'at', j.created_at) ORDER BY j.created_at)
             FROM provisioning_jobs j WHERE j.user_id = u.id AND j.status = 'SUCCESS' AND NOT j.dry_run) AS accounts
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = ANY($1::text[]) AND u.status <> 'erased' ORDER BY u.name`,
    [STAFF_ROLES],
  )
  return res.json({ data: rows })
}

export async function listJobs(_req, res) {
  const { rows } = await query(
    `SELECT j.job_id, j.provider, j.action, j.target_email, j.dry_run, j.status, j.result, j.created_at, u.name AS user_name, a.name AS created_by_name
     FROM provisioning_jobs j LEFT JOIN users u ON u.id = j.user_id LEFT JOIN users a ON a.id = j.created_by
     ORDER BY j.created_at DESC LIMIT 300`,
  )
  return res.json({ data: rows })
}

/**
 * Creates or suspends a company account for a staff member and records the job.
 * Returns { job, temporary_password } (the password only on a real CREATE, never stored).
 */
export async function provisionAccount({ userId, provider, action, email: requestedEmail, dryRun, actorId }) {
  if (!dryRun && !providerConfigured(provider)) throw httpError(503, `${provider === 'GOOGLE' ? 'Google Workspace' : 'Microsoft 365'} is not connected yet. Use a dry run.`)
  const user = (await query(
    `SELECT u.id, u.name, u.status, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [userId],
  )).rows[0]
  if (!user || !STAFF_ROLES.includes(user.role)) throw httpError(404, 'Staff member not found.')

  // Dry runs before the domain is configured show a clear placeholder address.
  const domain = providerDomain(provider) || 'company-domain.invalid'
  let email
  if (action === 'CREATE') {
    if (user.status !== 'active') throw httpError(409, 'Only active staff can get a company account.')
    if (await provisionedEmail(provider, userId)) throw httpError(409, 'This person already has an account with this provider.')
    email = requestedEmail || suggestedEmail(user.name, domain)
    if (!dryRun && !email.endsWith(`@${domain}`)) throw httpError(400, `The address must end with @${domain}.`)
  } else {
    email = await provisionedEmail(provider, userId)
    if (!email) throw httpError(404, 'No account was created for this person with this provider.')
  }

  const base = { provider, action, userId, email, dryRun, actorId, request: { name: user.name } }
  if (dryRun) {
    const job = await record({ ...base, status: 'PLANNED', result: { note: 'Dry run: nothing was sent.' } })
    return { job, temporary_password: null }
  }

  let password = null
  try {
    if (action === 'CREATE') {
      password = temporaryPassword()
      const created = await createAccount(provider, { email, fullName: user.name, password })
      base.result = { external_id: created.externalId }
    } else {
      await suspendAccount(provider, email)
    }
  } catch (error) {
    await record({ ...base, status: 'FAILED', result: { error: error.message } })
    await writeAudit(actorId, 'PROVISIONING_FAILED', 'users', String(userId), { provider, action })
    throw error
  }
  const job = await record({ ...base, status: 'SUCCESS' })
  await writeAudit(actorId, `PROVISIONING_${action}`, 'users', String(userId), { provider, email })
  return { job, temporary_password: password }
}

export async function provisionUser(req, res) {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) throw httpError(400, 'Invalid user id.')
  const parsed = body.safeParse(req.body || {})
  if (!parsed.success) throw httpError(400, parsed.error.issues[0]?.message || 'Invalid request.')
  const { provider, action, dry_run: dryRun } = parsed.data
  const result = await provisionAccount({ userId, provider, action, email: parsed.data.email, dryRun, actorId: req.user.sub })
  // The temporary password is returned once so it can be handed over in person. It is never stored or logged.
  return res.status(201).json({ data: result.temporary_password ? result : { job: result.job } })
}

/** When an account is suspended here, its company accounts are suspended too (if enabled). */
export async function suspendLinkedAccounts(userId, actorId) {
  if (process.env.PROVISIONING_AUTO_SUSPEND !== 'true') return []
  const done = []
  for (const provider of ['GOOGLE', 'MICROSOFT']) {
    if (!providerConfigured(provider)) continue
    const email = await provisionedEmail(provider, userId)
    if (!email) continue
    try {
      await suspendAccount(provider, email)
      await record({ provider, action: 'SUSPEND', userId, email, dryRun: false, status: 'SUCCESS', actorId, request: { automatic: true } })
      done.push(provider)
    } catch (error) {
      await record({ provider, action: 'SUSPEND', userId, email, dryRun: false, status: 'FAILED', actorId, request: { automatic: true }, result: { error: error.message } })
    }
  }
  return done
}
