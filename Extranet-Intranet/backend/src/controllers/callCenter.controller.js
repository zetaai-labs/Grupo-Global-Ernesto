import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { STAFF_ROLES } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { notifyRoles } from '../services/notification.service.js'

/**
 * Call center (client, 26 Nov 2026): the joint Grupo Global / Zeta call center works from the platform.
 * Supervisors create campaigns (who to call, the script) and add agents; agents press "Next call", phone
 * the contact, and record the outcome. Callbacks come back to the same agent; "do not call" is final.
 * Calls are dialled from the agent's own phone for now (a telephony provider can be plugged in later).
 */

export const CC_SUPERVISORS = ['admin', 'tech_admin', 'manager']
const REGIONS = ['GLOBAL', 'SPAIN_EU', 'INDIA', 'UAE_DUBAI', 'LATAM', 'USA_CAN', 'MOROCCO']
const OUTCOMES = ['INTERESTED', 'SALE', 'RESOLVED', 'CALLBACK', 'NO_ANSWER', 'VOICEMAIL', 'NOT_INTERESTED', 'WRONG_NUMBER', 'DO_NOT_CALL']
const POSITIVE = ['INTERESTED', 'SALE']
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 20
const fail = (status, message) => Object.assign(new Error(message), { status })
const isId = (value) => z.string().uuid().safeParse(value).success
const parse = (schema, body) => {
  const result = schema.safeParse(body || {})
  if (!result.success) throw fail(400, result.error.issues[0]?.message || 'Invalid data.')
  return result.data
}
const isSupervisor = (req) => CC_SUPERVISORS.includes(req.user.role)
const requireSupervisor = (req) => { if (!isSupervisor(req)) throw fail(403, 'Only call center supervisors can do this.') }
// Phone numbers are compared by their digits only, so "+91 98-765" and "9198765" are the same person.
const phoneKey = (phone) => String(phone || '').replace(/\D/g, '')

async function agentOf(userId) {
  const { rows } = await query('SELECT * FROM cc_agents WHERE user_id = $1 AND active', [userId])
  return rows[0] || null
}
async function requireAgent(req) {
  const agent = await agentOf(req.user.sub)
  if (!agent) throw fail(403, 'You are not set up as a call center agent. Ask a supervisor to add you.')
  return agent
}

// ---------------------------------------------------------------- agent desk

/** The signed-in person's desk: agent profile, today's numbers, callbacks and campaigns they can work. */
export async function myDesk(req, res) {
  const agent = await agentOf(req.user.sub)
  if (!agent) return res.json({ data: { agent: null, supervisor: isSupervisor(req) } })
  const [today, callbacks, campaigns, current] = await Promise.all([
    query(
      `SELECT count(*)::int AS calls, COALESCE(sum(duration_sec), 0)::int AS talk_sec,
              count(*) FILTER (WHERE outcome = ANY($2))::int AS positive
       FROM cc_calls WHERE agent_id = $1 AND created_at >= date_trunc('day', now())`,
      [req.user.sub, POSITIVE],
    ),
    query(
      `SELECT c.contact_id, c.name, c.company, c.phone, c.next_call_at, k.name AS campaign
       FROM cc_contacts c JOIN cc_campaigns k ON k.campaign_id = c.campaign_id
       WHERE c.status = 'CALLBACK' AND c.callback_for = $1 ORDER BY c.next_call_at LIMIT 50`,
      [req.user.sub],
    ),
    query(
      `SELECT k.campaign_id, k.name, k.purpose, k.direction, k.region,
              count(c.contact_id) FILTER (WHERE c.status = 'NEW' AND (c.next_call_at IS NULL OR c.next_call_at <= now()))::int AS ready
       FROM cc_campaigns k LEFT JOIN cc_contacts c ON c.campaign_id = k.campaign_id
       WHERE k.status = 'ACTIVE' AND (k.region = 'GLOBAL' OR k.region = $1 OR $1 = 'GLOBAL')
       GROUP BY k.campaign_id ORDER BY k.direction, k.name`,
      [agent.region],
    ),
    query('SELECT contact_id FROM cc_contacts WHERE locked_by = $1 AND locked_until > now() LIMIT 1', [req.user.sub]),
  ])
  return res.json({
    data: {
      agent, supervisor: isSupervisor(req), today: today.rows[0], callbacks: callbacks.rows, campaigns: campaigns.rows,
      current_contact_id: current.rows[0]?.contact_id || null, outcomes: OUTCOMES,
    },
  })
}

