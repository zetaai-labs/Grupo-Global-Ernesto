import { z } from 'zod'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { orgPredicate } from '../services/scope.js'
import { provisionAccount } from '../controllers/provisioning.controller.js'
import { googleConfigured, microsoftConfigured } from '../integrations/directory/providers.js'
import { httpError } from './rules.js'

/**
 * Onboarding plan → company accounts. HR (or the admins) creates the new employee's
 * Google Workspace / Microsoft 365 account from the plan; the "access" task is then ticked off.
 */

const ROLES = ['admin', 'hr', 'tech_admin']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACCESS_TASK = 'Create platform account and access'
const schema = z.object({
  provider: z.enum(['GOOGLE', 'MICROSOFT']),
  email: z.string().trim().toLowerCase().email().max(255).optional(),
  dry_run: z.boolean().default(false),
})

export function accountOptions(req, res) {
  if (!ROLES.includes(req.user.role)) throw httpError(403, 'You do not have permission to perform this action.')
  return res.json({ data: { google: googleConfigured(), microsoft: microsoftConfigured() } })
}

export async function createPlanAccounts(req, res) {
  if (!ROLES.includes(req.user.role)) throw httpError(403, 'You do not have permission to perform this action.')
  if (!UUID.test(req.params.id)) throw httpError(400, 'Invalid id.')
  const parsed = schema.safeParse(req.body || {})
  if (!parsed.success) throw httpError(400, 'Choose Google Workspace or Microsoft 365.')
  const { rows } = await query(
    `SELECT record_id, ref_no, status, data FROM zx_records
     WHERE module = 'onboarding' AND entity = 'plans' AND record_id = $1 AND ${orgPredicate('owner_org_id', '$2')}`,
    [req.params.id, req.user.org_scope ?? null],
  )
  const plan = rows[0]
  if (!plan) throw httpError(404, 'Record not found.')
  if (plan.status !== 'IN_PROGRESS') throw httpError(409, 'This onboarding plan is closed.')
  const employeeId = Number(plan.data?.employee)
  if (!Number.isInteger(employeeId)) throw httpError(409, 'This plan has no employee.')

  const { provider, email, dry_run: dryRun } = parsed.data
  const result = await provisionAccount({ userId: employeeId, provider, action: 'CREATE', email, dryRun, actorId: req.user.sub })

  const label = provider === 'GOOGLE' ? 'Google Workspace' : 'Microsoft 365'
  const note = dryRun ? `Dry run: ${label} account ${result.job.target_email} (nothing sent).` : `${label} account created: ${result.job.target_email}.`
  await query(
    `INSERT INTO zx_record_events (record_id, kind, body, created_by) VALUES ($1, 'comment', $2, $3)`,
    [plan.record_id, note, req.user.sub],
  )
  if (!dryRun) {
    await query(
      `UPDATE zx_records SET status = 'DONE', updated_at = now()
       WHERE module = 'onboarding' AND entity = 'tasks' AND data->>'plan' = $1 AND title = $2 AND status = 'TODO'`,
      [plan.record_id, ACCESS_TASK],
    )
  }
  await writeAudit(req.user.sub, 'ZX_ONBOARDING_ACCOUNTS', 'zx:onboarding:plans', plan.record_id, { provider, dry_run: dryRun })
  return res.status(201).json({ data: { job: result.job, temporary_password: result.temporary_password }, message: note })
}
