import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { query, pool } from '../../src/config/database.js'
import { config } from '../../src/config/env.js'
import { encryptProfile, vaultConfigured } from '../../src/services/vault.service.js'

if (!config.seedUserPassword) {
  throw new Error('SEED_USER_PASSWORD must be set before seeding.')
}

const roles = [
  ['admin', 'Full platform administration'],
  ['employee', 'Internal intranet access'],
  ['partner', 'External extranet access'],
  ['hr', 'Human resources — intranet access and user directory'],
  ['manager', 'Department manager — intranet access and AutoFlow approvals'],
  ['client', 'External client — extranet access'],
  ['supplier', 'External supplier/vendor — extranet access'],
  ['tech_admin', 'Technical Administrator — infrastructure, security policy, integrations'],
  ['investor', 'Confidential Investor — isolated investor vault access'],
]

// Operational corridors (Schema Document §2.2).
const regions = [
  ['GLOBAL', 'Global (all corridors)'],
  ['SPAIN_EU', 'Spain / European Union'],
  ['INDIA', 'India'],
  ['UAE_DUBAI', 'UAE / Dubai'],
  ['LATAM', 'Latin America'],
  ['USA_CAN', 'United States & Canada'],
  ['MOROCCO', 'Morocco'],
]

// Organisation structure (Schema Document §1–§2). Parent entity and EU PICs come from the document;
// the external companies are fictional demo records (tax IDs marked DEMO).
const PARENT = 'Grupo Global Plataforma Bilateral (A.M.M. Servicios)'
const organizations = [
  // [legal_name, org_type, tax_id, pic_code, country, corridor, status, stage, parent]
  [PARENT, 'PARENT', 'G29837838', '861161733', 'ESP', 'SPAIN_EU', 'VERIFIED', 5, null],
  ['Grupo Global Nexus', 'BUSINESS_UNIT', 'G29837838', null, 'ESP', 'SPAIN_EU', 'VERIFIED', 5, PARENT],
  ['Grupo Global Ciber Seguridad', 'BUSINESS_UNIT', 'G29837838', null, 'ESP', 'SPAIN_EU', 'VERIFIED', 5, PARENT],
  ['Financiera Grupo Global', 'BUSINESS_UNIT', 'G29837838', null, 'ESP', 'SPAIN_EU', 'VERIFIED', 5, PARENT],
  ['Grupo Global Inmobiliaria', 'BUSINESS_UNIT', 'G29837838', null, 'ESP', 'SPAIN_EU', 'VERIFIED', 5, PARENT],
  ['Grupo Global Clínica Dental World', 'BUSINESS_UNIT', 'G29837838', null, 'ESP', 'SPAIN_EU', 'VERIFIED', 5, PARENT],
  ['Grupo Global Net', 'BUSINESS_UNIT', 'G29837838', null, 'ESP', 'SPAIN_EU', 'VERIFIED', 5, PARENT],
  ['Zeta AI Labs Pvt. Ltd.', 'STRATEGIC_PARTNER', 'TO-BE-PROVIDED', '862494222', 'IND', 'INDIA', 'VERIFIED', 5, null],
  ['Iberia Retail S.L.', 'CLIENT', 'DEMO-ES-0001', null, 'ESP', 'SPAIN_EU', 'VERIFIED', 5, null],
  ['Mumbai Textiles Pvt. Ltd.', 'VENDOR', 'DEMO-IN-0001', null, 'IND', 'INDIA', 'VERIFIED', 5, null],
  ['Vikas Metal Works', 'STRATEGIC_PARTNER', 'DEMO-IN-0002', null, 'IND', 'INDIA', 'VERIFIED', 5, null],
  ['Atlas Gulf Capital', 'INVESTOR', 'DEMO-AE-0001', null, 'ARE', 'UAE_DUBAI', 'VERIFIED', 5, null],
  ['Andes Trade Partners S.A.', 'STRATEGIC_PARTNER', 'DEMO-CO-0001', null, 'COL', 'LATAM', 'PENDING', 2, null],
]

