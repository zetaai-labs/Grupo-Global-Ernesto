import { findEntity } from '../../src/zylax/definitions.js'
import { insertRecord } from '../../src/zylax/engine.controller.js'
import { requiredApprover, workingDays } from '../../src/zylax/rules.js'

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const at = (offset, hour) => `${day(offset)}T${String(hour).padStart(2, '0')}:00:00.000Z`

/** Repeatable demo records so every ZYLAX module has something to show. All names are fictional. */
export async function seedZylax(query) {
  const userRows = (await query(`SELECT id, split_part(email, '@', 1) AS key FROM users WHERE email LIKE '%@gmail.com'`)).rows
  const u = Object.fromEntries(userRows.map((row) => [row.key, row.id]))
  const orgId = async (name) => (await query('SELECT org_id FROM organizations WHERE legal_name = $1', [name])).rows[0]?.org_id
  const iberia = await orgId('Iberia Retail S.L.')
  const partner = await orgId('Vikas Metal Works')
  const supplierOrg = (await query(`SELECT org_id FROM users WHERE email = 'supplier@gmail.com'`)).rows[0]?.org_id
  const product = (await query(`SELECT product_id FROM zx_products WHERE sku = 'DEMO-MON-27'`)).rows[0]?.product_id
  if (!u.admin || !u.employee || !iberia || !product) return

  const db = { query }
  const add = async (module, entity, title, data, { status, by = 'admin', customer = null, assigned = null } = {}) => {
    const found = await query('SELECT record_id FROM zx_records WHERE module = $1 AND entity = $2 AND title = $3 LIMIT 1', [module, entity, title])
    if (found.rows[0]) return found.rows[0].record_id
    const record = await insertRecord(db, module, findEntity(module, entity), { title, status, data, customer_org_id: customer, assigned_to: assigned }, u[by], null)
    return record.record_id
  }

  // Talent & Human Capital
  const ops = await add('people', 'departments', 'Operations', { head: u.manager, cost_center: 'CC-OPS' }, { by: 'hr' })
  const tech = await add('people', 'departments', 'Technology', { head: u.techadmin, cost_center: 'CC-TEC' }, { by: 'hr' })
  await add('people', 'profiles', 'Demo Super Administrator', { user: u.admin, job_title: 'President', location: 'Madrid' }, { by: 'hr', assigned: u.admin })
  await add('people', 'profiles', 'Demo Operations Manager', { user: u.manager, job_title: 'Operations Manager', department: ops, manager: u.admin, location: 'Madrid' }, { by: 'hr', assigned: u.manager })
  await add('people', 'profiles', 'Demo Technical Lead', { user: u.techadmin, job_title: 'Technical Lead', department: tech, manager: u.admin, location: 'Hyderabad' }, { by: 'hr', assigned: u.techadmin })
  await add('people', 'profiles', 'Demo Employee', { user: u.employee, job_title: 'Sales Executive', department: ops, manager: u.manager, location: 'Madrid' }, { by: 'hr', assigned: u.employee })
  const plan = await add('onboarding', 'plans', 'Welcome plan: Demo Employee', { employee: u.employee, start_date: day(3), buddy: u.manager }, { status: 'IN_PROGRESS', by: 'hr', assigned: u.employee })
  await add('onboarding', 'tasks', 'Sign Code of Ethics and NDA', { plan, area: 'POLICY', owner: u.employee, due_date: day(4) }, { status: 'TODO', by: 'hr', assigned: u.employee })
  await add('onboarding', 'tasks', 'Prepare laptop and equipment', { plan, area: 'EQUIPMENT', owner: u.techadmin, due_date: day(3) }, { status: 'TODO', by: 'hr', assigned: u.techadmin })
  const leaveStart = day(21)
  const leaveEnd = day(25)
  await add('attendance', 'leave', 'Family holiday', { leave_type: 'ANNUAL', start_date: leaveStart, end_date: leaveEnd, days: workingDays(leaveStart, leaveEnd) }, { status: 'SUBMITTED', by: 'employee' })
  await add('safety', 'protocols', 'Building evacuation procedure', { area: 'Madrid HQ', review_date: day(90), content: 'Leave by the nearest exit and go to assembly point A.' }, { by: 'hr' })
  await add('safety', 'emergencies', 'Evacuation drill: Madrid HQ', { kind: 'DRILL', location: 'Madrid HQ', instructions: 'Go to assembly point A and check in here.' }, { status: 'ACTIVE', by: 'hr' })
  await add('safety', 'incidents', 'Wet floor near reception', { occurred_at: at(-2, 9), location: 'Reception', severity: 'LOW', description: 'Sign placed and floor dried.' }, { status: 'REPORTED', by: 'employee' })

  // Finance, Procurement & Supply Chain
  const costCenter = await add('expenses', 'cost_centers', 'Commercial Spain', { code: 'CC-ES-01', budget_eur: 120000, owner: u.finance }, { by: 'finance' })
  await add('expenses', 'claims', 'Client visit to Barcelona', { category: 'TRAVEL', amount_eur: 186.4, expense_date: day(-3), cost_center: costCenter }, { status: 'SUBMITTED', by: 'employee' })
  await add('expenses', 'cashflow', 'Client payment received', { direction: 'IN', amount_eur: 25000, entry_date: day(-5), cost_center: costCenter }, { status: 'POSTED', by: 'finance' })
  await add('expenses', 'cashflow', 'Office rent', { direction: 'OUT', amount_eur: 4200, entry_date: day(-4), cost_center: costCenter }, { status: 'POSTED', by: 'finance' })
  const tender = await add('procurement', 'tenders', 'Office laptops 2027', { deadline: day(14), budget_eur: 45000, scope: 'Supply of 50 business laptops with three-year warranty.' }, { status: 'OPEN', by: 'manager' })
  if (supplierOrg) await add('procurement', 'bids', 'Laptop supply offer', { tender, supplier: supplierOrg, amount_eur: 41500, lead_days: 21, proposal: 'Includes on-site warranty.' }, { status: 'SUBMITTED', by: 'manager', customer: supplierOrg })
  if (supplierOrg) await add('procurement', 'purchase_orders', 'PO: Packaging materials', { supplier: supplierOrg, amount_eur: 3200, delivery_date: day(10) }, { status: 'ISSUED', by: 'manager', customer: supplierOrg })
  if (supplierOrg) await add('procurement', 'vendors', 'Annual supplier review', { supplier: supplierOrg, quality: 4, delivery: 5, price: 3 }, { by: 'manager' })
  await add('supply', 'approvals', 'New warehouse shelving', { kind: 'PURCHASE', amount_eur: 6400, justification: 'Capacity for the 2027 roll-out.', required_level: requiredApprover(6400) }, { status: 'SUBMITTED', by: 'employee' })
  const warehouse = await add('supply', 'warehouses', 'Madrid Central', { location: 'Madrid', manager_user: u.manager, capacity: 5000 }, { by: 'manager' })
  await add('supply', 'stock_moves', 'Opening stock count', { product, direction: 'IN', qty: 60, warehouse }, { status: 'POSTED', by: 'manager' })

  // Technology & Operations
  await add('it_assets', 'assets', 'ThinkBook 14 - Sales', { kind: 'LAPTOP', serial: 'DEMO-SN-1001', holder: u.employee, warranty_until: day(400), cost_eur: 899 }, { status: 'DEPLOYED', by: 'techadmin', assigned: u.employee })
  await add('it_assets', 'assets', 'Spare laptop', { kind: 'LAPTOP', serial: 'DEMO-SN-1002', cost_eur: 899 }, { status: 'IN_STOCK', by: 'techadmin' })
  const license = await add('it_assets', 'licenses', 'Office Suite', { vendor: 'Demo Vendor', seats: 25, expires_on: day(200) }, { by: 'techadmin' })
  await add('it_assets', 'seats', 'Office Suite seat', { license, holder: u.employee }, { status: 'CONFIRMED', by: 'techadmin', assigned: u.employee })
  await add('bugs', 'issues', 'Report export times out', { kind: 'BUG', priority: 'P2', system: 'Reports', owner: u.techadmin, steps: 'Export a full-year report.', sla_due: at(1, 12) }, { status: 'TRIAGED', by: 'techadmin', assigned: u.techadmin })
  await add('helpdesk', 'tickets', 'Cannot connect to VPN', { category: 'NETWORK', priority: 'P3', description: 'VPN fails from the Barcelona office.', agent: u.techadmin, sla_due: at(1, 15) }, { status: 'OPEN', by: 'employee', assigned: u.techadmin })
  await add('inspector', 'inspections', 'Quarterly audit: Madrid store', { site: 'Madrid store', inspector: u.employee, scheduled_for: day(5), items_total: 20, items_passed: 18, score: 90 }, { status: 'IN_FIELD', by: 'manager', assigned: u.employee })

  // Projects
  const sprint = await add('taskzdone', 'sprints', 'Sprint 1: Go-live', { start_date: day(-3), end_date: day(11), goal: 'Prepare the January go-live.' }, { status: 'IN_PROGRESS', by: 'manager' })
  await add('taskzdone', 'tasks', 'Configure production domain', { sprint, team: 'TEAM_ZETA', priority: 'P1', owner: u.techadmin, points: 5, due_date: day(7) }, { status: 'DOING', by: 'manager', assigned: u.techadmin })
  await add('taskzdone', 'tasks', 'Approve public content', { sprint, team: 'TEAM_GLOBAL', priority: 'P2', owner: u.manager, points: 3, due_date: day(9) }, { status: 'TODO', by: 'manager', assigned: u.manager })
  await add('taskzdone', 'tasks', 'User acceptance testing', { sprint, team: 'JOINT', priority: 'P2', owner: u.employee, points: 8, due_date: day(10) }, { status: 'BACKLOG', by: 'manager', assigned: u.employee })
  await add('taskzdone', 'deliverables', 'Platform handover pack', { team: 'JOINT', owner: u.manager, due_date: day(30) }, { status: 'PLANNED', by: 'manager', assigned: u.manager })

  // Commercial, distribution and support
  await add('sales', 'opportunities', 'Iberia store expansion', { customer: iberia, contact_name: 'Demo Buyer', owner: u.employee, value_eur: 85000, probability: 60, close_date: day(45), source: 'REFERRAL' }, { status: 'PROPOSAL', by: 'employee', customer: iberia, assigned: u.employee })
  await add('sales', 'opportunities', 'New university partnership', { contact_name: 'Demo Dean', owner: u.employee, value_eur: 32000, probability: 20, source: 'EVENT' }, { status: 'LEAD', by: 'employee', assigned: u.employee })
  await add('orders_crm', 'key_accounts', 'Iberia Retail account plan', { customer: iberia, account_manager: u.manager, tier: 'STRATEGIC', annual_target_eur: 250000 }, { by: 'manager', customer: iberia, assigned: u.manager })
  await add('orders_crm', 'agreements', 'Framework supply agreement', { customer: iberia, start_date: day(-30), end_date: day(335), value_eur: 250000, terms: 'Net 30 payment and quarterly reviews.' }, { status: 'ACTIVE', by: 'manager', customer: iberia })
  await add('contacts_quotes', 'rfqs', 'Monitors for new stores', { customer: iberia, product, qty: 12, needed_by: day(30), details: 'Delivery to Madrid.' }, { status: 'NEW', by: 'admin', customer: iberia })
  if (partner) {
    const outlet = await add('franchises', 'outlets', 'Hyderabad outlet', { partner, city: 'Hyderabad', manager_name: 'Demo Outlet Manager', opened_on: day(-200) }, { by: 'manager', customer: partner })
    await add('franchises', 'sales_reports', 'Monthly sales report', { partner, outlet, period: day(-30).slice(0, 7), revenue_eur: 18400, units: 96 }, { status: 'SUBMITTED', by: 'manager', customer: partner })
  }
  await add('client_support', 'tickets', 'Question about order delivery', { customer: iberia, category: 'ORDER', priority: 'P3', description: 'When will the order arrive?', sla_due: at(1, 10) }, { status: 'OPEN', by: 'customer', customer: iberia })
  await add('call_log', 'calls', 'Follow-up on store roll-out', { direction: 'OUTBOUND', channel: 'PHONE', customer: iberia, counterpart: 'Demo Buyer', occurred_at: at(-1, 11), duration_min: 14, summary: 'Agreed to review the quote.', follow_up: day(3) }, { status: 'LOGGED', by: 'employee' })

  // Sector suite
  const event = await add('events', 'events', 'Bilateral Business Forum 2027', { kind: 'CONFERENCE', venue: 'Madrid', start_at: at(60, 9), end_at: at(60, 17), capacity: 120, budget_eur: 18000 }, { status: 'PLANNED', by: 'manager' })
  await add('events', 'registrations', 'Demo Attendee', { event, email: 'attendee@example.test', institution: 'Demo University' }, { status: 'CONFIRMED', by: 'employee' })
  const program = await add('education', 'programs', 'Compliance Academy', { institution: 'Grupo Global', coordinator: u.hr, start_date: day(10), end_date: day(40), capacity: 30 }, { status: 'PLANNED', by: 'hr' })
  await add('education', 'sessions', 'GDPR essentials', { program, trainer: u.hr, start_at: at(12, 10), end_at: at(12, 12), room: 'Room A' }, { status: 'PLANNED', by: 'hr' })
  await add('education', 'enrollments', 'Demo Employee', { program, learner: u.employee }, { status: 'CONFIRMED', by: 'hr', assigned: u.employee })
  const initiative = await add('volunteers', 'initiatives', 'Community food drive', { location: 'Madrid', coordinator: u.hr, description: 'Collect and distribute food.' }, { by: 'hr' })
  const shift = await add('volunteers', 'shifts', 'Saturday morning shift', { initiative, start_at: at(16, 9), end_at: at(16, 13), slots: 8 }, { status: 'PLANNED', by: 'hr' })
  await add('volunteers', 'signups', 'Demo Employee', { shift, volunteer: u.employee }, { status: 'CONFIRMED', by: 'employee', assigned: u.employee })
  const room = await add('hospitality', 'resources', 'Hotel room 204', { vertical: 'HOTEL', capacity: 2, rate_eur: 120 }, { by: 'manager' })
  await add('hospitality', 'resources', 'Restaurant table 5', { vertical: 'RESTAURANT', capacity: 4, rate_eur: 0 }, { by: 'manager' })
  await add('hospitality', 'resources', 'Laundry service', { vertical: 'LAUNDRY', capacity: 10, rate_eur: 15 }, { by: 'manager' })
  await add('hospitality', 'bookings', 'Demo Guest', { resource: room, start_at: at(8, 14), end_at: at(10, 11), guests: 2, contact: 'guest@example.test' }, { status: 'CONFIRMED', by: 'employee' })
  const vehicle = await add('fleet', 'vehicles', 'Delivery Van 1', { plate: 'DEMO-1234', kind: 'VAN', driver: u.employee, odometer_km: 48210, insurance_until: day(180), last_location: 'Madrid depot' }, { by: 'manager' })
  await add('fleet', 'trips', 'Madrid to Valencia delivery', { vehicle, driver: u.employee, origin: 'Madrid', destination: 'Valencia', start_at: at(6, 7), end_at: at(6, 13) }, { status: 'PLANNED', by: 'manager', assigned: u.employee })
  await add('fleet', 'maintenance', 'Annual service', { vehicle, due_date: day(25), cost_eur: 340 }, { status: 'PLANNED', by: 'manager' })
  const property = await add('real_estate', 'properties', 'Castellana office', { kind: 'OFFICE', address: 'Madrid', area_m2: 420, list_price_eur: 1850000, manager_user: u.manager }, { status: 'LEASED', by: 'manager' })
  await add('real_estate', 'leases', 'Demo Tenant S.L.', { property, start_date: day(-100), end_date: day(630), rent_eur: 9800 }, { status: 'ACTIVE', by: 'manager' })
  await add('real_estate', 'maintenance', 'Air conditioning service', { property, priority: 'P3', cost_eur: 780, owner: u.manager }, { status: 'PLANNED', by: 'manager', assigned: u.manager })
  const site = await add('construction', 'sites', 'Valencia logistics centre', { location: 'Valencia', supervisor: u.manager, budget_eur: 2400000, progress_pct: 35, start_date: day(-120), end_date: day(240) }, { status: 'IN_PROGRESS', by: 'manager', assigned: u.manager })
  await add('construction', 'daily_reports', 'Foundations: east wing', { site, report_date: day(-1), workers: 24, progress_pct: 35, notes: 'Concrete poured on schedule.' }, { status: 'SUBMITTED', by: 'manager' })
  await add('construction', 'issues', 'Delayed steel delivery', { site, priority: 'P2', owner: u.manager, details: 'Supplier expects a three-day delay.' }, { status: 'IN_PROGRESS', by: 'manager', assigned: u.manager })
  await add('legal', 'cases', 'Demo trademark review', { kind: 'IP', counterparty: 'Demo Counterparty', lawyer: u.manager, next_hearing: day(35) }, { status: 'OPEN', by: 'admin', assigned: u.manager })
  await add('legal', 'contracts', 'Demo hosting contract', { counterparty: 'Demo Hosting S.A.', owner: u.manager, start_date: day(-60), end_date: day(305), value_eur: 24000 }, { status: 'SIGNED', by: 'admin', assigned: u.manager })
  const meetingRoom = await add('facilities', 'spaces', 'Meeting Room Atlas', { kind: 'MEETING_ROOM', location: 'Madrid HQ', capacity: 10 }, { by: 'manager' })
  await add('facilities', 'reservations', 'Client review', { space: meetingRoom, start_at: at(2, 10), end_at: at(2, 11), attendees: 6 }, { status: 'CONFIRMED', by: 'employee' })
  await add('facilities', 'travel', 'Dubai partner meeting', { destination: 'Dubai', depart_on: day(30), return_on: day(34), estimate_eur: 2850, itinerary: 'Madrid to Dubai, two partner meetings.' }, { status: 'SUBMITTED', by: 'employee' })
}