export async function setMyStatus(req, res) {
  await requireAgent(req)
  const { status } = parse(z.object({ status: z.enum(['AVAILABLE', 'BREAK', 'OFFLINE']) }), req.body)
  await query('UPDATE cc_agents SET status = $2, status_since = now() WHERE user_id = $1', [req.user.sub, status])
  if (status === 'OFFLINE') await query('UPDATE cc_contacts SET locked_by = NULL, locked_until = NULL WHERE locked_by = $1', [req.user.sub])
  return res.json({ data: { status } })
}

/** Everything the agent needs on screen for one contact: details, script and earlier calls. */
async function contactCard(contactId) {
  const { rows } = await query(
    `SELECT c.*, k.name AS campaign, k.script, k.purpose, k.direction, o.legal_name AS organisation, o.verification_status
     FROM cc_contacts c JOIN cc_campaigns k ON k.campaign_id = c.campaign_id
     LEFT JOIN organizations o ON o.org_id = c.org_id WHERE c.contact_id = $1`,
    [contactId],
  )
  if (!rows[0]) return null
  const history = await query(
    `SELECT cl.outcome, cl.notes, cl.duration_sec, cl.created_at, cl.callback_at, u.name AS agent
     FROM cc_calls cl LEFT JOIN users u ON u.id = cl.agent_id WHERE cl.contact_id = $1 ORDER BY cl.created_at DESC LIMIT 20`,
    [contactId],
  )
  return { ...rows[0], history: history.rows }
}

/**
 * Gives the agent the next person to call and reserves them for 20 minutes. Order: the agent's own
 * unfinished contact, their due callbacks, callbacks left overdue by others, then new contacts.
 * Rows are locked with SKIP LOCKED, so two agents pressing at once never get the same person.
 */
export async function nextContact(req, res) {
  const agent = await requireAgent(req)
  const campaignId = req.body?.campaign_id && isId(req.body.campaign_id) ? req.body.campaign_id : null
  const picked = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT c.contact_id FROM cc_contacts c JOIN cc_campaigns k ON k.campaign_id = c.campaign_id
       WHERE k.status = 'ACTIVE' AND k.direction = 'OUTBOUND'
         AND ($2::uuid IS NULL OR k.campaign_id = $2)
         AND (k.region = 'GLOBAL' OR k.region = $3 OR $3 = 'GLOBAL')
         AND (c.locked_until IS NULL OR c.locked_until < now() OR c.locked_by = $1)
         AND (
           (c.locked_by = $1 AND c.locked_until > now())
           OR (c.status = 'CALLBACK' AND c.callback_for = $1 AND c.next_call_at <= now() + interval '5 minutes')
           OR (c.status = 'CALLBACK' AND (c.callback_for IS NULL OR c.next_call_at <= now() - interval '30 minutes') AND c.next_call_at <= now())
           OR (c.status = 'NEW' AND (c.next_call_at IS NULL OR c.next_call_at <= now()))
         )
       ORDER BY COALESCE(c.locked_by = $1 AND c.locked_until > now(), false) DESC, (c.status = 'CALLBACK') DESC, c.next_call_at NULLS FIRST, c.created_at
       LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
      [req.user.sub, campaignId, agent.region],
    )
    if (!rows[0]) return null
    await client.query(
      `UPDATE cc_contacts SET locked_by = $2, locked_until = now() + make_interval(mins => $3), updated_at = now() WHERE contact_id = $1`,
      [rows[0].contact_id, req.user.sub, LOCK_MINUTES],
    )
    await client.query(`UPDATE cc_agents SET status = 'ON_CALL', status_since = now() WHERE user_id = $1`, [req.user.sub])
    return rows[0].contact_id
  })
  if (!picked) return res.json({ data: null, message: 'Nobody to call right now. New contacts and callbacks will appear here.' })
  return res.json({ data: await contactCard(picked) })
}

export async function openContact(req, res) {
  await requireAgent(req)
  if (!isId(req.params.id)) throw fail(400, 'Invalid id.')
  const card = await contactCard(req.params.id)
  if (!card) throw fail(404, 'Contact not found.')
  if (!isSupervisor(req) && card.locked_by !== req.user.sub && card.callback_for !== req.user.sub) throw fail(403, 'This contact is being handled by another agent.')
  return res.json({ data: card })
}

