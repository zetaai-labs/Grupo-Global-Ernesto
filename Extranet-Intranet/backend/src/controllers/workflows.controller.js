import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { withRegion } from '../services/scope.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { APPROVER_ROLES, STAFF_ROLES } from '../config/roles.js'


/** Ready-made approval chains. Each step is approved by a role (any active user with it). */
export const TEMPLATES = {
  purchase: { name: 'Purchase request', steps: [{ approver_role: 'manager' }, { approver_role: 'admin' }] },
  leave: { name: 'Leave request', steps: [{ approver_role: 'manager' }] },
  document: { name: 'Document approval', steps: [{ approver_role: 'manager' }] },
  onboarding: { name: 'Employee onboarding', steps: [{ approver_role: 'hr' }, { approver_role: 'manager' }] },
}

const stepSchema = z
  .object({
    approver_id: z.coerce.number().int().positive().optional().nullable(),
    approver_role: z.enum(APPROVER_ROLES).optional().nullable(),
  })
  .refine((step) => step.approver_id || step.approver_role, 'Each step needs an approver or a role.')

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  template: z.enum(Object.keys(TEMPLATES)).optional().nullable(),
  steps: z.array(stepSchema).min(1).max(5).optional(),
  assigned_to: z.coerce.number().int().positive().optional().nullable(),
  approver_id: z.coerce.number().int().positive().optional().nullable(),
  due_at: z.string().trim().min(1).optional().nullable(),
})

const updateSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'completed']),
  note: z.string().trim().max(1000).optional(),
})

const SELECT = `
  SELECT w.id, w.title, w.description, w.status, w.region, w.due_at, w.created_at, w.template,
         w.current_step, w.decided_at, w.decision_note, w.created_by, w.assigned_to, w.approver_id,
         owner.name AS owner, assignee.name AS assignee, decider.name AS decided_by,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'order', s.step_order, 'status', s.status,
                    'approver_id', s.approver_id, 'approver_role', s.approver_role,
                    'approver', au.name, 'decided_by', du.name, 'decided_at', s.decided_at, 'note', s.note
                  ) ORDER BY s.step_order)
           FROM workflow_steps s
           LEFT JOIN users au ON au.id = s.approver_id
           LEFT JOIN users du ON du.id = s.decided_by
           WHERE s.workflow_id = w.id
         ), '[]'::json) AS steps
  FROM workflows w
  LEFT JOIN users owner ON owner.id = w.created_by
  LEFT JOIN users assignee ON assignee.id = w.assigned_to
  LEFT JOIN users decider ON decider.id = w.decided_by
`

function stepLabel(step) {
  return step.approver || (step.approver_role ? `any ${step.approver_role}` : 'approver')
}

function canDecideStep(user, workflow, step) {
  if (!step || step.status !== 'pending') return false
  if (user.role === 'admin') return true
  if (workflow.created_by === user.sub) return false // no self-approval
  if (step.approver_id) return step.approver_id === user.sub
  return step.approver_role === user.role
}

/** Adds `can_decide` / `can_complete` flags so the UI only shows valid buttons. */
function withPermissions(user, workflow) {
  const step = workflow.steps.find((item) => item.order === workflow.current_step)
  return {
    ...workflow,
    can_decide: workflow.status === 'pending' && canDecideStep(user, workflow, step),
    can_complete:
      workflow.status === 'approved' &&
      (user.role === 'admin' || workflow.assigned_to === user.sub || workflow.created_by === user.sub),
  }
}

async function notifyStepApprovers(step, payload, excludeUserId) {
  if (step.approver_id) return notify([step.approver_id], payload)
  return notifyRoles([step.approver_role], payload, excludeUserId)
}

export async function listTemplates(_req, res) {
  return res.json({
    data: Object.entries(TEMPLATES).map(([key, template]) => ({
      key,
      name: template.name,
      steps: template.steps.map((step) => step.approver_role),
    })),
  })
}

