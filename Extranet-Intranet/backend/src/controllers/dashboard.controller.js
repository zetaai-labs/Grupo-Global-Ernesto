import { query } from '../config/database.js'
import { config } from '../config/env.js'
import { withRegion } from '../services/scope.js'
import { smtpConfigured } from '../services/email.service.js'
import { storageDriver } from '../services/storage.service.js'
import { vaultConfigured } from '../services/vault.service.js'
import { imapConfigured } from '../jobs/emailSync.job.js'
import { requiredTier } from './governance.controller.js'
import { MFA_REQUIRED_ROLES } from '../config/roles.js'
import { permittedFolderIds } from '../middleware/folderPermission.js'

async function scopedCount(req, base) {
  const scoped = withRegion(req, `SELECT COUNT(*)::int AS total FROM ${base}`, [])
  const { rows } = await query(scoped.sql, scoped.params)
  return rows[0].total
}

const single = async (sql, params) => (await query(sql, params)).rows[0]

export async function getDashboard(req, res) {
  const permitted = await permittedFolderIds(req)
  const inFolders = (column) => (permitted ? ` AND ${column} IN (${permitted.map(Number).join(',') || 'NULL'})` : '')
  const [folders, files, workflows, pending, emails] = await Promise.all([
    scopedCount(req, `folders WHERE deleted_at IS NULL${inFolders('id')}`),
    scopedCount(req, `files WHERE deleted_at IS NULL${inFolders('folder_id')}`),
    scopedCount(req, 'workflows WHERE 1=1'),
    scopedCount(req, "workflows WHERE status = 'pending'"),
    single('SELECT COUNT(*)::int AS total FROM emails WHERE user_id = $1', [req.user.sub]).then((row) => row.total),
  ])

  const data = { folders, files, workflows, pendingApprovals: pending, emails }

  if (req.user.role === 'admin') {
    data.users = (await single("SELECT COUNT(*)::int AS total FROM users WHERE status = 'active'")).total
    data.roles = (await single('SELECT COUNT(*)::int AS total FROM roles')).total
  }

  return res.json({ data })
}

// ---------------------------------------------------------------------------
// Role consoles (Schema Document §3: Presidential, DevOps, HR, Delegate)
// ---------------------------------------------------------------------------

async function presidentialConsole() {
  const [orgs, crm, projects, investors, sanctions, alerts] = await Promise.all([
    single(`SELECT COUNT(*) FILTER (WHERE verification_status = 'VERIFIED')::int AS verified,
                   COUNT(*) FILTER (WHERE verification_status = 'PENDING')::int AS pending FROM organizations`),
    single(`SELECT COALESCE(SUM(estimated_value_eur) FILTER (WHERE pipeline_stage IN ('LEAD', 'PROPOSAL', 'DUE_DILIGENCE')), 0)::float AS open_value,
                   COALESCE(SUM(estimated_value_eur) FILTER (WHERE pipeline_stage = 'ACTIVE_CONTRACT'), 0)::float AS active_value
            FROM crm_relationships`),
    single(`SELECT COUNT(*) FILTER (WHERE phase <> 'COMPLETED')::int AS active, COALESCE(SUM(budget_eur), 0)::float AS budget FROM projects_programs`),
    single("SELECT COUNT(*)::int AS total FROM investors_vault WHERE status = 'ACTIVE'"),
    single("SELECT COUNT(*)::int AS total FROM governance_sanctions WHERE status = 'ACTIVE'"),
    single(`SELECT COUNT(*)::int AS total FROM audit_logs
            WHERE action IN ('VAULT_UNAUTHORIZED_ATTEMPT', 'WEBHOOK_SIGNATURE_REJECTED') AND created_at > now() - interval '7 days'`),
  ])
  return {
    console: 'PRESIDENTIAL',
    title: 'Presidential Master Console',
    cards: [
      { label: 'Verified organisations', value: orgs.verified, note: '{count} pending KYC', noteValues: { count: orgs.pending }, link: '/intranet/organizations' },
      { label: 'Open pipeline', value: crm.open_value, format: 'eur', note: 'Lead → due diligence', link: '/intranet/crm' },
      { label: 'Active contracts', value: crm.active_value, format: 'eur', note: 'CRM value', link: '/intranet/crm' },
      { label: 'Active projects', value: projects.active, note: 'Across corridors', link: '/intranet/projects' },
      { label: 'Programme budget', value: projects.budget, format: 'eur', note: 'Total allocated', link: '/intranet/projects' },
      { label: 'Investors in vault', value: investors.total, note: 'Confidential records', link: '/intranet/investor-vault' },
      { label: 'Active sanctions', value: sanctions.total, note: 'Code of Ethics', link: '/intranet/ethics' },
      { label: 'Security alerts (7 days)', value: alerts.total, note: 'Blocked intrusions', link: '/intranet/audit-log', alert: alerts.total > 0 },
    ],
  }
}