const callSchema = z.object({
  outcome: z.enum(OUTCOMES),
  notes: z.string().trim().max(4000).optional().nullable(),
  duration_sec: z.coerce.number().int().min(0).max(14400).default(0),
  callback_at: z.string().datetime({ offset: true }).optional().nullable(),
})

/** How each outcome moves the contact on: finished, back in the queue later, a callback, or never again. */
function nextState(outcome, attempts, callbackAt) {
  if (outcome === 'CALLBACK') return { status: 'CALLBACK', next: callbackAt }
  if (outcome === 'DO_NOT_CALL') return { status: 'DO_NOT_CALL', next: null }
  if (outcome === 'NO_ANSWER' || outcome === 'VOICEMAIL') {
    if (attempts + 1 >= MAX_ATTEMPTS) return { status: 'DONE', next: null }
    return { status: 'NEW', next: new Date(Date.now() + (outcome === 'NO_ANSWER' ? 2 : 4) * 3600 * 1000).toISOString() }
  }
  return { status: 'DONE', next: null }
}

function checkCallback(d) {
  if (d.outcome !== 'CALLBACK') return null
  const when = Date.parse(d.callback_at || '')
  if (!when || when < Date.now() - 60 * 1000 || when > Date.now() + 90 * 24 * 3600 * 1000) throw fail(400, 'Choose when to call back (within the next 90 days).')
  return new Date(when).toISOString()
}

async function afterCall(req, contact, outcome) {
  if (POSITIVE.includes(outcome)) {
    await notifyRoles(CC_SUPERVISORS, {
      type: 'crm', title: `${outcome === 'SALE' ? 'Sale' : 'Interested contact'}: ${contact.company || contact.name}`,
      body: `${req.user.name} · ${contact.campaign || ''}`.trim(), link: '/intranet/call-center',
    }, req.user.sub)
  }
}

/** Records the call the agent just made and frees them for the next one. */
export async function recordCall(req, res) {
  await requireAgent(req)
  if (!isId(req.params.id)) throw fail(400, 'Invalid id.')
  const d = parse(callSchema, req.body)
  const callbackAt = checkCallback(d)
  const contact = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT c.*, k.direction, k.name AS campaign FROM cc_contacts c JOIN cc_campaigns k ON k.campaign_id = c.campaign_id
       WHERE c.contact_id = $1 FOR UPDATE OF c`,
      [req.params.id],
    )
    const row = rows[0]
    if (!row) throw fail(404, 'Contact not found.')
    if (row.locked_by !== req.user.sub && row.callback_for !== req.user.sub) throw fail(409, 'Press “Next call” first: this contact is not assigned to you.')
    if (row.status === 'DO_NOT_CALL') throw fail(409, 'This person asked not to be called.')
    const state = nextState(d.outcome, row.attempts, callbackAt)
    await client.query(
      `INSERT INTO cc_calls (contact_id, campaign_id, agent_id, direction, outcome, duration_sec, notes, callback_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.contact_id, row.campaign_id, req.user.sub, row.direction, d.outcome, d.duration_sec, d.notes || null, callbackAt],
    )
    await client.query(
      `UPDATE cc_contacts SET status = $2, next_call_at = $3, attempts = attempts + 1, last_outcome = $4,
              callback_for = CASE WHEN $2 = 'CALLBACK' THEN $5::int ELSE NULL END,
              locked_by = NULL, locked_until = NULL, updated_at = now()
       WHERE contact_id = $1`,
      [row.contact_id, state.status, state.next, d.outcome, req.user.sub],
    )
    await client.query(`UPDATE cc_agents SET status = 'AVAILABLE', status_since = now() WHERE user_id = $1 AND status = 'ON_CALL'`, [req.user.sub])
    return row
  })
  await afterCall(req, contact, d.outcome)
  return res.status(201).json({ message: 'Call saved.' })
}

/** Gives the contact back to the queue without recording a call (for example, the agent was interrupted). */
export async function releaseContact(req, res) {
  await requireAgent(req)
  if (!isId(req.params.id)) throw fail(400, 'Invalid id.')
  await query('UPDATE cc_contacts SET locked_by = NULL, locked_until = NULL WHERE contact_id = $1 AND locked_by = $2', [req.params.id, req.user.sub])
  await query(`UPDATE cc_agents SET status = 'AVAILABLE', status_since = now() WHERE user_id = $1 AND status = 'ON_CALL'`, [req.user.sub])
  return res.json({ message: 'Contact returned to the queue.' })
}