export async function listWorkflows(req, res) {
  const params = []
  let base = 'WHERE 1=1'
  if (req.query.mine === 'true') {
    params.push(req.user.sub)
    base += ` AND (w.created_by = $1 OR w.assigned_to = $1
              OR EXISTS (SELECT 1 FROM workflow_steps s WHERE s.workflow_id = w.id AND s.approver_id = $1))`
  }
  const scoped = withRegion(req, base, params, 'w')
  const { rows } = await query(`${SELECT} ${scoped.sql} ORDER BY w.id DESC LIMIT 500`, scoped.params)
  return res.json({ data: rows.map((row) => withPermissions(req.user, row)) })
}

async function activeUserExists(id) {
  const { rowCount } = await query("SELECT 1 FROM users WHERE id = $1 AND status = 'active'", [id])
  return rowCount > 0
}

export async function createWorkflow(req, res) {
  const parsed = createSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ message: 'A title and valid approval steps are required.' })
  const { title, description, template, assigned_to, approver_id, due_at } = parsed.data

  // Chain precedence: explicit steps > template > single approver > any manager.
  const steps =
    parsed.data.steps ||
    (template && TEMPLATES[template].steps) ||
    (approver_id ? [{ approver_id }] : [{ approver_role: 'manager' }])

  for (const id of [assigned_to, ...steps.map((step) => step.approver_id)]) {
    if (id && !(await activeUserExists(id))) {
      return res.status(400).json({ message: 'Assignee or approver is not an active user.' })
    }
  }
  if (steps.some((step) => step.approver_id === req.user.sub)) {
    return res.status(400).json({ message: 'You cannot be an approver of your own request.' })
  }
  if (due_at && Number.isNaN(Date.parse(due_at))) {
    return res.status(400).json({ message: 'Invalid due date.' })
  }

  const workflow = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO workflows (title, description, status, created_by, assigned_to, approver_id, due_at, region, template, current_step)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, 1)
       RETURNING id, title, description, status, assigned_to, due_at, region, template, created_at`,
      [title, description || null, req.user.sub, assigned_to || null, steps[0].approver_id || null, due_at || null, req.user.region, template || null],
    )
    for (const [index, step] of steps.entries()) {
      await client.query(
        `INSERT INTO workflow_steps (workflow_id, step_order, approver_id, approver_role)
         VALUES ($1, $2, $3, $4)`,
        [rows[0].id, index + 1, step.approver_id || null, step.approver_id ? null : step.approver_role],
      )
    }
    return rows[0]
  })

  await writeAudit(req.user.sub, 'WORKFLOW_CREATED', 'workflows', workflow.id, { steps: steps.length, template })

  await notifyStepApprovers(
    steps[0],
    { type: 'workflow', title: `Approval needed: ${title}`, body: `Requested by ${req.user.name} · step 1 of ${steps.length}`, link: '/intranet/autoflow' },
    req.user.sub,
  )
  if (assigned_to && assigned_to !== req.user.sub) {
    await notify([assigned_to], { type: 'workflow', title: `Task assigned to you: ${title}`, body: `From ${req.user.name}`, link: '/intranet/autoflow' })
  }
  return res.status(201).json({ data: workflow })
}

async function loadWorkflow(req) {
  const scoped = withRegion(req, `${SELECT} WHERE w.id = $1`, [req.params.id], 'w')
  const { rows } = await query(scoped.sql, scoped.params)
  return rows[0]
}

export async function updateWorkflow(req, res) {
  const parsed = updateSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ message: 'Invalid workflow status.' })
  const { status, note } = parsed.data

  const workflow = await loadWorkflow(req)
  if (!workflow) return res.status(404).json({ message: 'Workflow not found.' })

  // Completing an approved workflow.
  if (status === 'completed') {
    if (workflow.status !== 'approved') {
      return res.status(409).json({ message: `A ${workflow.status} workflow cannot be moved to completed.` })
    }
    if (!withPermissions(req.user, workflow).can_complete) {
      return res.status(403).json({ message: 'You are not allowed to complete this workflow.' })
    }
    await query("UPDATE workflows SET status = 'completed', completed_at = now() WHERE id = $1", [workflow.id])
    await notify([workflow.created_by, workflow.assigned_to].filter((id) => id && id !== req.user.sub), {
      type: 'workflow', title: `${workflow.title} — completed`, body: `Completed by ${req.user.name}`, link: '/intranet/autoflow',
    })
    await writeAudit(req.user.sub, 'WORKFLOW_STATUS_CHANGED', 'workflows', workflow.id, { from: 'approved', to: 'completed' })
    return res.json({ message: 'Workflow completed.' })
  }

  // Approving or rejecting the current step.
  if (!['approved', 'rejected'].includes(status) || workflow.status !== 'pending') {
    return res.status(409).json({ message: `A ${workflow.status} workflow cannot be moved to ${status}.` })
  }
  const step = workflow.steps.find((item) => item.order === workflow.current_step)
  if (!canDecideStep(req.user, workflow, step)) {
    return res.status(403).json({ message: 'You are not allowed to make this decision.' })
  }

  const nextStep = workflow.steps.find((item) => item.order === workflow.current_step + 1)
  const finished = status === 'rejected' || !nextStep
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE workflow_steps SET status = $1, decided_by = $2, decided_at = now(), note = $3
       WHERE workflow_id = $4 AND step_order = $5`,
      [status, req.user.sub, note || null, workflow.id, step.order],
    )
    if (finished) {
      await client.query(
        `UPDATE workflows SET status = $1, decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $4`,
        [status, req.user.sub, note || null, workflow.id],
      )
    } else {
      await client.query(
        'UPDATE workflows SET current_step = $1, approver_id = $2, last_reminded_at = NULL WHERE id = $3',
        [nextStep.order, nextStep.approver_id || null, workflow.id],
      )
    }
  })

  const total = workflow.steps.length
  if (finished) {
    await notify([workflow.created_by, workflow.assigned_to].filter((id) => id && id !== req.user.sub), {
      type: 'workflow',
      title: `${workflow.title} — ${status}`,
      body: note ? `${req.user.name}: ${note}` : `Decided by ${req.user.name}`,
      link: '/intranet/autoflow',
    })
  } else {
    await notifyStepApprovers(
      nextStep,
      { type: 'workflow', title: `Approval needed: ${workflow.title}`, body: `Step ${nextStep.order} of ${total} · approved so far by ${req.user.name}`, link: '/intranet/autoflow' },
      workflow.created_by,
    )
    await notify([workflow.created_by].filter((id) => id !== req.user.sub), {
      type: 'workflow',
      title: `${workflow.title} — step ${step.order} of ${total} approved`,
      body: `Now waiting for ${stepLabel(nextStep)}`,
      link: '/intranet/autoflow',
    })
  }

  await writeAudit(req.user.sub, 'WORKFLOW_STEP_DECIDED', 'workflows', workflow.id, { step: step.order, status, note })
  return res.json({ message: finished ? `Workflow ${status}.` : `Step ${step.order} approved — sent to the next approver.` })
}

