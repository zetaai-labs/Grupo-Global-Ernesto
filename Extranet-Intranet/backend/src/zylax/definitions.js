import { STAFF_ROLES } from '../config/roles.js'

/**
 * ZYLAX module registry (Intranet and Extranet specification, sections 2 to 4).
 * Each entity declares its fields, workflow and access; rules.js holds the business logic.
 * Flow tokens: "manage" = the entity's managers, "owner" = creator or assignee,
 * "external" = the customer company on the record, anything else = a role name.
 */
const STAFF = STAFF_ROLES
const HR = ['admin', 'hr']
const FIN = ['admin', 'finance']
const OPS = ['admin', 'manager']
const TECH = ['admin', 'tech_admin']
const SALES = ['admin', 'manager', 'employee']
const COMMERCIAL = ['admin', 'manager', 'employee', 'finance']
const LEGAL = ['admin', 'manager']
const REQ = { required: true }

const f = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra })
const sel = (key, label, options, extra = {}) => f(key, label, 'select', { options, ...extra })
const ref = (key, label, module, entity, extra = {}) => f(key, label, 'ref', { module, entity, ...extra })
const PRIORITY = sel('priority', 'Priority', ['P1', 'P2', 'P3', 'P4'], REQ)
const basic = { ACTIVE: { ARCHIVED: ['manage'] }, ARCHIVED: { ACTIVE: ['manage'] } }
const approval = {
  SUBMITTED: { APPROVED: ['manage'], REJECTED: ['manage'], CANCELLED: ['owner'] },
  APPROVED: {}, REJECTED: {}, CANCELLED: {},
}
const ticket = {
  OPEN: { IN_PROGRESS: ['manage'], CLOSED: ['manage', 'owner', 'external'] },
  IN_PROGRESS: { WAITING: ['manage'], RESOLVED: ['manage'] },
  WAITING: { IN_PROGRESS: ['manage', 'owner', 'external'], RESOLVED: ['manage'] },
  RESOLVED: { CLOSED: ['manage', 'owner', 'external'], IN_PROGRESS: ['manage', 'owner', 'external'] },
  CLOSED: {},
}
const booking = { CONFIRMED: { COMPLETED: ['manage'], CANCELLED: ['manage', 'owner'] }, COMPLETED: {}, CANCELLED: {} }
const signup = {
  CONFIRMED: { CANCELLED: ['manage', 'owner'], COMPLETED: ['manage'] },
  WAITLISTED: { CONFIRMED: ['manage'], CANCELLED: ['manage', 'owner'] },
  COMPLETED: {}, CANCELLED: {},
}
const work = {
  PLANNED: { IN_PROGRESS: ['manage', 'owner'], CANCELLED: ['manage'] },
  IN_PROGRESS: { DONE: ['manage', 'owner'], PLANNED: ['manage'] },
  DONE: { IN_PROGRESS: ['manage'] }, CANCELLED: {},
}

const entity = (key, label, titleLabel, fields, options = {}) => ({
  key, label, titleLabel, fields, read: STAFF, create: STAFF, manage: OPS, flow: basic, ...options,
})