const inboundSchema = callSchema.extend({
  campaign_id: z.string().uuid(),
  name: z.string().trim().min(2).max(150),
  company: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal('')),
  country: z.string().trim().max(3).optional().nullable(),
})

/** Somebody called in: find them by phone in that campaign (or add them) and record the call. */
export async function logInbound(req, res) {
  await requireAgent(req)
  const d = parse(inboundSchema, req.body)
  const callbackAt = checkCallback(d)
  const contact = await withTransaction(async (client) => {
    const campaign = (await client.query(`SELECT * FROM cc_campaigns WHERE campaign_id = $1 AND status = 'ACTIVE'`, [d.campaign_id])).rows[0]
    if (!campaign) throw fail(404, 'Campaign not found or not active.')
    const key = phoneKey(d.phone)
    let row = key
      ? (await client.query(`SELECT * FROM cc_contacts WHERE campaign_id = $1 AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2 LIMIT 1 FOR UPDATE`, [d.campaign_id, key])).rows[0]
      : null
    if (!row) {
      row = (await client.query(
        `INSERT INTO cc_contacts (campaign_id, name, company, phone, email, country) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [d.campaign_id, d.name, d.company || null, d.phone || null, d.email || null, d.country ? d.country.toUpperCase() : null],
      )).rows[0]
    }
    const state = nextState(d.outcome, row.attempts, callbackAt)
    await client.query(
      `INSERT INTO cc_calls (contact_id, campaign_id, agent_id, direction, outcome, duration_sec, notes, callback_at)
       VALUES ($1, $2, $3, 'INBOUND', $4, $5, $6, $7)`,
      [row.contact_id, d.campaign_id, req.user.sub, d.outcome, d.duration_sec, d.notes || null, callbackAt],
    )
    await client.query(
      `UPDATE cc_contacts SET status = $2, next_call_at = $3, attempts = attempts + 1, last_outcome = $4,
              callback_for = CASE WHEN $2 = 'CALLBACK' THEN $5::int ELSE NULL END, updated_at = now() WHERE contact_id = $1`,
      [row.contact_id, state.status, state.next, d.outcome, req.user.sub],
    )
    return { ...row, campaign: campaign.name }
  })
  await afterCall(req, contact, d.outcome)
  return res.status(201).json({ message: 'Call saved.' })
}

// ---------------------------------------------------------------- supervisors

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(150),
  purpose: z.enum(['MEMBERSHIP_SALES', 'MEMBER_SUPPORT', 'RECRUITMENT', 'SURVEY', 'OTHER']).default('OTHER'),
  direction: z.enum(['OUTBOUND', 'INBOUND']).default('OUTBOUND'),
  region: z.enum(REGIONS).default('GLOBAL'),
  script: z.string().max(8000).default(''),
  status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']).default('ACTIVE'),
})

export async function listCampaigns(req, res) {
  requireSupervisor(req)
  const { rows } = await query(
    `SELECT k.*,
            count(c.contact_id)::int AS contacts,
            count(c.contact_id) FILTER (WHERE c.status = 'NEW')::int AS to_call,
            count(c.contact_id) FILTER (WHERE c.status = 'CALLBACK')::int AS callbacks,
            count(c.contact_id) FILTER (WHERE c.status = 'DONE')::int AS done,
            count(c.contact_id) FILTER (WHERE c.status = 'DO_NOT_CALL')::int AS do_not_call,
            (SELECT count(*)::int FROM cc_calls cl WHERE cl.campaign_id = k.campaign_id) AS calls,
            (SELECT count(*)::int FROM cc_calls cl WHERE cl.campaign_id = k.campaign_id AND cl.outcome = ANY($1)) AS positive
     FROM cc_campaigns k LEFT JOIN cc_contacts c ON c.campaign_id = k.campaign_id
     GROUP BY k.campaign_id ORDER BY k.status = 'CLOSED', k.created_at DESC`,
    [POSITIVE],
  )
  return res.json({ data: rows })
}

export async function createCampaign(req, res) {
  requireSupervisor(req)
  const d = parse(campaignSchema, req.body)
  const { rows } = await query(
    `INSERT INTO cc_campaigns (name, purpose, direction, region, script, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [d.name, d.purpose, d.direction, d.region, d.script, d.status, req.user.sub],
  )
  await writeAudit(req.user.sub, 'CALL_CENTER_CAMPAIGN_CREATED', 'cc_campaigns', rows[0].campaign_id, { name: d.name, region: d.region })
  return res.status(201).json({ data: rows[0] })
}

export async function updateCampaign(req, res) {
  requireSupervisor(req)
  if (!isId(req.params.id)) throw fail(400, 'Invalid id.')
  const d = parse(campaignSchema.partial(), req.body)
  const keys = Object.keys(d).filter((key) => d[key] !== undefined)
  if (!keys.length) throw fail(400, 'Nothing to update.')
  const { rows } = await query(
    `UPDATE cc_campaigns SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = now() WHERE campaign_id = $1 RETURNING *`,
    [req.params.id, ...keys.map((key) => d[key])],
  )
  if (!rows[0]) throw fail(404, 'Campaign not found.')
  await writeAudit(req.user.sub, 'CALL_CENTER_CAMPAIGN_UPDATED', 'cc_campaigns', req.params.id, { fields: keys })
  return res.json({ data: rows[0] })
}

const contactRow = z.object({
  name: z.string().trim().min(2).max(150),
  company: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(255).optional().nullable(),
  country: z.string().trim().max(3).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
})

/**
 * Adds contacts to a campaign (up to 5,000 at a time). Rows without a phone or e-mail, numbers already in
 * the campaign, and anyone who asked not to be called (in any campaign) are skipped and counted.
 */
export async function importContacts(req, res) {
  requireSupervisor(req)
  if (!isId(req.params.id)) throw fail(400, 'Invalid id.')
  const rows = Array.isArray(req.body?.contacts) ? req.body.contacts.slice(0, 5000) : []
  if (!rows.length) throw fail(400, 'Add at least one contact.')
  const campaign = (await query('SELECT campaign_id FROM cc_campaigns WHERE campaign_id = $1', [req.params.id])).rows[0]
  if (!campaign) throw fail(404, 'Campaign not found.')
  const [existing, blocked] = await Promise.all([
    query(`SELECT regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') AS key FROM cc_contacts WHERE campaign_id = $1`, [req.params.id]),
    query(`SELECT DISTINCT regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') AS key FROM cc_contacts WHERE status = 'DO_NOT_CALL'`),
  ])
  const seen = new Set(existing.rows.map((row) => row.key).filter(Boolean))
  const doNotCall = new Set(blocked.rows.map((row) => row.key).filter(Boolean))
  const summary = { added: 0, duplicates: 0, do_not_call: 0, invalid: 0 }
  const valid = []
  for (const raw of rows) {
    const parsed = contactRow.safeParse(raw)
    if (!parsed.success || (!parsed.data.phone && !parsed.data.email)) { summary.invalid += 1; continue }
    const key = phoneKey(parsed.data.phone)
    if (key && doNotCall.has(key)) { summary.do_not_call += 1; continue }
    if (key && seen.has(key)) { summary.duplicates += 1; continue }
    if (key) seen.add(key)
    valid.push(parsed.data)
  }
  await withTransaction(async (client) => {
    for (const row of valid) {
      await client.query(
        `INSERT INTO cc_contacts (campaign_id, name, company, phone, email, country, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.params.id, row.name, row.company || null, row.phone || null, row.email || null, row.country ? row.country.toUpperCase().slice(0, 3) : null, row.notes || null],
      )
      summary.added += 1
    }
  })
  await writeAudit(req.user.sub, 'CALL_CENTER_CONTACTS_IMPORTED', 'cc_campaigns', req.params.id, summary)
  return res.status(201).json({ data: summary })
}

export async function listAgents(req, res) {
  requireSupervisor(req)
  const [agents, staff] = await Promise.all([
    query(
      `SELECT a.*, u.name, u.email, r.name AS role FROM cc_agents a JOIN users u ON u.id = a.user_id JOIN roles r ON r.id = u.role_id
       ORDER BY a.active DESC, u.name`,
    ),
    query(
      `SELECT u.id, u.name, u.email FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.status = 'active' AND r.name = ANY($1) AND NOT EXISTS (SELECT 1 FROM cc_agents a WHERE a.user_id = u.id)
       ORDER BY u.name LIMIT 500`,
      [STAFF_ROLES],
    ),
  ])
  return res.json({ data: { agents: agents.rows, available_staff: staff.rows, regions: REGIONS } })
}

const agentSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  team: z.string().trim().min(1).max(80).default('General'),
  region: z.enum(REGIONS).default('GLOBAL'),
})

export async function addAgent(req, res) {
  requireSupervisor(req)
  const d = parse(agentSchema, req.body)
  const staff = await query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.status = 'active' AND r.name = ANY($2)`,
    [d.user_id, STAFF_ROLES],
  )
  if (!staff.rowCount) throw fail(400, 'Only active staff can be call center agents.')
  await query(
    `INSERT INTO cc_agents (user_id, team, region, added_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET team = EXCLUDED.team, region = EXCLUDED.region, active = true`,
    [d.user_id, d.team, d.region, req.user.sub],
  )
  await writeAudit(req.user.sub, 'CALL_CENTER_AGENT_ADDED', 'cc_agents', String(d.user_id), { team: d.team, region: d.region })
  return res.status(201).json({ message: 'Agent added.' })
}

export async function updateAgent(req, res) {
  requireSupervisor(req)
  const id = Number(req.params.userId)
  if (!Number.isInteger(id) || id <= 0) throw fail(400, 'Invalid id.')
  const d = parse(z.object({ team: z.string().trim().min(1).max(80), region: z.enum(REGIONS), active: z.boolean() }).partial(), req.body)
  const keys = Object.keys(d).filter((key) => d[key] !== undefined)
  if (!keys.length) throw fail(400, 'Nothing to update.')
  const { rowCount } = await query(
    `UPDATE cc_agents SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}${d.active === false ? ", status = 'OFFLINE', status_since = now()" : ''} WHERE user_id = $1`,
    [id, ...keys.map((key) => d[key])],
  )
  if (!rowCount) throw fail(404, 'Agent not found.')
  if (d.active === false) await query('UPDATE cc_contacts SET locked_by = NULL, locked_until = NULL WHERE locked_by = $1', [id])
  await writeAudit(req.user.sub, 'CALL_CENTER_AGENT_UPDATED', 'cc_agents', String(id), d)
  return res.json({ message: 'Agent updated.' })
}

/** The live board: every agent's status and today's numbers, totals by outcome and by region. */
export async function liveBoard(req, res) {
  requireSupervisor(req)
  const [agents, outcomes, regions] = await Promise.all([
    query(
      `SELECT a.user_id, u.name, a.team, a.region, a.status, a.status_since,
              (SELECT c.name FROM cc_contacts c WHERE c.locked_by = a.user_id AND c.locked_until > now() LIMIT 1) AS current_contact,
              count(cl.call_id)::int AS calls, COALESCE(sum(cl.duration_sec), 0)::int AS talk_sec,
              count(cl.call_id) FILTER (WHERE cl.outcome = ANY($1))::int AS positive
       FROM cc_agents a JOIN users u ON u.id = a.user_id
       LEFT JOIN cc_calls cl ON cl.agent_id = a.user_id AND cl.created_at >= date_trunc('day', now())
       WHERE a.active GROUP BY a.user_id, u.name ORDER BY a.status = 'OFFLINE', u.name`,
      [POSITIVE],
    ),
    query(`SELECT outcome, count(*)::int AS total FROM cc_calls WHERE created_at >= date_trunc('day', now()) GROUP BY outcome ORDER BY total DESC`),
    query(
      `SELECT a.region, count(cl.call_id)::int AS calls, count(cl.call_id) FILTER (WHERE cl.outcome = ANY($1))::int AS positive
       FROM cc_calls cl JOIN cc_agents a ON a.user_id = cl.agent_id
       WHERE cl.created_at >= date_trunc('day', now()) GROUP BY a.region ORDER BY calls DESC`,
      [POSITIVE],
    ),
  ])
  const calls = agents.rows.reduce((sum, row) => sum + row.calls, 0)
  const positive = agents.rows.reduce((sum, row) => sum + row.positive, 0)
  return res.json({
    data: {
      agents: agents.rows,
      outcomes: outcomes.rows,
      regions: regions.rows,
      totals: {
        calls, positive, conversion_pct: calls ? Math.round((positive / calls) * 100) : 0,
        talk_sec: agents.rows.reduce((sum, row) => sum + row.talk_sec, 0),
        available: agents.rows.filter((row) => row.status === 'AVAILABLE').length,
        on_call: agents.rows.filter((row) => row.status === 'ON_CALL').length,
      },
    },
  })
}