/** Reminds current approvers about requests that are due within a day or overdue (once per day). */
export async function sendWorkflowReminders() {
  const { rows } = await query(
    `SELECT w.id, w.title, w.due_at, w.created_by, s.approver_id, s.approver_role, s.step_order
     FROM workflows w
     JOIN workflow_steps s ON s.workflow_id = w.id AND s.step_order = w.current_step
     WHERE w.status = 'pending' AND w.due_at IS NOT NULL
       AND w.due_at < now() + interval '1 day'
       AND (w.last_reminded_at IS NULL OR w.last_reminded_at < now() - interval '1 day')`,
  )
  for (const row of rows) {
    const overdue = new Date(row.due_at) < new Date()
    await notifyStepApprovers(
      row,
      {
        type: 'workflow',
        title: `${overdue ? 'Overdue' : 'Due soon'}: ${row.title}`,
        body: `Waiting for your approval · due ${new Date(row.due_at).toLocaleDateString()}`,
        link: '/intranet/autoflow',
      },
      row.created_by,
    )
    await query('UPDATE workflows SET last_reminded_at = now() WHERE id = $1', [row.id])
  }
  return rows.length
}

/** Active staff that can be picked as approver or assignee (names and roles only). */
export async function listPeople(_req, res) {
  const { rows } = await query(
    `SELECT u.id, u.name, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.status = 'active' AND r.name = ANY($1::text[])
     ORDER BY u.name`,
    [STAFF_ROLES],
  )
  return res.json({ data: rows })
}