export const MODULES = [
  // ----- 2.1 Talent & Human Capital -----
  { key: 'people', name: 'People', group: 'Talent & Human Capital', icon: '♙', description: 'Unified directory, organisational chart and profile control.', view: 'orgchart', entities: [
    entity('profiles', 'Employee profiles', 'Full name', [
      f('user', 'Platform account', 'user', { ...REQ, assign: true }), f('job_title', 'Job title', 'text', REQ), ref('department', 'Department', 'people', 'departments'),
      f('manager', 'Reports to', 'user'), f('location', 'Location'), f('phone', 'Work phone', 'phone'), f('start_date', 'Start date', 'date'),
      f('salary_eur', 'Annual salary (EUR)', 'money', { secret: true }), f('national_id', 'National ID', 'text', { secret: true }),
    ], { create: HR, manage: HR, unique: ['user'], privateFiles: true }),
    entity('departments', 'Departments', 'Department', [f('head', 'Department head', 'user'), f('cost_center', 'Cost center')], { create: HR, manage: HR }),
    // Schema Document §3: HR keeps employee performance logs. Append-only; each employee sees only their own.
    entity('performance', 'Performance logs', 'Review title', [
      f('employee', 'Employee', 'user', { ...REQ, assign: true }), f('period', 'Period', 'month', REQ), f('rating', 'Overall rating (1-5)', 'rating', REQ),
      f('goals', 'Goals and results', 'textarea', REQ), f('strengths', 'Strengths', 'textarea'), f('improvements', 'Areas to improve', 'textarea'),
    ], { create: HR, manage: HR, own: true, groupRoles: STAFF, immutable: true, rule: 'performance', flow: { LOGGED: {} } }),
  ] },
  { key: 'onboarding', name: 'Onboarding', group: 'Talent & Human Capital', icon: '✓', description: 'Access automation and corporate welcome.', entities: [
    entity('plans', 'Onboarding plans', 'Plan name', [
      f('employee', 'New employee', 'user', { ...REQ, assign: true }), f('start_date', 'Start date', 'date', REQ), f('buddy', 'Welcome buddy', 'user'), f('notes', 'Notes', 'textarea'),
    ], { create: HR, manage: HR, own: true, rule: 'onboardingPlan', flow: { IN_PROGRESS: { COMPLETED: ['manage'], CANCELLED: ['manage'] }, COMPLETED: {}, CANCELLED: {} } }),
    entity('tasks', 'Onboarding tasks', 'Task', [
      ref('plan', 'Plan', 'onboarding', 'plans', REQ), sel('area', 'Area', ['ACCESS', 'EQUIPMENT', 'POLICY', 'TRAINING', 'WELCOME'], REQ),
      f('owner', 'Responsible', 'user', { assign: true }), f('due_date', 'Due date', 'date'),
    ], { create: HR, manage: HR, own: true, flow: { TODO: { DONE: ['manage', 'owner'] }, DONE: { TODO: ['manage'] } } }),
  ] },
  { key: 'attendance', name: 'Attendance & Leave', group: 'Talent & Human Capital', icon: '◷', description: 'Attendance control, punctuality, leave and vacation management.', view: 'clock', entities: [
    entity('attendance', 'Attendance', 'Entry', [
      f('clock_in', 'Clock in', 'datetime', { computed: true }), f('clock_out', 'Clock out', 'datetime', { computed: true }),
      f('hours', 'Hours', 'number', { computed: true }), f('break_minutes', 'Break (minutes)', 'number', { computed: true }), f('late', 'Late', 'boolean', { computed: true }),
    ], { create: [], manage: HR, own: true, immutable: true, autoTitle: true, flow: { OPEN: {}, CLOSED: {} } }),
    entity('leave', 'Leave requests', 'Reason', [
      sel('leave_type', 'Leave type', ['ANNUAL', 'SICK', 'PERSONAL', 'UNPAID'], REQ), f('start_date', 'From', 'date', REQ), f('end_date', 'To', 'date', REQ),
      f('days', 'Working days', 'number', { computed: true }),
    ], { manage: ['admin', 'hr', 'manager'], own: true, immutable: true, noSelf: ['APPROVED'], rule: 'leave', dates: ['start_date', 'end_date'], flow: approval }),
  ] },
  { key: 'safety', name: 'Workplace Safety & Emergency', group: 'Talent & Human Capital', icon: '⛑', description: 'Safety protocols and access logging during contingencies.', view: 'muster', entities: [
    entity('emergencies', 'Emergencies', 'Emergency', [
      sel('kind', 'Type', ['FIRE', 'EVACUATION', 'MEDICAL', 'SECURITY', 'WEATHER', 'DRILL'], REQ), f('location', 'Location', 'text', REQ), f('instructions', 'Instructions', 'textarea', REQ),
    ], { create: ['admin', 'hr', 'manager'], manage: ['admin', 'hr', 'manager'], rule: 'emergency', flow: { ACTIVE: { RESOLVED: ['manage'] }, RESOLVED: {} } }),
    entity('musters', 'Safety check-ins', 'Check-in', [
      ref('emergency', 'Emergency', 'safety', 'emergencies', REQ), sel('state', 'My status', ['SAFE', 'NEEDS_HELP', 'OFF_SITE'], REQ), f('location', 'Current location'),
    ], { manage: ['admin', 'hr', 'manager'], immutable: true, autoTitle: true, rule: 'muster', flow: { LOGGED: {} } }),
    entity('protocols', 'Safety protocols', 'Protocol', [f('area', 'Area'), f('review_date', 'Next review', 'date'), f('content', 'Procedure', 'textarea', REQ)], { create: ['admin', 'hr'], manage: ['admin', 'hr'] }),
    entity('incidents', 'Safety incidents', 'Incident', [
      f('occurred_at', 'When', 'datetime', REQ), f('location', 'Location', 'text', REQ), sel('severity', 'Severity', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], REQ), f('description', 'Description', 'textarea', REQ),
    ], { manage: ['admin', 'hr', 'manager'], own: true, flow: { REPORTED: { INVESTIGATING: ['manage'] }, INVESTIGATING: { CLOSED: ['manage'] }, CLOSED: {} } }),
  ] },

  // ----- 2.2 Finance, Procurement & Supply Chain -----
  { key: 'expenses', name: 'Expenses & Finance Tracker', group: 'Finance & Supply Chain', icon: '€', description: 'Per diem and expense control, cash flow and cost accounting.', entities: [
    entity('claims', 'Expense claims', 'Purpose', [
      sel('category', 'Category', ['TRAVEL', 'PER_DIEM', 'MEALS', 'SUPPLIES', 'OTHER'], REQ), f('amount_eur', 'Amount (EUR)', 'money', REQ), f('expense_date', 'Date', 'date', REQ), ref('cost_center', 'Cost center', 'expenses', 'cost_centers'),
    ], { groupRoles: ['finance'], manage: ['admin', 'finance', 'manager'], own: true, immutable: true, noSelf: ['APPROVED', 'PAID'], sumField: 'amount_eur', flow: {
      SUBMITTED: { APPROVED: ['manage'], REJECTED: ['manage'], CANCELLED: ['owner'] }, APPROVED: { PAID: FIN }, PAID: {}, REJECTED: {}, CANCELLED: {},
    } }),
    entity('cashflow', 'Cash flow', 'Entry', [
      sel('direction', 'Direction', ['IN', 'OUT'], REQ), f('amount_eur', 'Amount (EUR)', 'money', REQ), f('entry_date', 'Date', 'date', REQ), ref('cost_center', 'Cost center', 'expenses', 'cost_centers'),
    ], { groupRoles: ['finance'], read: FIN, create: FIN, manage: FIN, immutable: true, signedSum: { field: 'amount_eur', by: 'direction', negative: 'OUT' }, flow: { POSTED: { VOID: ['manage'] }, VOID: {} } }),
    entity('cost_centers', 'Cost centers', 'Cost center', [f('code', 'Code', 'text', REQ), f('budget_eur', 'Annual budget (EUR)', 'money', { restrictedTo: ['admin', 'finance', 'manager'] }), f('owner', 'Owner', 'user')], { groupRoles: ['finance'], read: STAFF, create: FIN, manage: FIN }),
  ] },
  { key: 'procurement', name: 'e-Procurement & Vendors', group: 'Finance & Supply Chain', icon: '⚒', description: 'Procurement automation, bidding and strategic vendor management.', entities: [
    entity('tenders', 'Tenders', 'Tender', [
      f('deadline', 'Bid deadline', 'date', { ...REQ, external: true }), f('budget_eur', 'Internal budget (EUR)', 'money', { internalOnly: true }), f('scope', 'Scope', 'textarea', { ...REQ, external: true }),
    ], { read: ['admin', 'manager', 'finance'], create: OPS, manage: OPS, external: { roles: ['supplier'], sharedStatuses: ['OPEN'] }, flow: {
      DRAFT: { OPEN: ['manage'], CANCELLED: ['manage'] }, OPEN: { CANCELLED: ['manage'] }, AWARDED: {}, CANCELLED: {},
    } }),
    entity('bids', 'Bids', 'Bid title', [
      ref('tender', 'Tender', 'procurement', 'tenders', { ...REQ, external: true }), f('supplier', 'Supplier', 'org', { customer: true, ...REQ }),
      f('amount_eur', 'Bid amount (EUR)', 'money', { ...REQ, external: true }), f('lead_days', 'Delivery days', 'integer', { ...REQ, external: true }), f('proposal', 'Proposal', 'textarea', { external: true }),
    ], { read: ['admin', 'manager', 'finance'], create: OPS, manage: OPS, immutable: true, rule: 'bid', external: { roles: ['supplier'], create: true }, flow: {
      SUBMITTED: { AWARDED: ['manage'], REJECTED: ['manage'], WITHDRAWN: ['external'] }, AWARDED: {}, REJECTED: {}, WITHDRAWN: {},
    } }),
    entity('purchase_orders', 'Purchase orders', 'Purchase order', [
      f('supplier', 'Supplier', 'org', { customer: true, ...REQ }), f('amount_eur', 'Amount (EUR)', 'money', { ...REQ, external: true }), f('delivery_date', 'Delivery date', 'date', { external: true }), ref('tender', 'Tender', 'procurement', 'tenders'),
    ], { read: ['admin', 'manager', 'finance'], create: OPS, manage: OPS, sumField: 'amount_eur', external: { roles: ['supplier'] }, flow: {
      ISSUED: { ACKNOWLEDGED: ['external', 'manage'], CANCELLED: ['manage'] }, ACKNOWLEDGED: { DELIVERED: ['manage'], CANCELLED: ['manage'] }, DELIVERED: {}, CANCELLED: {},
    } }),
    entity('vendors', 'Vendor scorecards', 'Scorecard', [
      f('supplier', 'Supplier', 'org', REQ), f('quality', 'Quality (1-5)', 'rating', REQ), f('delivery', 'Delivery (1-5)', 'rating', REQ), f('price', 'Price (1-5)', 'rating', REQ), f('notes', 'Notes', 'textarea'),
    ], { read: ['admin', 'manager', 'finance'], create: OPS, manage: OPS }),
  ] },
  { key: 'supply', name: 'Supply Chain & Approvals', group: 'Finance & Supply Chain', icon: '⇄', description: 'Inventory optimisation, internal logistics and hierarchical approvals.', entities: [
    entity('approvals', 'Approvals', 'Request', [
      sel('kind', 'Type', ['PURCHASE', 'BUDGET', 'CONTRACT', 'LOGISTICS', 'OTHER'], REQ), f('amount_eur', 'Amount (EUR)', 'money', REQ), f('justification', 'Justification', 'textarea', REQ), f('required_level', 'Required approver', 'text', { computed: true }),
    ], { groupRoles: ['finance'], manage: ['admin', 'finance', 'manager'], own: true, immutable: true, noSelf: ['APPROVED'], rule: 'approval', sumField: 'amount_eur', flow: approval }),
    entity('stock_moves', 'Stock movements', 'Reason', [
      f('product', 'Product', 'product', REQ), sel('direction', 'Direction', ['IN', 'OUT'], REQ), f('qty', 'Quantity', 'integer', REQ), ref('warehouse', 'Warehouse', 'supply', 'warehouses'),
    ], { read: COMMERCIAL, create: OPS, manage: OPS, immutable: true, rule: 'stockMove', flow: { POSTED: {} } }),
    entity('warehouses', 'Warehouses', 'Warehouse', [f('location', 'Location', 'text', REQ), f('manager_user', 'Manager', 'user'), f('capacity', 'Capacity (units)', 'integer')], { read: COMMERCIAL, create: OPS }),
  ] },

  // ----- 2.3 Technology & Operations -----
  { key: 'it_assets', name: 'IT Assets', group: 'Technology & Operations', icon: '⌨', description: 'Hardware, license and corporate device management.', entities: [
    entity('assets', 'Devices & hardware', 'Device', [
      sel('kind', 'Type', ['LAPTOP', 'DESKTOP', 'PHONE', 'TABLET', 'SERVER', 'NETWORK', 'OTHER'], REQ), f('serial', 'Serial number', 'text', REQ), f('holder', 'Assigned to', 'user', { assign: true }), f('warranty_until', 'Warranty until', 'date'), f('cost_eur', 'Cost (EUR)', 'money'),
    ], { manage: TECH, create: TECH, own: true, unique: ['serial'], flow: { IN_STOCK: { DEPLOYED: ['manage'], RETIRED: ['manage'] }, DEPLOYED: { REPAIR: ['manage'], IN_STOCK: ['manage'] }, REPAIR: { IN_STOCK: ['manage'], RETIRED: ['manage'] }, RETIRED: {} } }),
    entity('licenses', 'Software licenses', 'Software', [f('vendor', 'Vendor', 'text', REQ), f('seats', 'Seats', 'integer', REQ), f('expires_on', 'Expires on', 'date'), f('license_key', 'License key', 'text', { secret: true })], { read: TECH, create: TECH, manage: TECH }),
    entity('seats', 'License seats', 'Assignment', [ref('license', 'License', 'it_assets', 'licenses', REQ), f('holder', 'User', 'user', { ...REQ, assign: true })], {
      read: TECH, create: TECH, manage: TECH, immutable: true, autoTitle: true, capacity: { parent: 'license', limit: 'seats', active: ['CONFIRMED'] }, uniqueWithin: ['license', 'holder'],
      flow: { CONFIRMED: { CANCELLED: ['manage'] }, CANCELLED: {} },
    }),
  ] },
  { key: 'bugs', name: 'Bug & Incident Tracker', group: 'Technology & Operations', icon: '⚠', description: 'Incident management, quality control and software support cycles.', entities: [
    entity('issues', 'Bugs & incidents', 'Summary', [
      sel('kind', 'Type', ['BUG', 'INCIDENT', 'QA'], REQ), PRIORITY, f('system', 'System', 'text', REQ), f('owner', 'Assigned to', 'user', { assign: true }), f('steps', 'Details', 'textarea', REQ), f('sla_due', 'Response due', 'datetime', { computed: true }),
    ], { manage: TECH, rule: 'sla', flow: {
      NEW: { TRIAGED: ['manage'], CLOSED: ['manage'] }, TRIAGED: { IN_PROGRESS: ['manage', 'owner'] }, IN_PROGRESS: { IN_QA: ['manage', 'owner'] }, IN_QA: { RELEASED: ['manage'], IN_PROGRESS: ['manage', 'owner'] }, RELEASED: { CLOSED: ['manage'] }, CLOSED: {},
    } }),
  ] },
  { key: 'helpdesk', name: 'HelpDesk', group: 'Technology & Operations', icon: '☎', description: 'Internal help desk for continuous technical support.', entities: [
    entity('tickets', 'Support tickets', 'Subject', [
      sel('category', 'Category', ['ACCESS', 'HARDWARE', 'SOFTWARE', 'NETWORK', 'OTHER'], REQ), PRIORITY, f('description', 'Description', 'textarea', REQ), f('agent', 'Agent', 'user', { assign: true, staffEdit: true }), f('sla_due', 'Response due', 'datetime', { computed: true }),
    ], { manage: TECH, own: true, rule: 'sla', flow: ticket }),
  ] },
  { key: 'inspector', name: 'Site Inspector', group: 'Technology & Operations', icon: '⌕', description: 'Field audits, data collection and real-time reporting.', entities: [
    entity('inspections', 'Inspections', 'Inspection', [
      f('site', 'Site', 'text', REQ), f('inspector', 'Inspector', 'user', { ...REQ, assign: true }), f('scheduled_for', 'Scheduled for', 'date', REQ), f('items_total', 'Items checked', 'integer'), f('items_passed', 'Items passed', 'integer'), f('score', 'Score %', 'number', { computed: true }), f('findings', 'Findings', 'textarea'),
    ], { manage: OPS, create: OPS, own: true, rule: 'inspection', flow: { SCHEDULED: { IN_FIELD: ['manage', 'owner'], CANCELLED: ['manage'] }, IN_FIELD: { SUBMITTED: ['manage', 'owner'] }, SUBMITTED: { APPROVED: ['manage'], IN_FIELD: ['manage'] }, APPROVED: {}, CANCELLED: {} } }),
  ] },

  // ----- 2.4 Projects -----
  { key: 'taskzdone', name: 'Projects & TaskzDone', group: 'Projects', icon: '▦', description: 'Agile delivery, dashboards and tracking of deliverables for TEAM GLOBAL and TEAM ZETA.', view: 'board', link: '/intranet/projects', entities: [
    entity('tasks', 'Tasks', 'Task', [
      ref('sprint', 'Sprint', 'taskzdone', 'sprints'), sel('team', 'Team', ['TEAM_GLOBAL', 'TEAM_ZETA', 'JOINT'], REQ), PRIORITY, f('owner', 'Assigned to', 'user', { assign: true }), f('points', 'Story points', 'integer'), f('due_date', 'Due date', 'date'), f('details', 'Details', 'textarea'),
    ], { flow: { BACKLOG: { TODO: ['manage', 'owner'] }, TODO: { DOING: ['manage', 'owner'], BACKLOG: ['manage', 'owner'] }, DOING: { REVIEW: ['manage', 'owner'], TODO: ['manage', 'owner'] }, REVIEW: { DONE: ['manage'], DOING: ['manage', 'owner'] }, DONE: { DOING: ['manage'] } } }),
    entity('sprints', 'Sprints', 'Sprint', [f('start_date', 'Start', 'date', REQ), f('end_date', 'End', 'date', REQ), f('goal', 'Goal', 'textarea')], { create: OPS, dates: ['start_date', 'end_date'], flow: work }),
    entity('deliverables', 'Deliverables', 'Deliverable', [sel('team', 'Team', ['TEAM_GLOBAL', 'TEAM_ZETA', 'JOINT'], REQ), f('owner', 'Owner', 'user', { assign: true }), f('due_date', 'Due date', 'date', REQ)], { create: OPS, flow: work }),
  ] },

  // ----- 3.1 Commercial -----
  { key: 'sales', name: 'Sales & Leads', group: 'Commercial', icon: '↗', description: 'Opportunity tracking, sales pipeline and client acquisition.', view: 'board', entities: [
    entity('opportunities', 'Opportunities', 'Opportunity', [
      f('customer', 'Company', 'org', { customer: true }), f('contact_name', 'Contact person'), f('contact_email', 'Contact email', 'email'), f('owner', 'Sales owner', 'user', { assign: true }), f('value_eur', 'Value (EUR)', 'money', REQ), f('probability', 'Probability %', 'percent'), f('close_date', 'Expected close', 'date'), sel('source', 'Source', ['WEB', 'REFERRAL', 'EVENT', 'PARTNER', 'OUTBOUND']),
    ], { read: COMMERCIAL, create: SALES, sumField: 'value_eur', flow: { LEAD: { QUALIFIED: ['manage', 'owner'], LOST: ['manage', 'owner'] }, QUALIFIED: { PROPOSAL: ['manage', 'owner'], LOST: ['manage', 'owner'] }, PROPOSAL: { NEGOTIATION: ['manage', 'owner'], LOST: ['manage', 'owner'] }, NEGOTIATION: { WON: ['manage', 'owner'], LOST: ['manage', 'owner'] }, WON: {}, LOST: { LEAD: ['manage'] } } }),
  ] },
  { key: 'orders_crm', name: 'Orders & CRM', group: 'Commercial', icon: '▣', description: 'Order management, agreement history and key account management.', link: '/intranet/commercial', entities: [
    entity('key_accounts', 'Key accounts', 'Account plan', [f('customer', 'Company', 'org', { customer: true, ...REQ }), f('account_manager', 'Account manager', 'user', { ...REQ, assign: true }), sel('tier', 'Tier', ['STRATEGIC', 'GOLD', 'SILVER']), f('annual_target_eur', 'Annual target (EUR)', 'money', { internalOnly: true })], { read: COMMERCIAL, create: OPS }),
    entity('agreements', 'Agreements', 'Agreement', [
      f('customer', 'Company', 'org', { customer: true, ...REQ }), f('start_date', 'Start', 'date', { ...REQ, external: true }), f('end_date', 'End', 'date', { ...REQ, external: true }), f('value_eur', 'Value (EUR)', 'money', { external: true }), f('terms', 'Key terms', 'textarea', { external: true }),
    ], { read: COMMERCIAL, create: OPS, dates: ['start_date', 'end_date'], sumField: 'value_eur', external: { roles: ['client', 'partner'] }, flow: { DRAFT: { ACTIVE: ['manage'] }, ACTIVE: { EXPIRED: ['manage'], TERMINATED: ['manage'] }, EXPIRED: {}, TERMINATED: {} } }),
  ] },
  { key: 'contacts_quotes', name: 'Contacts & Quotes', group: 'Commercial', icon: '✎', description: 'Unified directory and automated processing of requests for quotes (RFQ).', link: '/intranet/commercial', entities: [
    entity('rfqs', 'Requests for quote', 'Request', [
      f('customer', 'Company', 'org', { customer: true, ...REQ }), f('product', 'Product', 'product', { ...REQ, external: true }), f('qty', 'Quantity', 'integer', { ...REQ, external: true }), f('needed_by', 'Needed by', 'date', { external: true }), f('details', 'Details', 'textarea', { external: true }), f('quote_number', 'Quote', 'text', { computed: true, external: true }),
    ], { read: COMMERCIAL, create: SALES, immutable: true, external: { roles: ['client', 'partner'], create: true }, actions: ['convertRfq'], flow: { NEW: { REVIEWING: ['manage', 'employee'], DECLINED: ['manage', 'employee'], WITHDRAWN: ['external'] }, REVIEWING: { DECLINED: ['manage', 'employee'] }, QUOTED: {}, DECLINED: {}, WITHDRAWN: {} } }),
  ] },
  { key: 'pos', name: 'POS', group: 'Commercial', icon: '🧾', description: 'Billing process automation and point of sale.', view: 'pos', custom: true, entities: [] },

  // ----- 3.2 Distribution -----
  { key: 'franchises', name: 'Franchises & Distributors', group: 'Distribution', icon: '◈', description: 'Decentralised sales networks and strategic partners.', link: '/intranet/commercial', entities: [
    entity('outlets', 'Outlets', 'Outlet', [f('partner', 'Partner', 'org', { customer: true, ...REQ }), f('city', 'City', 'text', { ...REQ, external: true }), f('manager_name', 'Manager', 'text', { external: true }), f('opened_on', 'Opened on', 'date', { external: true })], { read: COMMERCIAL, create: OPS, external: { roles: ['partner'] } }),
    entity('sales_reports', 'Partner sales reports', 'Report', [
      f('partner', 'Partner', 'org', { customer: true, ...REQ }), ref('outlet', 'Outlet', 'franchises', 'outlets', { external: true }), f('period', 'Month (YYYY-MM)', 'month', { ...REQ, external: true }), f('revenue_eur', 'Revenue (EUR)', 'money', { ...REQ, external: true }), f('units', 'Units sold', 'integer', { external: true }),
    ], { read: COMMERCIAL, create: OPS, immutable: true, sumField: 'revenue_eur', external: { roles: ['partner'], create: true }, flow: { SUBMITTED: { ACCEPTED: ['manage'], RETURNED: ['manage'] }, ACCEPTED: {}, RETURNED: {} } }),
  ] },
  { key: 'catalog', name: 'Product Catalog', group: 'Distribution', icon: '▤', description: 'Interactive showcase of products, services and technical specifications.', view: 'catalog', link: '/intranet/commercial', custom: true, entities: [] },

  // ----- 3.3 External support -----
  { key: 'client_support', name: 'Client Support', group: 'External Support', icon: '✉', description: 'Centralised ticketing and incident resolution for clients and external entities.', entities: [
    entity('tickets', 'Client tickets', 'Subject', [
      f('customer', 'Company', 'org', { customer: true, ...REQ }), sel('category', 'Category', ['ORDER', 'BILLING', 'TECHNICAL', 'ACCESS', 'OTHER'], { ...REQ, external: true }), { ...PRIORITY, external: true }, f('description', 'Description', 'textarea', { ...REQ, external: true }), f('agent', 'Agent', 'user', { assign: true }), f('sla_due', 'Response due', 'datetime', { computed: true, external: true }),
    ], { read: ['admin', 'manager', 'employee', 'tech_admin'], create: ['admin', 'manager', 'employee', 'tech_admin'], manage: ['admin', 'manager', 'tech_admin'], rule: 'sla', external: { roles: ['client', 'partner', 'supplier'], create: true }, flow: ticket }),
  ] },
  { key: 'call_log', name: 'Call Log', group: 'External Support', icon: '☏', description: 'Log of phone and corporate communications.', entities: [
    entity('calls', 'Calls', 'Subject', [
      sel('direction', 'Direction', ['INBOUND', 'OUTBOUND'], REQ), sel('channel', 'Channel', ['PHONE', 'VIDEO', 'WHATSAPP', 'EMAIL'], REQ), f('customer', 'Company', 'org'), f('counterpart', 'Spoke with', 'text', REQ), f('occurred_at', 'When', 'datetime', REQ), f('duration_min', 'Minutes', 'integer'), f('summary', 'Summary', 'textarea'), f('follow_up', 'Follow-up date', 'date'),
    ], { read: ['admin', 'manager', 'employee', 'finance'], create: ['admin', 'manager', 'employee', 'finance'], own: true, immutable: true, flow: { LOGGED: { FOLLOW_UP_DONE: ['manage', 'owner'] }, FOLLOW_UP_DONE: {} } }),
  ] },

  // ----- 4 Sector suite -----
  { key: 'events', name: 'Events / University Events', group: 'Sector Suite', icon: '✦', description: 'Logistics, capacity control and planning for corporate and academic events.', entities: [
    entity('events', 'Events', 'Event', [sel('kind', 'Type', ['CORPORATE', 'UNIVERSITY', 'CONFERENCE', 'WORKSHOP'], REQ), sel('mode', 'Format', ['IN_PERSON', 'ONLINE', 'HYBRID']), f('venue', 'Venue', 'text', REQ), f('start_at', 'Starts', 'datetime', REQ), f('end_at', 'Ends', 'datetime', REQ), f('capacity', 'Capacity', 'integer', REQ), f('budget_eur', 'Budget (EUR)', 'money')], { create: OPS, dates: ['start_at', 'end_at'], flow: work }),
    entity('registrations', 'Registrations', 'Attendee name', [ref('event', 'Event', 'events', 'events', REQ), f('email', 'Email', 'email', REQ), f('institution', 'Institution'), sel('attendance', 'Attending', ['IN_PERSON', 'ONLINE'])], { manage: OPS, own: true, immutable: true, capacity: { parent: 'event', limit: 'capacity', active: ['CONFIRMED'], waitlist: true }, uniqueWithin: ['event', 'email'], flow: signup }),
  ] },
  { key: 'education', name: 'Education & Course Planner', group: 'Sector Suite', icon: '🎓', description: 'Institutional management and training programmes.', link: '/intranet/courses', entities: [
    entity('programs', 'Programmes', 'Programme', [f('institution', 'Institution'), f('coordinator', 'Coordinator', 'user'), f('start_date', 'Start', 'date', REQ), f('end_date', 'End', 'date', REQ), f('capacity', 'Places', 'integer', REQ)], { create: ['admin', 'hr', 'manager'], manage: ['admin', 'hr', 'manager'], dates: ['start_date', 'end_date'], flow: work }),
    entity('sessions', 'Sessions', 'Session', [ref('program', 'Programme', 'education', 'programs', REQ), f('trainer', 'Trainer', 'user'), f('start_at', 'Starts', 'datetime', REQ), f('end_at', 'Ends', 'datetime', REQ), f('room', 'Room')], { create: ['admin', 'hr', 'manager'], manage: ['admin', 'hr', 'manager'], dates: ['start_at', 'end_at'], flow: work }),
    entity('enrollments', 'Enrolments', 'Learner', [ref('program', 'Programme', 'education', 'programs', REQ), f('learner', 'User', 'user', { ...REQ, assign: true })], { manage: ['admin', 'hr', 'manager'], own: true, immutable: true, capacity: { parent: 'program', limit: 'capacity', active: ['CONFIRMED'], waitlist: true }, uniqueWithin: ['program', 'learner'], flow: signup }),
  ] },
  { key: 'volunteers', name: 'Volunteers', group: 'Sector Suite', icon: '❤', description: 'Coordination of support staff for philanthropic and community initiatives.', entities: [
    entity('initiatives', 'Initiatives', 'Initiative', [f('location', 'Location', 'text', REQ), f('coordinator', 'Coordinator', 'user'), f('description', 'Description', 'textarea')], { create: ['admin', 'hr', 'manager'], manage: ['admin', 'hr', 'manager'] }),
    entity('shifts', 'Shifts', 'Shift', [ref('initiative', 'Initiative', 'volunteers', 'initiatives', REQ), f('start_at', 'Starts', 'datetime', REQ), f('end_at', 'Ends', 'datetime', REQ), f('slots', 'Volunteers needed', 'integer', REQ)], { create: ['admin', 'hr', 'manager'], manage: ['admin', 'hr', 'manager'], dates: ['start_at', 'end_at'], flow: work }),
    entity('signups', 'Sign-ups', 'Volunteer', [ref('shift', 'Shift', 'volunteers', 'shifts', REQ), f('volunteer', 'User', 'user', { ...REQ, assign: true })], { manage: ['admin', 'hr', 'manager'], own: true, immutable: true, capacity: { parent: 'shift', limit: 'slots', active: ['CONFIRMED'], waitlist: true }, uniqueWithin: ['shift', 'volunteer'], flow: signup }),
  ] },
  { key: 'hospitality', name: 'Hospitality & Services', group: 'Sector Suite', icon: '🛎', description: 'Hotel, restaurant, gym and laundry management.', entities: [
    entity('resources', 'Rooms, tables & services', 'Name', [sel('vertical', 'Area', ['HOTEL', 'RESTAURANT', 'GYM', 'LAUNDRY'], REQ), f('capacity', 'Capacity', 'integer', REQ), f('rate_eur', 'Rate (EUR)', 'money')], { create: OPS }),
    entity('bookings', 'Bookings', 'Guest', [ref('resource', 'Room, table or service', 'hospitality', 'resources', REQ), f('start_at', 'From', 'datetime', REQ), f('end_at', 'To', 'datetime', REQ), f('guests', 'Guests', 'integer', REQ), f('contact', 'Guest contact')], { dates: ['start_at', 'end_at'], overlap: { resource: 'resource', start: 'start_at', end: 'end_at', active: ['CONFIRMED'] }, flow: booking }),
    entity('service_orders', 'Service orders', 'Request', [ref('resource', 'Area', 'hospitality', 'resources', REQ), f('amount_eur', 'Charge (EUR)', 'money'), f('details', 'Details', 'textarea')], { sumField: 'amount_eur', flow: work }),
  ] },
  { key: 'fleet', name: 'Fleet & Logistics Hub', group: 'Sector Suite', icon: '🚚', description: 'Transportation fleet monitoring and tracking.', entities: [
    entity('vehicles', 'Vehicles', 'Vehicle', [f('plate', 'Plate', 'text', REQ), sel('kind', 'Type', ['CAR', 'VAN', 'TRUCK', 'MOTORBIKE'], REQ), f('driver', 'Default driver', 'user'), f('odometer_km', 'Odometer (km)', 'integer'), f('insurance_until', 'Insurance until', 'date'), f('last_location', 'Last reported location')], { create: OPS, unique: ['plate'] }),
    entity('trips', 'Trips', 'Trip', [ref('vehicle', 'Vehicle', 'fleet', 'vehicles', REQ), f('driver', 'Driver', 'user', { ...REQ, assign: true }), f('origin', 'From', 'text', REQ), f('destination', 'To', 'text', REQ), f('start_at', 'Departure', 'datetime', REQ), f('end_at', 'Arrival', 'datetime', REQ)], { create: OPS, own: true, dates: ['start_at', 'end_at'], overlap: { resource: 'vehicle', start: 'start_at', end: 'end_at', active: ['PLANNED', 'IN_PROGRESS'] }, flow: work }),
    entity('maintenance', 'Maintenance', 'Work', [ref('vehicle', 'Vehicle', 'fleet', 'vehicles', REQ), f('due_date', 'Due date', 'date', REQ), f('cost_eur', 'Cost (EUR)', 'money')], { create: OPS, sumField: 'cost_eur', flow: work }),
  ] },
  { key: 'real_estate', name: 'Real Estate & Property Manager', group: 'Sector Suite', icon: '⌂', description: 'Operation, sales and maintenance of real estate.', entities: [
    entity('properties', 'Properties', 'Property', [sel('kind', 'Type', ['OFFICE', 'RETAIL', 'RESIDENTIAL', 'LAND', 'INDUSTRIAL'], REQ), f('address', 'Address', 'text', REQ), f('area_m2', 'Area (m²)', 'number'), f('list_price_eur', 'List price (EUR)', 'money'), f('manager_user', 'Property manager', 'user')], { create: OPS, flow: { AVAILABLE: { RESERVED: ['manage'], LEASED: ['manage'], SOLD: ['manage'] }, RESERVED: { AVAILABLE: ['manage'], LEASED: ['manage'], SOLD: ['manage'] }, LEASED: { AVAILABLE: ['manage'] }, SOLD: {} } }),
    entity('leases', 'Leases', 'Tenant', [ref('property', 'Property', 'real_estate', 'properties', REQ), f('start_date', 'Start', 'date', REQ), f('end_date', 'End', 'date', REQ), f('rent_eur', 'Monthly rent (EUR)', 'money', REQ)], { create: OPS, dates: ['start_date', 'end_date'], overlap: { resource: 'property', start: 'start_date', end: 'end_date', active: ['ACTIVE'] }, sumField: 'rent_eur', flow: { ACTIVE: { ENDED: ['manage'] }, ENDED: {} } }),
    entity('maintenance', 'Maintenance', 'Work', [ref('property', 'Property', 'real_estate', 'properties', REQ), PRIORITY, f('cost_eur', 'Cost (EUR)', 'money'), f('owner', 'Responsible', 'user', { assign: true })], { sumField: 'cost_eur', flow: work }),
  ] },
  { key: 'construction', name: 'Construction', group: 'Sector Suite', icon: '🏗', description: 'Comprehensive supervision from headquarters to the job site.', entities: [
    entity('sites', 'Job sites', 'Site', [f('location', 'Location', 'text', REQ), f('supervisor', 'Supervisor', 'user', { assign: true }), f('budget_eur', 'Budget (EUR)', 'money'), f('progress_pct', 'Progress %', 'percent'), f('start_date', 'Start', 'date'), f('end_date', 'Planned end', 'date')], { create: OPS, own: false, dates: ['start_date', 'end_date'], flow: work }),
    entity('daily_reports', 'Daily site reports', 'Report', [ref('site', 'Site', 'construction', 'sites', REQ), f('report_date', 'Date', 'date', REQ), f('workers', 'Workers on site', 'integer'), f('progress_pct', 'Progress %', 'percent'), f('notes', 'Work done', 'textarea', REQ)], { immutable: true, rule: 'siteReport', flow: { SUBMITTED: { REVIEWED: ['manage'] }, REVIEWED: {} } }),
    entity('issues', 'Site issues', 'Issue', [ref('site', 'Site', 'construction', 'sites', REQ), PRIORITY, f('owner', 'Responsible', 'user', { assign: true }), f('details', 'Details', 'textarea', REQ)], { flow: work }),
  ] },
  { key: 'legal', name: 'Legal Cases', group: 'Sector Suite', icon: '⚖', description: 'Secure repository of legal files and contracts.', entities: [
    entity('cases', 'Legal cases', 'Case', [sel('kind', 'Type', ['LITIGATION', 'LABOUR', 'TAX', 'REGULATORY', 'IP', 'OTHER'], REQ), f('counterparty', 'Counterparty', 'text', REQ), f('lawyer', 'Responsible lawyer', 'user', { assign: true }), f('next_hearing', 'Next hearing', 'date'), f('strategy', 'Privileged notes', 'textarea', { secret: true })], { read: LEGAL, create: LEGAL, manage: ['admin'], own: true, flow: { OPEN: { IN_COURT: ['manage', 'owner'], SETTLED: ['manage', 'owner'], CLOSED: ['manage'] }, IN_COURT: { SETTLED: ['manage', 'owner'], CLOSED: ['manage'] }, SETTLED: { CLOSED: ['manage'] }, CLOSED: {} } }),
    entity('contracts', 'Contracts', 'Contract', [f('counterparty', 'Counterparty', 'text', REQ), f('owner', 'Owner', 'user', { assign: true }), f('start_date', 'Start', 'date', REQ), f('end_date', 'End', 'date'), f('value_eur', 'Value (EUR)', 'money'), f('clauses', 'Key clauses', 'textarea', { secret: true })], { read: LEGAL, create: LEGAL, manage: ['admin'], own: true, dates: ['start_date', 'end_date'], flow: { DRAFT: { IN_REVIEW: ['manage', 'owner'] }, IN_REVIEW: { SIGNED: ['manage'], DRAFT: ['manage', 'owner'] }, SIGNED: { EXPIRED: ['manage'], TERMINATED: ['manage'] }, EXPIRED: {}, TERMINATED: {} } }),
  ] },
  { key: 'facilities', name: 'Facilities & Corporate Travel', group: 'Sector Suite', icon: '🏢', description: 'Office space, room reservations and executive travel.', entities: [
    entity('spaces', 'Spaces', 'Space', [sel('kind', 'Type', ['MEETING_ROOM', 'DESK', 'OFFICE', 'AUDITORIUM'], REQ), f('location', 'Location', 'text', REQ), f('capacity', 'Capacity', 'integer', REQ)], { create: OPS }),
    entity('reservations', 'Reservations', 'Purpose', [ref('space', 'Space', 'facilities', 'spaces', REQ), f('start_at', 'From', 'datetime', REQ), f('end_at', 'To', 'datetime', REQ), f('attendees', 'Attendees', 'integer', REQ)], { dates: ['start_at', 'end_at'], overlap: { resource: 'space', start: 'start_at', end: 'end_at', active: ['CONFIRMED'] }, rule: 'spaceCapacity', flow: booking }),
    entity('travel', 'Travel requests', 'Trip purpose', [f('destination', 'Destination', 'text', REQ), f('depart_on', 'Departure', 'date', REQ), f('return_on', 'Return', 'date', REQ), f('estimate_eur', 'Estimated cost (EUR)', 'money', REQ), f('itinerary', 'Itinerary', 'textarea')], { manage: ['admin', 'manager', 'finance'], own: true, immutable: true, noSelf: ['APPROVED'], dates: ['depart_on', 'return_on'], sumField: 'estimate_eur', flow: approval }),
  ] },
]

export const moduleByKey = new Map(MODULES.map((module) => [module.key, module]))
export const findEntity = (moduleKey, entityKey) => moduleByKey.get(moduleKey)?.entities.find((item) => item.key === entityKey) || null
export const initialStatus = (definition) => Object.keys(definition.flow)[0]
export const allStatuses = (definition) => [...new Set(Object.entries(definition.flow).flatMap(([from, next]) => [from, ...Object.keys(next)]))]
