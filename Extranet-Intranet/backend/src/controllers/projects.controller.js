import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { notify } from '../services/notification.service.js'
import { isExternal } from '../config/roles.js'

/** Projects & programs (Schema Document §4.5). */

export const CORRIDORS = ['SPAIN_EU_INDIA', 'LATAM_EXPANSION', 'GCC_DUBAI', 'NORTH_AFRICA']
export const PHASES = ['INITIATION', 'PLANNING', 'EXECUTION', 'MONITORING', 'COMPLETED']
const MILESTONE_STATUS = ['PLANNED', 'IN_PROGRESS', 'DONE', 'BLOCKED']
const PROJECT_MANAGERS = ['admin', 'manager']

const uuid = z.string().uuid()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const fail = (res, status, message) => res.status(status).json({ message })

async function loadProject(id) {
  const { rows } = await query(
    `SELECT p.*, o.legal_name AS lead_entity_name, u.name AS owner_name
     FROM projects_programs p
     JOIN organizations o ON o.org_id = p.lead_entity
     LEFT JOIN users u ON u.id = p.owner_id
     WHERE p.project_id = $1`,
    [id],
  )
  return rows[0]
}

async function isMember(projectId, userId) {
  const { rowCount } = await query('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId])
  return rowCount > 0
}

/** Managers/admins and the project owner can edit; members can update milestones. */
async function permissions(user, project) {
  const manage = PROJECT_MANAGERS.includes(user.role) || project.owner_id === user.sub
  const member = manage || (await isMember(project.project_id, user.sub))
  return { manage, member }
}

export async function listProjects(req, res) {
  const params = []
  const filters = []
  const add = (sql, value) => {
    params.push(value)
    filters.push(sql.replace('?', `$${params.length}`))
  }
  if (req.query.phase) add('p.phase = ?', String(req.query.phase).toUpperCase())
  if (req.query.corridor) add('p.corridor = ?', String(req.query.corridor).toUpperCase())
  if (req.query.mine === 'true') {
    params.push(req.user.sub)
    filters.push(`(p.owner_id = $${params.length} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.project_id AND pm.user_id = $${params.length}))`)
  }

  const { rows } = await query(
    `SELECT p.project_id, p.title, p.corridor, p.budget_eur, p.phase, p.start_date, p.end_date, p.updated_at,
            o.legal_name AS lead_entity_name, u.name AS owner_name,
            (SELECT COUNT(*)::int FROM project_milestones m WHERE m.project_id = p.project_id) AS milestones,
            (SELECT COUNT(*)::int FROM project_milestones m WHERE m.project_id = p.project_id AND m.status = 'DONE') AS milestones_done,
            (SELECT COUNT(*)::int FROM project_members pm WHERE pm.project_id = p.project_id) AS members
     FROM projects_programs p
     JOIN organizations o ON o.org_id = p.lead_entity
     LEFT JOIN users u ON u.id = p.owner_id
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY CASE p.phase WHEN 'EXECUTION' THEN 0 WHEN 'PLANNING' THEN 1 WHEN 'INITIATION' THEN 2 WHEN 'MONITORING' THEN 3 ELSE 4 END, p.updated_at DESC`,
    params,
  )
  const totals = rows.reduce((acc, row) => {
    acc.budget += Number(row.budget_eur)
    acc.byPhase[row.phase] = (acc.byPhase[row.phase] || 0) + 1
    return acc
  }, { budget: 0, byPhase: {} })
  return res.json({ data: rows, meta: { corridors: CORRIDORS, phases: PHASES, milestone_status: MILESTONE_STATUS, totals } })
}

export async function getProject(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid project id.')
  const project = await loadProject(req.params.id)
  if (!project) return fail(res, 404, 'Project not found.')
  const [members, partners, milestones, perms] = await Promise.all([
    query(`SELECT u.id, u.name, r.name AS role, pm.project_role FROM project_members pm
           JOIN users u ON u.id = pm.user_id JOIN roles r ON r.id = u.role_id
           WHERE pm.project_id = $1 ORDER BY u.name`, [req.params.id]),
    query(`SELECT o.org_id, o.legal_name, o.org_type FROM project_partners pp
           JOIN organizations o ON o.org_id = pp.org_id WHERE pp.project_id = $1 ORDER BY o.legal_name`, [req.params.id]),
    query(`SELECT milestone_id, title, due_date, status, shared_with_partners, updated_at FROM project_milestones
           WHERE project_id = $1 ORDER BY due_date NULLS LAST, created_at`, [req.params.id]),
    permissions(req.user, project),
  ])
  return res.json({
    data: { ...project, members: members.rows, partners: partners.rows, milestones: milestones.rows, can_manage: perms.manage, can_update: perms.member },
  })
}

const projectFields = {
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  corridor: z.enum(CORRIDORS),
  budget_eur: z.coerce.number().nonnegative().max(1e13),
  phase: z.enum(PHASES),
  lead_entity: uuid,
  owner_id: z.coerce.number().int().positive().optional().nullable(),
  start_date: date.optional().nullable(),
  end_date: date.optional().nullable(),
}
const projectSchema = z.object({ ...projectFields, phase: projectFields.phase.default('INITIATION') })
// No defaults on update: omitted fields must stay unchanged.
const projectUpdateSchema = z.object(projectFields).partial()

export async function createProject(req, res) {
  if (!PROJECT_MANAGERS.includes(req.user.role)) return fail(res, 403, 'Only managers and administrators can create projects.')
  const parsed = projectSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid project.')
  const data = parsed.data
  if (data.start_date && data.end_date && data.end_date < data.start_date) return fail(res, 400, 'End date must be after the start date.')
  const unit = await query("SELECT 1 FROM organizations WHERE org_id = $1 AND org_type IN ('PARENT', 'BUSINESS_UNIT')", [data.lead_entity])
  if (!unit.rowCount) return fail(res, 400, 'The lead entity must be a Grupo Global business unit.')

  try {
    const project = await withTransaction(async (client) => {
      const owner = data.owner_id || req.user.sub
      const { rows } = await client.query(
        `INSERT INTO projects_programs (title, description, corridor, budget_eur, phase, lead_entity, owner_id, start_date, end_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING project_id`,
        [data.title, data.description || null, data.corridor, data.budget_eur, data.phase, data.lead_entity, owner,
          data.start_date || null, data.end_date || null, req.user.sub],
      )
      await client.query("INSERT INTO project_members (project_id, user_id, project_role) VALUES ($1, $2, 'OWNER')", [rows[0].project_id, owner])
      return rows[0]
    })
    await writeAudit(req.user.sub, 'PROJECT_CREATED', 'projects_programs', project.project_id, { corridor: data.corridor, budget_eur: data.budget_eur })
    return res.status(201).json({ data: project })
  } catch (error) {
    if (error.code === '23505') return fail(res, 409, 'A project with this title already exists.')
    throw error
  }
}

export async function updateProject(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid project id.')
  const project = await loadProject(req.params.id)
  if (!project) return fail(res, 404, 'Project not found.')
  if (!(await permissions(req.user, project)).manage) return fail(res, 403, 'Only the project owner, managers or administrators can edit this project.')
  const parsed = projectUpdateSchema.safeParse(req.body || {})
  if (!parsed.success || !Object.keys(parsed.data).length) return fail(res, 400, parsed.error?.issues?.[0]?.message || 'Nothing to update.')
  const data = parsed.data
  const columns = Object.keys(data)
  await query(
    `UPDATE projects_programs SET ${columns.map((column, index) => `${column} = $${index + 2}`).join(', ')}, updated_at = now() WHERE project_id = $1`,
    [req.params.id, ...columns.map((column) => data[column] ?? null)],
  )
  if (data.phase && data.phase !== project.phase) {
    const members = await query('SELECT user_id FROM project_members WHERE project_id = $1 AND user_id <> $2', [req.params.id, req.user.sub])
    await notify(members.rows.map((row) => row.user_id), {
      type: 'project', title: `${project.title}: phase ${data.phase}`, body: `Updated by ${req.user.name}`, link: '/intranet/projects',
    })
  }
  await writeAudit(req.user.sub, 'PROJECT_UPDATED', 'projects_programs', req.params.id, data)
  return res.json({ message: 'Project updated.' })
}

export async function addMember(req, res) {
  const project = uuid.safeParse(req.params.id).success && (await loadProject(req.params.id))
  if (!project) return fail(res, 404, 'Project not found.')
  if (!(await permissions(req.user, project)).manage) return fail(res, 403, 'Only the project owner, managers or administrators can manage the team.')
  const userId = Number(req.body?.user_id)
  const staff = await query(
    `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.status = 'active' AND r.name IN ('admin', 'tech_admin', 'hr', 'manager', 'employee')`,
    [userId],
  )
  if (!staff.rowCount) return fail(res, 400, 'Choose an active staff member.')
  await query(
    `INSERT INTO project_members (project_id, user_id, project_role) VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET project_role = EXCLUDED.project_role`,
    [req.params.id, userId, String(req.body?.project_role || 'MEMBER').slice(0, 40).toUpperCase()],
  )
  if (userId !== req.user.sub) {
    await notify([userId], { type: 'project', title: `Added to project: ${project.title}`, body: `By ${req.user.name}`, link: '/intranet/projects' })
  }
  return res.status(201).json({ message: 'Team member added.' })
}

export async function removeMember(req, res) {
  const project = uuid.safeParse(req.params.id).success && (await loadProject(req.params.id))
  if (!project) return fail(res, 404, 'Project not found.')
  if (!(await permissions(req.user, project)).manage) return fail(res, 403, 'Only the project owner, managers or administrators can manage the team.')
  if (Number(req.params.userId) === project.owner_id) return fail(res, 409, 'Change the owner before removing them from the team.')
  await query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [req.params.id, Number(req.params.userId)])
  return res.json({ message: 'Team member removed.' })
}