async function devOpsConsole() {
  const [users, failed, mfa, backup, errors] = await Promise.all([
    single("SELECT COUNT(*)::int AS total FROM users WHERE status = 'active'"),
    single("SELECT COUNT(*)::int AS total FROM audit_logs WHERE action = 'LOGIN_FAILED' AND created_at > now() - interval '24 hours'"),
    single(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE u.mfa_enabled)::int AS enabled
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.status = 'active' AND r.name = ANY($1::text[])`,
      [MFA_REQUIRED_ROLES],
    ),
    single('SELECT MAX(created_at) AS last FROM backups'),
    single("SELECT COUNT(*)::int AS total FROM audit_logs WHERE action LIKE '%_FAILED' AND action <> 'LOGIN_FAILED' AND created_at > now() - interval '7 days'"),
  ])
  const backupHours = backup.last ? Math.round((Date.now() - new Date(backup.last).getTime()) / 3600000) : null
  return {
    console: 'DEVOPS',
    title: 'DevOps & Tech Control Center',
    cards: [
      { label: 'Active accounts', value: users.total, note: 'All portals', link: '/intranet/user-management' },
      { label: 'Failed sign-ins (24 h)', value: failed.total, note: 'Audit log', link: '/intranet/audit-log', alert: failed.total > 20 },
      { label: 'MFA coverage', value: `${mfa.enabled}/${mfa.total}`, note: config.security.enforceMfa ? 'Enforced' : 'Not enforced yet', alert: mfa.enabled < mfa.total },
      { label: 'Last backup', value: backupHours === null ? 'Never' : `${backupHours} h ago`, note: 'Database and files', link: '/intranet/backups', alert: backupHours === null || backupHours > 26 },
      { label: 'Job failures (7 days)', value: errors.total, note: 'Backups, sync, reminders', link: '/intranet/audit-log', alert: errors.total > 0 },
    ],
    integrations: [
      { name: 'File storage', status: storageDriver() === 's3' ? 'S3' : 'Local disk', ok: true },
      { name: 'Encryption at rest', status: config.storage.encryptionKey || storageDriver() === 's3' ? 'On' : 'Off', ok: Boolean(config.storage.encryptionKey) || storageDriver() === 's3' },
      { name: 'Investor Vault key', status: vaultConfigured() ? 'Configured' : 'Missing', ok: vaultConfigured() },
      { name: 'SMTP (outgoing email)', status: smtpConfigured() ? 'Connected' : 'Not configured', ok: smtpConfigured() },
      { name: 'IMAP (incoming email)', status: imapConfigured() ? 'Connected' : 'Not configured', ok: imapConfigured() },
      { name: 'Website webhook', status: config.integrations.webhookSecret ? 'Secret set' : 'Not configured', ok: Boolean(config.integrations.webhookSecret) },
      { name: 'Mandatory MFA', status: config.security.enforceMfa ? 'Enforced' : 'Off', ok: config.security.enforceMfa },
    ],
  }
}

async function hrConsole() {
  const [people, signed, sanctions, courses, kyc] = await Promise.all([
    single(`SELECT COUNT(*)::int AS total FROM users u JOIN roles r ON r.id = u.role_id
            WHERE u.status = 'active' AND r.name IN ('admin', 'tech_admin', 'hr', 'finance', 'manager', 'employee')`),
    query(`SELECT r.name AS role, COALESCE(array_agg(g.ethics_code_tier) FILTER (WHERE g.ethics_code_tier IS NOT NULL), '{}') AS tiers
           FROM users u JOIN roles r ON r.id = u.role_id
           LEFT JOIN governance_compliance g ON g.user_id = u.id
           WHERE u.status = 'active' GROUP BY u.id, r.name`),
    single(`SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
                   COUNT(*) FILTER (WHERE status = 'ACTIVE' AND tier = 2)::int AS suspended FROM governance_sanctions`),
    single("SELECT COUNT(*)::int AS total FROM course_enrollments WHERE status = 'COMPLETED'"),
    single("SELECT COUNT(*)::int AS total FROM organizations WHERE verification_status = 'PENDING'"),
  ])
  const compliant = signed.rows.filter((row) => row.tiers.includes(requiredTier(row.role))).length
  return {
    console: 'HR',
    title: 'HR Operations Dashboard',
    cards: [
      { label: 'Staff', value: people.total, note: 'Active employees', link: '/intranet/user-management' },
      { label: 'Code of Ethics signed', value: `${compliant}/${signed.rowCount}`, note: 'All accounts', link: '/intranet/ethics', alert: compliant < signed.rowCount },
      { label: 'Active sanctions', value: sanctions.active, note: '{count} suspended', noteValues: { count: sanctions.suspended }, link: '/intranet/ethics' },
      { label: 'Course completions', value: courses.total, note: 'Certificates issued', link: '/intranet/courses' },
      { label: 'Pending KYC', value: kyc.total, note: 'Awaiting Compliance', link: '/intranet/organizations' },
    ],
  }
}

async function financeConsole() {
  const [crm, projects, phases] = await Promise.all([
    single(`SELECT COALESCE(SUM(estimated_value_eur) FILTER (WHERE pipeline_stage IN ('LEAD', 'PROPOSAL', 'DUE_DILIGENCE')), 0)::float AS open_value,
                   COALESCE(SUM(estimated_value_eur) FILTER (WHERE pipeline_stage = 'ACTIVE_CONTRACT'), 0)::float AS active_value,
                   COUNT(*) FILTER (WHERE pipeline_stage = 'ACTIVE_CONTRACT')::int AS active_count
            FROM crm_relationships`),
    single('SELECT COUNT(*)::int AS total, COALESCE(SUM(budget_eur), 0)::float AS budget FROM projects_programs'),
    single(`SELECT COALESCE(SUM(budget_eur) FILTER (WHERE phase = 'EXECUTION'), 0)::float AS execution,
                   COALESCE(SUM(budget_eur) FILTER (WHERE phase IN ('INITIATION', 'PLANNING')), 0)::float AS planned
            FROM projects_programs`),
  ])
  return {
    console: 'FINANCE',
    title: 'Finance Control Panel',
    cards: [
      { label: 'Programme budget', value: projects.budget, format: 'eur', note: '{count} projects', noteValues: { count: projects.total }, link: '/intranet/projects' },
      { label: 'Budget in execution', value: phases.execution, format: 'eur', note: 'Active delivery', link: '/intranet/projects' },
      { label: 'Budget planned', value: phases.planned, format: 'eur', note: 'Initiation and planning', link: '/intranet/projects' },
      { label: 'Active contracts', value: crm.active_value, format: 'eur', note: '{count} contracts', noteValues: { count: crm.active_count }, link: '/intranet/crm' },
      { label: 'Open pipeline', value: crm.open_value, format: 'eur', note: 'Lead → due diligence', link: '/intranet/crm' },
    ],
  }
}

async function delegateConsole(req) {
  const userId = req.user.sub
  const [approvals, projects, milestones, courses, signed] = await Promise.all([
    single(
      `SELECT COUNT(*)::int AS total FROM workflows w
       JOIN workflow_steps s ON s.workflow_id = w.id AND s.step_order = w.current_step
       WHERE w.status = 'pending' AND w.created_by IS DISTINCT FROM $1 AND s.status = 'pending'
         AND (s.approver_id = $1 OR (s.approver_id IS NULL AND s.approver_role = $2))`,
      [userId, req.user.role],
    ),
    single(`SELECT COUNT(*)::int AS total FROM project_members m JOIN projects_programs p ON p.project_id = m.project_id
            WHERE m.user_id = $1 AND p.phase <> 'COMPLETED'`, [userId]),
    single(`SELECT COUNT(*)::int AS total FROM project_milestones ms JOIN project_members m ON m.project_id = ms.project_id
            WHERE m.user_id = $1 AND ms.status <> 'DONE'`, [userId]),
    single("SELECT COUNT(*)::int AS total FROM course_enrollments WHERE user_id = $1 AND status <> 'COMPLETED'", [userId]),
    single('SELECT COUNT(*)::int AS total FROM governance_compliance WHERE user_id = $1 AND ethics_code_tier = $2', [userId, requiredTier(req.user.role)]),
  ])
  return {
    console: 'DELEGATE',
    title: 'Employee & Delegate Workspace',
    cards: [
      { label: 'Waiting for my approval', value: approvals.total, note: 'AutoFlow', link: '/intranet/autoflow', alert: approvals.total > 0 },
      { label: 'My active projects', value: projects.total, note: 'Assigned to me', link: '/intranet/projects' },
      { label: 'Open milestones', value: milestones.total, note: 'In my projects', link: '/intranet/projects' },
      { label: 'Courses in progress', value: courses.total, note: 'Learning', link: '/intranet/courses' },
      { label: 'Code of Ethics', value: signed.total ? 'Signed' : 'Pending', note: 'Required for access', link: '/intranet/ethics', alert: !signed.total },
    ],
  }
}

export async function getConsole(req, res) {
  const builders = { admin: presidentialConsole, tech_admin: devOpsConsole, hr: hrConsole, finance: financeConsole }
  const build = builders[req.user.role] || delegateConsole
  return res.json({ data: await build(req) })
}