async function upsert(table, columns, values, conflictColumn) {
  const sets = columns
    .filter((column) => column !== conflictColumn)
    .map((column, index) => `${column} = EXCLUDED.${column}`)
    .join(', ')
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns
    .map((_, index) => `$${index + 1}`)
    .join(', ')}) ON CONFLICT (${conflictColumn}) DO UPDATE SET ${sets} RETURNING id`
  const { rows } = await query(sql, values)
  return rows[0].id
}

async function seed() {
  const roleIds = {}
  for (const [name, description] of roles) {
    roleIds[name] = await upsert('roles', ['name', 'description'], [name, description], 'name')
  }

  const regionIds = {}
  for (const [code, name] of regions) {
    regionIds[code] = await upsert('regions', ['code', 'name'], [code, name], 'code')
  }

  const orgIds = {}
  for (const [legalName, orgType, taxId, pic, country, corridor, status, stage, parent] of organizations) {
    const { rows } = await query(
      `INSERT INTO organizations
         (legal_name, org_type, tax_id, pic_code, country, region_corridor, verification_status, onboarding_stage, parent_org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (LOWER(legal_name)) DO UPDATE SET org_type = EXCLUDED.org_type, parent_org_id = EXCLUDED.parent_org_id
       RETURNING org_id`,
      [legalName, orgType, taxId, pic, country, corridor, status, stage, parent ? orgIds[parent] : null],
    )
    orgIds[legalName] = rows[0].org_id
  }

  const passwordHash = await bcrypt.hash(config.seedUserPassword, 12)
  // [name, email, role, corridor, organisation]
  const users = [
    ['Ernesto Morilla Campos', 'admin@gmail.com', roleIds.admin, regionIds.GLOBAL, PARENT],
    ['Wade Warren', 'employee@gmail.com', roleIds.employee, regionIds.SPAIN_EU, 'Grupo Global Net'],
    ['Vikas Metal Works', 'partner@gmail.com', roleIds.partner, regionIds.INDIA, 'Vikas Metal Works'],
    ['Laura Gómez', 'hr@gmail.com', roleIds.hr, regionIds.SPAIN_EU, PARENT],
    ['Rahul Sharma', 'manager@gmail.com', roleIds.manager, regionIds.GLOBAL, 'Grupo Global Nexus'],
    ['Iberia Retail S.L.', 'customer@gmail.com', roleIds.client, regionIds.SPAIN_EU, 'Iberia Retail S.L.'],
    ['Mumbai Textiles Pvt. Ltd.', 'supplier@gmail.com', roleIds.supplier, regionIds.INDIA, 'Mumbai Textiles Pvt. Ltd.'],
    ['Chaitanya Rana', 'techadmin@gmail.com', roleIds.tech_admin, regionIds.GLOBAL, 'Zeta AI Labs Pvt. Ltd.'],
    ['Atlas Gulf Capital', 'investor@gmail.com', roleIds.investor, regionIds.UAE_DUBAI, 'Atlas Gulf Capital'],
  ]

  // One-time rename of the earlier demo emails, so existing chats/approvals/shares stay linked.
  const renamed = {
    'ernesto@grupoglobal.es': 'admin@gmail.com',
    'wade.warren@grupoglobal.es': 'employee@gmail.com',
    'orders@vikasmetals.in': 'partner@gmail.com',
    'laura.gomez@grupoglobal.es': 'hr@gmail.com',
    'rahul.sharma@grupoglobal.es': 'manager@gmail.com',
    'procurement@iberiaretail.es': 'customer@gmail.com',
    'supply@mumbaitextiles.in': 'supplier@gmail.com',
  }
  for (const [oldEmail, newEmail] of Object.entries(renamed)) {
    await query(
      `UPDATE users SET email = $2 WHERE email = $1
       AND NOT EXISTS (SELECT 1 FROM users WHERE email = $2)`,
      [oldEmail, newEmail],
    )
  }

  for (const [name, email, roleId, regionId, orgName] of users) {
    await upsert(
      'users',
      ['name', 'email', 'password_hash', 'role_id', 'region_id', 'status', 'org_id'],
      [name, email, passwordHash, roleId, regionId, 'active', orgIds[orgName]],
      'email',
    )
  }

  const ownerId = (await query('SELECT id FROM users WHERE email = $1', ['admin@gmail.com'])).rows[0].id
  const userId = async (email) =>
    (await query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id

  const sharedFolders = ['Partner Shared Files', 'Client Deliverables', 'Supplier Purchase Orders']
  for (const name of ['Corporate Documents', 'Finance Records', 'HR Policies', ...sharedFolders]) {
    await query(
      `INSERT INTO folders (name, is_shared, created_by)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM folders WHERE name = $1)`,
      [name, sharedFolders.includes(name), ownerId],
    )
  }

  const conversations = [
    ['Development Team', 'intranet', ['admin@gmail.com', 'employee@gmail.com', 'manager@gmail.com']],
    ['HR Department', 'intranet', ['admin@gmail.com', 'hr@gmail.com', 'employee@gmail.com']],
    ['Management', 'intranet', ['admin@gmail.com', 'manager@gmail.com', 'hr@gmail.com']],
    ['Partner Support', 'extranet', ['admin@gmail.com', 'partner@gmail.com']],
    ['Client Support — Iberia Retail', 'extranet', ['admin@gmail.com', 'manager@gmail.com', 'customer@gmail.com']],
    ['Supplier Coordination — Mumbai Textiles', 'extranet', ['admin@gmail.com', 'manager@gmail.com', 'supplier@gmail.com']],
  ]
  for (const [name, portal, members] of conversations) {
    await query(
      `INSERT INTO conversations (name, portal)
       SELECT $1, $2 WHERE NOT EXISTS
       (SELECT 1 FROM conversations WHERE name = $1 AND portal = $2)`,
      [name, portal],
    )
    const conversation = await query(
      'SELECT id FROM conversations WHERE name = $1 AND portal = $2',
      [name, portal],
    )
    for (const email of members) {
      await query(
        `INSERT INTO conversation_members (conversation_id, user_id)
         SELECT $1, id FROM users WHERE email = $2
         ON CONFLICT DO NOTHING`,
        [conversation.rows[0].id, email],
      )
    }
  }

  for (const [title, status] of [
    ['Q1 Compliance Review', 'pending'],
    ['Supplier Contract Renewal', 'approved'],
  ]) {
    await query(
      `INSERT INTO workflows (title, status, created_by)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE title = $1)`,
      [title, status, ownerId],
    )
  }

  // Demo AutoFlow requests: one waiting for the manager's approval.
  const managerId = await userId('manager@gmail.com')
  const employeeId = await userId('employee@gmail.com')
  const hrId = await userId('hr@gmail.com')
  for (const [title, description, creator, approver, assignee, dueDays] of [
    ['Purchase approval — 12 laptops for Madrid office', 'Quote attached in Finance Records. Budget line IT-2026-14.', employeeId, managerId, employeeId, 5],
    ['New employee onboarding — India team', 'Create accounts, assign Cloud Folders access and schedule induction.', hrId, managerId, hrId, 10],
    ['Annual leave request — 22 to 26 December', 'Cover arranged with the Development Team.', employeeId, null, null, 14],
  ]) {
    await query(
      `INSERT INTO workflows (title, description, status, created_by, approver_id, assigned_to, due_at)
       SELECT $1, $2, 'pending', $3, $4, $5, now() + make_interval(days => $6)
       WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE title = $1)`,
      [title, description, creator, approver, assignee, dueDays],
    )
  }

  // Two-step purchase chain (Manager → Admin) to demo multi-step approvals.
  const chainTitle = 'Purchase request — Office furniture for Bengaluru (EUR 14,200)'
  const chain = await query(
    `INSERT INTO workflows (title, description, status, created_by, assigned_to, due_at, template, current_step)
     SELECT $1, $2, 'pending', $3, $3, now() + interval '1 day', 'purchase', 1
     WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE title = $1)
     RETURNING id`,
    [chainTitle, 'Quote from three vendors attached in Finance Records. Needs manager and admin sign-off.', employeeId],
  )
  if (chain.rows[0]) {
    await query(
      `INSERT INTO workflow_steps (workflow_id, step_order, approver_role)
       VALUES ($1, 1, 'manager'), ($1, 2, 'admin')`,
      [chain.rows[0].id],
    )
  }

  // Every workflow needs at least one approval step (single-approver or "any manager").
  await query(
    `INSERT INTO workflow_steps (workflow_id, step_order, approver_id, approver_role, status)
     SELECT w.id, 1, w.approver_id, CASE WHEN w.approver_id IS NULL THEN 'manager' END,
            CASE WHEN w.status IN ('approved', 'completed') THEN 'approved'
                 WHEN w.status = 'rejected' THEN 'rejected' ELSE 'pending' END
     FROM workflows w
     WHERE NOT EXISTS (SELECT 1 FROM workflow_steps s WHERE s.workflow_id = w.id)`,
  )

  for (const [title, body] of [
    ['Welcome to the Global Group intranet', 'This is the shared workspace for our teams in Spain, Europe, India and worldwide. Use Cloud Folders for documents, AutoFlow for approvals and Team Chat to stay connected.'],
    ['Quarterly coordination meeting', 'The Spain–India coordination meeting takes place every Tuesday and Thursday. Check the Calendar for times in CET and IST.'],
  ]) {
    await query(
      `INSERT INTO announcements (title, body, region, created_by)
       SELECT $1, $2, 'GLOBAL', $3 WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE title = $1)`,
      [title, body, ownerId],
    )
  }

  for (const [title, description, inDays, hour] of [
    ['Spain–India coordination call', 'Weekly review of opportunities, tasks and execution.', 1, 10],
    ['Client review — Iberia Retail', 'Deliverables walkthrough with the client team.', 3, 12],
    ['Supplier quality audit — Mumbai Textiles', 'Remote audit of the latest purchase order.', 6, 9],
  ]) {
    await query(
      `INSERT INTO calendar_events (title, description, starts_at, ends_at, region, created_by)
       SELECT $1, $2,
              date_trunc('day', now()) + make_interval(days => $3, hours => $4),
              date_trunc('day', now()) + make_interval(days => $3, hours => $4 + 1),
              'GLOBAL', $5
       WHERE NOT EXISTS (SELECT 1 FROM calendar_events WHERE title = $1)`,
      [title, description, inDays, hour, ownerId],
    )
  }

  // ---- Demo mailbox messages (Inbox copy for the recipient + Sent copy for the sender) ----
  const customerId = await userId('customer@gmail.com')
  const supplierId = await userId('supplier@gmail.com')
  const people = {
    'admin@gmail.com': ownerId, 'hr@gmail.com': hrId, 'manager@gmail.com': managerId, 'employee@gmail.com': employeeId,
  }
  const names = { [ownerId]: 'Ernesto Morilla Campos', [hrId]: 'Laura Gómez', [managerId]: 'Rahul Sharma', [employeeId]: 'Wade Warren' }
  for (const [from, to, subject, body, hoursAgo] of [
    ['manager@gmail.com', 'employee@gmail.com', 'Laptop purchase — next steps',
      'Hi Wade,\n\nI have reviewed the quote for the 12 laptops. Please attach the final invoice to Finance Records once it arrives.\n\nThanks,\nRahul', 20],
    ['hr@gmail.com', 'employee@gmail.com', 'Your annual leave request',
      'Hi Wade,\n\nYour leave request for 22–26 December is with your manager in AutoFlow. You will get a notification once it is approved.\n\nBest regards,\nLaura (HR)', 6],
    ['admin@gmail.com', 'manager@gmail.com', 'Bengaluru office furniture',
      'Rahul,\n\nThe furniture request for Bengaluru needs your approval first, then mine. Please check AutoFlow today.\n\nErnesto', 3],
    ['employee@gmail.com', 'hr@gmail.com', 'Onboarding checklist question',
      'Hi Laura,\n\nShould new India team members get access to the HR Policies folder on day one?\n\nWade', 1],
  ]) {
    const fromId = people[from]
    const toId = people[to]
    const exists = await query('SELECT 1 FROM emails WHERE user_id = $1 AND subject = $2', [toId, subject])
    if (exists.rowCount) continue
    for (const [owner, folder, status] of [[toId, 'inbox', 'received'], [fromId, 'sent', 'delivered']]) {
      await query(
        `INSERT INTO emails (user_id, folder, from_address, from_name, to_address, subject, body, status, read_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() - make_interval(hours => $10))`,
        [owner, folder, from, names[fromId], to, subject, body, status, folder === 'sent' ? new Date() : null, hoursAgo],
      )
    }
  }

  // ---- Demo calendar invitations and online meetings ----
  const inviteMap = {
    'Spain–India coordination call': { online: true, attendees: [managerId, hrId, employeeId] },
    'Client review — Iberia Retail': { online: true, attendees: [managerId, customerId] },
    'Supplier quality audit — Mumbai Textiles': { online: true, attendees: [managerId, supplierId] },
  }
  for (const [title, plan] of Object.entries(inviteMap)) {
    const event = await query('SELECT id, video_room FROM calendar_events WHERE title = $1', [title])
    if (!event.rows[0]) continue
    if (plan.online && !event.rows[0].video_room) {
      await query("UPDATE calendar_events SET video_room = 'gg-demo-' || id WHERE id = $1", [event.rows[0].id])
    }
    for (const attendee of plan.attendees) {
      await query(
        'INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [event.rows[0].id, attendee],
      )
    }
  }

  // ---- Welcome notifications (only once per user) ----
  const everyone = await query("SELECT id FROM users WHERE status = 'active'")
  for (const { id } of everyone.rows) {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       SELECT $1, 'announcement', 'Welcome to Global Group', 'Your workspace is ready. Notifications for approvals, messages and meetings appear here.', NULL
       WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = $1 AND title = 'Welcome to Global Group')`,
      [id],
    )
  }

  // ---- NDAs issued to the demo external organisations (accepted from the Extranet banner) ----
  for (const name of ['Iberia Retail S.L.', 'Mumbai Textiles Pvt. Ltd.', 'Vikas Metal Works', 'Atlas Gulf Capital']) {
    await query(
      `INSERT INTO nda_records (org_id, nda_version, document_hash)
       SELECT $1::uuid, 'GG-NDA-2026.1', $2
       WHERE NOT EXISTS (SELECT 1 FROM nda_records WHERE org_id = $1::uuid)`,
      [orgIds[name], createHash('sha256').update(`GG-NDA-2026.1|${orgIds[name]}|${name}`).digest('hex')],
    )
  }

  // ---- CRM pipeline ----
  for (const [title, orgName, type, stage, confidentiality, value, manager] of [
    ['Iberia Retail — store roll-out 2027', 'Iberia Retail S.L.', 'CLIENT', 'ACTIVE_CONTRACT', 'INTERNAL', 250000, managerId],
    ['Mumbai Textiles — annual supply agreement', 'Mumbai Textiles Pvt. Ltd.', 'VENDOR', 'DUE_DILIGENCE', 'RESTRICTED', 120000, managerId],
    ['Vikas Metal Works — India distribution', 'Vikas Metal Works', 'STRATEGIC_PARTNER', 'PROPOSAL', 'INTERNAL', 180000, employeeId],
    ['Andes Trade Partners — LATAM entry', 'Andes Trade Partners S.A.', 'STRATEGIC_PARTNER', 'LEAD', 'INTERNAL', 90000, managerId],
  ]) {
    const inserted = await query(
      `INSERT INTO crm_relationships (entity_id, title, contact_type, pipeline_stage, confidentiality_level, estimated_value_eur, assigned_manager, created_by)
       SELECT $1::uuid, $2::varchar, $3, $4, $5, $6, $7::int, $8::int
       WHERE NOT EXISTS (SELECT 1 FROM crm_relationships WHERE title = $2::varchar) RETURNING rel_id`,
      [orgIds[orgName], title, type, stage, confidentiality, value, manager, ownerId],
    )
    if (inserted.rows[0]) {
      await query("INSERT INTO crm_activities (rel_id, kind, body, created_by) VALUES ($1, 'SYSTEM', $2, $3)",
        [inserted.rows[0].rel_id, `Demo relationship at stage ${stage}.`, ownerId])
    }
  }

  // ---- Projects & programs ----
  for (const [title, corridor, budget, phase, unit, owner, partner, milestones] of [
    ['Spain–India Retail Corridor', 'SPAIN_EU_INDIA', 480000, 'EXECUTION', 'Grupo Global Nexus', managerId, 'Iberia Retail S.L.', [
      ['Store survey complete', '2026-12-15', 'DONE', true], ['First delivery to Madrid', '2027-01-20', 'IN_PROGRESS', true], ['Internal budget review', '2027-02-01', 'PLANNED', false],
    ]],
    ['Dubai Investment Hub', 'GCC_DUBAI', 950000, 'PLANNING', 'Financiera Grupo Global', managerId, null, [['Regulatory assessment', '2027-02-15', 'PLANNED', false]]],
    ['Global Group Platform Go-Live', 'SPAIN_EU_INDIA', 220000, 'EXECUTION', 'Grupo Global Net', employeeId, null, [
      ['Staging environment', '2026-12-15', 'IN_PROGRESS', false], ['Penetration test', '2027-01-10', 'PLANNED', false],
    ]],
  ]) {
    const inserted = await query(
      `INSERT INTO projects_programs (title, corridor, budget_eur, phase, lead_entity, owner_id, start_date, end_date, created_by)
       SELECT $1::varchar, $2, $3, $4, $5::uuid, $6::int, '2026-11-01', '2027-06-30', $7::int
       WHERE NOT EXISTS (SELECT 1 FROM projects_programs WHERE LOWER(title) = LOWER($1::varchar)) RETURNING project_id`,
      [title, corridor, budget, phase, orgIds[unit], owner, ownerId],
    )
    const projectId = inserted.rows[0]?.project_id
    if (!projectId) continue
    await query("INSERT INTO project_members (project_id, user_id, project_role) VALUES ($1, $2, 'OWNER') ON CONFLICT DO NOTHING", [projectId, owner])
    if (owner !== employeeId) await query('INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [projectId, employeeId])
    if (partner) await query('INSERT INTO project_partners (project_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [projectId, orgIds[partner]])
    for (const [name, due, status, shared] of milestones) {
      await query(
        'INSERT INTO project_milestones (project_id, title, due_date, status, shared_with_partners, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
        [projectId, name, due, status, shared, ownerId],
      )
    }
  }

  // ---- Investor Vault (only when the vault key is configured) ----
  if (vaultConfigured()) {
    const investor = await query(
      `INSERT INTO investors_vault (org_id, encrypted_profile, investment_ticket_range, sector_focus, created_by)
       VALUES ($1, $2, 'EUR 1M-5M', 'FINTECH,REAL_ESTATE', $3)
       ON CONFLICT (org_id) WHERE org_id IS NOT NULL DO NOTHING RETURNING investor_id`,
      [orgIds['Atlas Gulf Capital'], encryptProfile({ full_name: 'Atlas Gulf Capital (demo)', email: 'investor@gmail.com', nationality: 'UAE', notes: 'Fictional demo investor.' }), ownerId],
    )
    if (investor.rows[0]) {
      const room = await query(
        `INSERT INTO vault_deal_rooms (title, summary, sector, ticket_range, created_by)
         VALUES ('Bengaluru Tech Park — Series A', 'Fictional demo deal room: mixed-use technology campus in Bengaluru.', 'REAL_ESTATE', 'EUR 1M-5M', $1)
         RETURNING room_id`,
        [ownerId],
      )
      await query('INSERT INTO vault_room_access (room_id, investor_id, granted_by) VALUES ($1, $2, $3)', [room.rows[0].room_id, investor.rows[0].investor_id, ownerId])
    }
  }

  // ---- Community ----
  for (const [name, sector, description] of [
    ['Fintech & Investment Committee', 'FINTECH', 'Cross-border finance and investment opportunities.'],
    ['Real Estate Committee', 'REAL_ESTATE', 'International property portfolio and developments.'],
    ['Cybersecurity Committee', 'CYBERSECURITY', 'Security governance, audits and threat intelligence.'],
    ['Healthcare Committee', 'HEALTHCARE', 'Clinical operations and healthcare infrastructure.'],
  ]) {
    await query(
      'INSERT INTO community_committees (name, sector, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
      [name, sector, description],
    )
  }
  await query(
    `INSERT INTO community_posts (author_id, body)
     SELECT $1::int, $2 WHERE NOT EXISTS (SELECT 1 FROM community_posts WHERE body = $2)`,
    [ownerId, 'Welcome to the Grupo Global community. Share updates from your delegation here.'],
  )

  // ---- Courses & events ----
  for (const [type, title, description, tier, lessons, quiz] of [
    ['COMPLIANCE_COURSE', 'Code of Ethics & Data Protection', 'Mandatory course on confidentiality, GDPR and the disciplinary regime.', 'ALL_EMPLOYEES',
      [{ title: 'Protecting information', body: 'Share documents only through authorised channels. Never send confidential files to personal accounts.' }],
      [
        { question: 'How should confidential documents be shared with a partner?', options: ['Personal email', 'External Shares or MetaLinks', 'Messaging apps'], answer: 1 },
        { question: 'What is the consequence of attempting to access the Investor Vault without authorisation?', options: ['A reminder', 'Tier 1 warning', 'Tier 3 expulsion'], answer: 2 },
      ]],
    ['TECHNICAL_WORKSHOP', 'Multi-Factor Authentication Setup', 'How to protect your account with an authenticator app.', 'EXECUTIVES',
      [{ title: 'Enable MFA', body: 'Open Security (MFA), scan the code with an authenticator app and confirm with a 6-digit code.' }], []],
    ['EVENT', 'Spain–India Bilateral Summit 2027', 'Hybrid summit for delegations, partners and investors.', 'ALL_EMPLOYEES', [], []],
  ]) {
    await query(
      `INSERT INTO community_events_courses (module_type, title, description, access_tier, lessons, quiz, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (title) DO NOTHING`,
      [type, title, description, tier, JSON.stringify(lessons), JSON.stringify(quiz), ownerId],
    )
  }

  // Folder access per role: [role, view, edit, share].
  const folderGrants = {
    'Corporate Documents': [['admin', 1, 1, 1], ['employee', 1, 1, 1], ['manager', 1, 1, 1], ['hr', 1, 1, 0]],
    'Finance Records': [['admin', 1, 1, 1], ['employee', 1, 1, 1], ['manager', 1, 1, 1]],
    'HR Policies': [['admin', 1, 1, 1], ['hr', 1, 1, 1], ['manager', 1, 0, 0], ['employee', 1, 0, 0]],
    'Partner Shared Files': [['admin', 1, 1, 1], ['manager', 1, 1, 1], ['partner', 1, 0, 0]],
    'Client Deliverables': [['admin', 1, 1, 1], ['manager', 1, 1, 1], ['employee', 1, 1, 0], ['client', 1, 0, 0]],
    'Supplier Purchase Orders': [['admin', 1, 1, 1], ['manager', 1, 1, 1], ['supplier', 1, 0, 0]],
  }

  const allFolders = await query('SELECT id, name FROM folders WHERE deleted_at IS NULL')
  for (const folder of allFolders.rows) {
    const grants = (folderGrants[folder.name] || [['admin', 1, 1, 1], ['employee', 1, 1, 1]])
      .map(([role, ...flags]) => [role, ...flags.map(Boolean)])
    for (const [role, view, edit, share] of grants) {
      await query(
        `INSERT INTO folder_permissions (folder_id, role_name, can_view, can_edit, can_share)
         SELECT $1, $2, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM folder_permissions WHERE folder_id = $1 AND role_name = $2
         )`,
        [folder.id, role, view, edit, share],
      )
    }
  }

  // Sample documents so every folder has something to open during a demo.
  const demoFiles = [
    ['Corporate Documents', 'Company Handbook 2026.txt', 'text/plain',
      'GLOBAL GROUP — COMPANY HANDBOOK 2026\n\n1. Who we are\nGlobal Group connects people, partners and business operations across Spain, Europe, India and worldwide.\n\n2. How we work\n- Documents live in Cloud Folders with role-based access.\n- Approvals run through AutoFlow.\n- Team communication uses Team Chat and Video Conferencing.\n\n3. Data protection\nAll corporate information is confidential and handled under GDPR.\n'],
    ['Finance Records', 'Q3 2026 Budget Summary.csv', 'text/csv',
      'Department,Region,Budget (EUR),Spent (EUR),Remaining (EUR)\nOperations,Europe,120000,84500,35500\nTechnology,India,95000,61200,33800\nSales,Global,80000,52300,27700\nHuman Resources,Europe,40000,21800,18200\n'],
    ['HR Policies', 'Leave and Holiday Policy.txt', 'text/plain',
      'LEAVE AND HOLIDAY POLICY\n\n- 23 working days of paid annual leave (Spain), 21 days (India).\n- Requests are submitted through AutoFlow at least 10 days in advance.\n- Managers approve or reject within 3 working days.\n- Public holidays follow the calendar of each regional office.\n'],
    ['HR Policies', 'New Employee Onboarding Checklist.txt', 'text/plain',
      'ONBOARDING CHECKLIST\n\n[ ] Account created in User Management\n[ ] Region and role assigned\n[ ] Cloud Folders access granted\n[ ] Added to Team Chat channels\n[ ] Induction meeting scheduled in Calendar\n[ ] Company Handbook read and acknowledged\n'],
    ['Partner Shared Files', 'Partner Price List 2026.csv', 'text/csv',
      'Item,Description,Unit,Price (EUR)\nGG-1001,Steel fittings — standard,box of 100,145.00\nGG-1002,Steel fittings — heavy duty,box of 100,198.00\nGG-2001,Aluminium profiles 2m,unit,22.50\n'],
    ['Client Deliverables', 'Iberia Retail — Project Plan.txt', 'text/plain',
      'IBERIA RETAIL S.L. — PROJECT PLAN\n\nPhase 1 (Weeks 1-2): Requirements workshop and store survey\nPhase 2 (Weeks 3-6): Supply and installation\nPhase 3 (Weeks 7-8): Staff training and handover\n\nAccount manager: Rahul Sharma\n'],
    ['Client Deliverables', 'Iberia Retail — Delivery Schedule.csv', 'text/csv',
      'Delivery,Store,Date,Status\nD-01,Madrid Centro,2026-12-02,Scheduled\nD-02,Barcelona Diagonal,2026-12-09,Scheduled\nD-03,Valencia Ruzafa,2026-12-16,Pending confirmation\n'],
    ['Supplier Purchase Orders', 'PO-2026-0142 — Cotton Fabric.txt', 'text/plain',
      'PURCHASE ORDER PO-2026-0142\n\nSupplier: Mumbai Textiles Pvt. Ltd.\nItem: Organic cotton fabric, 180 gsm, white\nQuantity: 2,500 metres\nUnit price: EUR 3.40\nTotal: EUR 8,500.00\nDelivery: CIF Valencia, by 15 January 2027\n'],
  ]
  fs.mkdirSync(config.uploadDir, { recursive: true })
  for (const [folderName, fileName, mimeType, content] of demoFiles) {
    const storedName = `demo-${fileName.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`
    fs.writeFileSync(path.join(config.uploadDir, storedName), content)
    await query(
      `INSERT INTO files (folder_id, name, stored_name, size_bytes, mime_type, uploaded_by)
       SELECT f.id, $2, $3, $4, $5, $6 FROM folders f
       WHERE f.name = $1 AND f.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM files x WHERE x.folder_id = f.id AND x.name = $2)
       LIMIT 1`,
      [folderName, fileName, storedName, Buffer.byteLength(content), mimeType, ownerId],
    )
  }

  for (const [folderName, email] of [
    ['Partner Shared Files', 'partner@gmail.com'],
    ['Client Deliverables', 'customer@gmail.com'],
    ['Supplier Purchase Orders', 'supplier@gmail.com'],
  ]) {
    await query(
      `INSERT INTO external_shares (folder_id, user_id, created_by)
       SELECT (SELECT id FROM folders WHERE name = $1 LIMIT 1),
              (SELECT id FROM users WHERE email = $2),
              $3
       ON CONFLICT (folder_id, user_id) DO NOTHING`,
      [folderName, email, ownerId],
    )
  }

  console.log('[OK] Seeded roles, regions, users, folders, permissions, shares, conversations and workflows.')
}

try {
  await seed()
} finally {
  await pool.end()
}