export async function addPartner(req, res) {
  const project = uuid.safeParse(req.params.id).success && (await loadProject(req.params.id))
  if (!project) return fail(res, 404, 'Project not found.')
  if (!(await permissions(req.user, project)).manage) return fail(res, 403, 'Only the project owner, managers or administrators can link partners.')
  const orgId = String(req.body?.org_id || '')
  if (!uuid.safeParse(orgId).success) return fail(res, 400, 'Choose an organisation.')
  const org = await query(
    "SELECT legal_name FROM organizations WHERE org_id = $1 AND verification_status = 'VERIFIED' AND org_type NOT IN ('PARENT', 'BUSINESS_UNIT')",
    [orgId],
  )
  if (!org.rowCount) return fail(res, 400, 'Only verified external organisations can be linked.')
  await query('INSERT INTO project_partners (project_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, orgId])
  const users = await query("SELECT id FROM users WHERE org_id = $1 AND status = 'active'", [orgId])
  await notify(users.rows.map((row) => row.id), { type: 'project', title: `Project shared with you: ${project.title}`, link: '/extranet/project-updates' })
  await writeAudit(req.user.sub, 'PROJECT_PARTNER_LINKED', 'projects_programs', req.params.id, { org_id: orgId })
  return res.status(201).json({ message: `${org.rows[0].legal_name} linked to the project.` })
}

export async function removePartner(req, res) {
  const project = uuid.safeParse(req.params.id).success && (await loadProject(req.params.id))
  if (!project) return fail(res, 404, 'Project not found.')
  if (!(await permissions(req.user, project)).manage) return fail(res, 403, 'Only the project owner, managers or administrators can unlink partners.')
  await query('DELETE FROM project_partners WHERE project_id = $1 AND org_id = $2', [req.params.id, req.params.orgId])
  return res.json({ message: 'Partner unlinked.' })
}

const milestoneFields = {
  title: z.string().trim().min(2).max(255),
  due_date: date.optional().nullable(),
  status: z.enum(MILESTONE_STATUS),
  shared_with_partners: z.boolean(),
}
const milestoneSchema = z.object({
  ...milestoneFields,
  status: milestoneFields.status.default('PLANNED'),
  shared_with_partners: milestoneFields.shared_with_partners.default(false),
})
const milestoneUpdateSchema = z.object(milestoneFields).partial()

export async function addMilestone(req, res) {
  const project = uuid.safeParse(req.params.id).success && (await loadProject(req.params.id))
  if (!project) return fail(res, 404, 'Project not found.')
  if (!(await permissions(req.user, project)).member) return fail(res, 403, 'Only project members can add milestones.')
  const parsed = milestoneSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid milestone.')
  const { rows } = await query(
    `INSERT INTO project_milestones (project_id, title, due_date, status, shared_with_partners, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING milestone_id`,
    [req.params.id, parsed.data.title, parsed.data.due_date || null, parsed.data.status, parsed.data.shared_with_partners, req.user.sub],
  )
  await query('UPDATE projects_programs SET updated_at = now() WHERE project_id = $1', [req.params.id])
  return res.status(201).json({ data: rows[0] })
}

export async function updateMilestone(req, res) {
  const project = uuid.safeParse(req.params.id).success && (await loadProject(req.params.id))
  if (!project) return fail(res, 404, 'Project not found.')
  if (!(await permissions(req.user, project)).member) return fail(res, 403, 'Only project members can update milestones.')
  const parsed = milestoneUpdateSchema.safeParse(req.body || {})
  if (!parsed.success || !Object.keys(parsed.data).length) return fail(res, 400, 'Nothing to update.')
  const columns = Object.keys(parsed.data)
  const { rowCount } = await query(
    `UPDATE project_milestones SET ${columns.map((column, index) => `${column} = $${index + 3}`).join(', ')}, updated_at = now()
     WHERE milestone_id = $1 AND project_id = $2`,
    [req.params.milestoneId, req.params.id, ...columns.map((column) => parsed.data[column] ?? null)],
  )
  if (!rowCount) return fail(res, 404, 'Milestone not found.')
  await query('UPDATE projects_programs SET updated_at = now() WHERE project_id = $1', [req.params.id])
  return res.json({ message: 'Milestone updated.' })
}

/**
 * Extranet (ROLE_CLIENT_PARTNER): projects the user's organisation is linked to,
 * with only the milestones marked as shared. Budgets and internal data are never exposed.
 */
export async function sharedProjects(req, res) {
  if (!isExternal(req.user.role) || !req.user.org_id) return res.json({ data: [] })
  const { rows } = await query(
    `SELECT p.project_id, p.title, p.phase, p.corridor, p.start_date, p.end_date, o.legal_name AS lead_entity_name,
            COALESCE((
              SELECT json_agg(json_build_object('milestone_id', m.milestone_id, 'title', m.title, 'due_date', m.due_date, 'status', m.status)
                              ORDER BY m.due_date NULLS LAST, m.created_at)
              FROM project_milestones m WHERE m.project_id = p.project_id AND m.shared_with_partners
            ), '[]'::json) AS milestones
     FROM projects_programs p
     JOIN project_partners pp ON pp.project_id = p.project_id
     JOIN organizations o ON o.org_id = p.lead_entity
     WHERE pp.org_id = $1
     ORDER BY p.updated_at DESC`,
    [req.user.org_id],
  )
  return res.json({ data: rows })
}
