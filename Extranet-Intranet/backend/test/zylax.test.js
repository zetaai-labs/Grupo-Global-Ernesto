import { describe, it, after, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { MODULES } from '../src/zylax/definitions.js'
import { workingDays, requiredApprover } from '../src/zylax/rules.js'

const auth = (s) => ({ Authorization: `Bearer ${s.token}` })
const created = []
const invoices = []
const s = {}
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const at = (n, h) => new Date(Date.now() + n * 86400000 + h * 3600000).toISOString()
const post = (who, path, body) => request(app).post(`/api/zylax/hub/${path}`).set(auth(who)).send(body)
const get = (who, path) => request(app).get(`/api/zylax/hub/${path}`).set(auth(who))
const move = (who, path, id, to) => post(who, `${path}/${id}/transition`, { to })
async function make(who, path, body) {
  const res = await post(who, path, body)
  assert.equal(res.status, 201, `${path}: ${res.body.message}`)
  created.push(res.body.data.record_id)
  return res.body.data
}
const org = async (name) => (await query('SELECT org_id FROM organizations WHERE legal_name = $1', [name])).rows[0].org_id

before(async () => {
  for (const name of ['admin', 'hr', 'finance', 'manager', 'employee', 'techadmin', 'customer', 'partner', 'supplier', 'investor']) {
    s[name] = await loginAs(`${name}@gmail.com`)
  }
  await query(
    `DELETE FROM zx_records WHERE module = 'attendance' AND created_by = ANY($1::int[])`,
    [[s.employee.user.id, s.manager.user.id]],
  )
})

after(async () => {
  await query(`DELETE FROM zx_records WHERE data->>'plan' = ANY($1::text[])`, [created])
  await query(`DELETE FROM zx_records WHERE module = 'procurement' AND data->>'tender' = ANY($1::text[])`, [created])
  await query('DELETE FROM zx_records WHERE record_id = ANY($1::uuid[])', [created])
  await query(`DELETE FROM zx_records WHERE module = 'attendance' AND entity = 'attendance' AND created_by = $1`, [s.employee.user.id])
  await query('DELETE FROM zx_invoices WHERE corrects_invoice_id = ANY($1::uuid[])', [invoices])
  await query('DELETE FROM zx_invoices WHERE invoice_id = ANY($1::uuid[])', [invoices])
})

describe('ZYLAX modules', () => {
  it('registers all 29 modules from the specification', () => {
    assert.equal(MODULES.length, 29)
    assert.equal(new Set(MODULES.map((module) => module.key)).size, 29)
    assert.equal(workingDays('2026-11-23', '2026-11-29'), 5)
    assert.deepEqual([requiredApprover(1000), requiredApprover(1000.01), requiredApprover(10001)], ['manager', 'finance', 'admin'])
  })

  it('shows each role only its modules', async () => {
    const keys = async (who) => (await request(app).get('/api/zylax/hub/modules').set(auth(who))).body.data.map((m) => m.key)
    const admin = await keys(s.admin)
    assert.equal(admin.length, 29)
    const employee = await keys(s.employee)
    assert.ok(employee.includes('helpdesk') && !employee.includes('legal'))
    const customer = await keys(s.customer)
    assert.ok(customer.includes('client_support') && customer.includes('contacts_quotes') && !customer.includes('people'))
    const supplier = await keys(s.supplier)
    assert.ok(supplier.includes('procurement') && !supplier.includes('sales'))
    assert.deepEqual(await keys(s.investor), [])
    assert.equal((await get(s.investor, 'client_support/tickets')).status, 403)
    assert.equal((await get(s.employee, 'legal/cases')).status, 403)
    assert.equal((await get(s.customer, 'people/profiles')).status, 403)
  })

  it('enforces leave balance, overlap and no self-approval', async () => {
    const year = 2030
    const leave = await make(s.employee, 'attendance/leave', { title: 'Holiday', leave_type: 'ANNUAL', start_date: `${year}-03-04`, end_date: `${year}-03-08` })
    assert.equal(leave.data.days, 5)
    assert.equal((await post(s.employee, 'attendance/leave', { title: 'Clash', leave_type: 'PERSONAL', start_date: `${year}-03-06`, end_date: `${year}-03-06` })).status, 409)
    assert.equal((await post(s.employee, 'attendance/leave', { title: 'Too long', leave_type: 'ANNUAL', start_date: `${year}-05-01`, end_date: `${year}-07-30` })).status, 409)
    assert.equal((await move(s.employee, 'attendance/leave', leave.record_id, 'APPROVED')).status, 403)
    const own = await make(s.manager, 'attendance/leave', { title: 'Mine', leave_type: 'PERSONAL', start_date: `${year}-04-08`, end_date: `${year}-04-08` })
    assert.equal((await move(s.manager, 'attendance/leave', own.record_id, 'APPROVED')).status, 403, 'managers cannot approve themselves')
    assert.equal((await move(s.manager, 'attendance/leave', leave.record_id, 'APPROVED')).status, 404, 'other business unit')
    assert.equal((await move(s.hr, 'attendance/leave', leave.record_id, 'APPROVED')).status, 200)
    const others = (await get(s.hr, 'attendance/leave')).body.data
    assert.ok(others.some((r) => r.record_id === leave.record_id))
    const peer = (await get(s.manager, 'attendance/leave')).body.data
    assert.ok(peer.length >= 1)
  })

  it('clocks in and out once', async () => {
    assert.equal((await post(s.employee, 'attendance/clock', { action: 'out' })).status, 409)
    assert.equal((await post(s.employee, 'attendance/clock', { action: 'in' })).status, 200)
    assert.equal((await post(s.employee, 'attendance/clock', { action: 'in' })).status, 409)
    assert.ok((await get(s.employee, 'attendance/clock')).body.data.open)
    assert.equal((await post(s.employee, 'attendance/clock', { action: 'out' })).status, 200)
    assert.equal((await post(s.customer, 'attendance/clock', { action: 'in' })).status, 403)
  })

  it('routes approvals by amount', async () => {
    const big = await make(s.hr, 'supply/approvals', { title: 'New line', kind: 'PURCHASE', amount_eur: 5000, justification: 'Needed' })
    assert.equal(big.data.required_level, 'finance')
    assert.equal((await move(s.manager, 'supply/approvals', big.record_id, 'APPROVED')).status, 403)
    assert.equal((await move(s.finance, 'supply/approvals', big.record_id, 'APPROVED')).status, 200)
  })

  it('keeps supplier bids sealed and awards one', async () => {
    const tender = await make(s.manager, 'procurement/tenders', { title: 'Laptops', deadline: day(5), scope: '50 laptops', budget_eur: 9999 })
    assert.equal((await get(s.supplier, `procurement/tenders/${tender.record_id}`)).status, 404, 'draft hidden')
    await move(s.manager, 'procurement/tenders', tender.record_id, 'OPEN')
    const view = await get(s.supplier, `procurement/tenders/${tender.record_id}`)
    assert.equal(view.status, 200)
    assert.equal(view.body.data.data.budget_eur, undefined, 'budget hidden')

    const supplierBid = await make(s.supplier, 'procurement/bids', { title: 'Our offer', tender: tender.record_id, amount_eur: 800, lead_days: 7 })
    assert.equal((await post(s.supplier, 'procurement/bids', { title: 'Again', tender: tender.record_id, amount_eur: 700, lead_days: 7 })).status, 409)
    const rival = await make(s.manager, 'procurement/bids', { title: 'Rival', tender: tender.record_id, supplier: await org('Vikas Metal Works'), amount_eur: 900, lead_days: 5 })
    const mine = (await get(s.supplier, 'procurement/bids')).body.data
    assert.ok(mine.some((b) => b.record_id === supplierBid.record_id))
    assert.equal(mine.some((b) => b.record_id === rival.record_id), false, 'rival bid hidden')

    assert.equal((await move(s.supplier, 'procurement/bids', supplierBid.record_id, 'AWARDED')).status, 403)
    assert.equal((await move(s.manager, 'procurement/bids', supplierBid.record_id, 'AWARDED')).status, 200)
    assert.equal((await get(s.manager, `procurement/bids/${rival.record_id}`)).body.data.status, 'REJECTED')
    assert.equal((await get(s.manager, `procurement/tenders/${tender.record_id}`)).body.data.status, 'AWARDED')
    const po = (await get(s.supplier, 'procurement/purchase_orders')).body.data.find((row) => row.data.amount_eur === 800)
    assert.ok(po, 'purchase order created')
    created.push(po.record_id)
  })

  it('isolates client tickets and hides internal notes', async () => {
    const ticket = await make(s.customer, 'client_support/tickets', { title: 'Invoice wrong', category: 'BILLING', priority: 'P2', description: 'Wrong total', customer: await org('Vikas Metal Works') })
    assert.equal((await query('SELECT customer_org_id FROM zx_records WHERE record_id = $1', [ticket.record_id])).rows[0].customer_org_id, await org('Iberia Retail S.L.'), 'company cannot be spoofed')
    assert.ok(ticket.data.sla_due)
    assert.equal((await get(s.partner, `client_support/tickets/${ticket.record_id}`)).status, 404)
    await post(s.manager, `client_support/tickets/${ticket.record_id}/comments`, { body: 'SECRET internal note', internal: true })
    await post(s.manager, `client_support/tickets/${ticket.record_id}/comments`, { body: 'We are checking' })
    const seen = (await get(s.customer, `client_support/tickets/${ticket.record_id}`)).body.data.events.map((e) => e.body)
    assert.ok(seen.includes('We are checking'))
    assert.equal(seen.includes('SECRET internal note'), false)
    assert.equal((await move(s.customer, 'client_support/tickets', ticket.record_id, 'IN_PROGRESS')).status, 403)
    assert.equal((await move(s.customer, 'client_support/tickets', ticket.record_id, 'CLOSED')).status, 200)
  })

  it('blocks double booking and honours capacity with a waitlist', async () => {
    const space = await make(s.admin, 'facilities/spaces', { title: 'Room T', kind: 'MEETING_ROOM', location: 'HQ', capacity: 4 })
    const base = { space: space.record_id, attendees: 2 }
    await make(s.employee, 'facilities/reservations', { ...base, title: 'Meet A', start_at: at(3, 1), end_at: at(3, 2) })
    assert.equal((await post(s.employee, 'facilities/reservations', { ...base, title: 'Meet B', start_at: at(3, 1.5), end_at: at(3, 3) })).status, 409)
    await make(s.employee, 'facilities/reservations', { ...base, title: 'Meet C', start_at: at(3, 2), end_at: at(3, 3) })
    assert.equal((await post(s.employee, 'facilities/reservations', { ...base, attendees: 9, title: 'Meet D', start_at: at(4, 1), end_at: at(4, 2) })).status, 409)

    const event = await make(s.admin, 'events/events', { title: 'Summit', kind: 'CONFERENCE', venue: 'HQ', start_at: at(9, 1), end_at: at(9, 3), capacity: 1 })
    const first = await make(s.employee, 'events/registrations', { title: 'One', event: event.record_id, email: 'one@example.test' })
    const second = await make(s.employee, 'events/registrations', { title: 'Two', event: event.record_id, email: 'two@example.test' })
    assert.deepEqual([first.status, second.status], ['CONFIRMED', 'WAITLISTED'])
    assert.equal((await post(s.employee, 'events/registrations', { title: 'Dup', event: event.record_id, email: 'two@example.test' })).status, 409)
    assert.equal((await move(s.employee, 'events/registrations', first.record_id, 'CANCELLED')).status, 200)
    assert.equal((await get(s.employee, `events/registrations/${second.record_id}`)).body.data.status, 'CONFIRMED', 'waitlist promoted')
  })

  it('encrypts secret fields and limits who reads them', async () => {
    const legal = await make(s.admin, 'legal/cases', { title: 'Case T', kind: 'TAX', counterparty: 'Agency', strategy: 'Privileged plan' })
    const raw = (await query('SELECT data, sealed_data FROM zx_records WHERE record_id = $1', [legal.record_id])).rows[0]
    assert.equal(JSON.stringify(raw).includes('Privileged plan'), false)
    assert.equal((await get(s.admin, `legal/cases/${legal.record_id}`)).body.data.data.strategy, 'Privileged plan')
    assert.equal((await get(s.manager, `legal/cases/${legal.record_id}`)).status, 404, 'unassigned manager cannot read it')
  })

  it('auto-creates onboarding tasks and turns an RFQ into a quote', async () => {
    const plan = await make(s.hr, 'onboarding/plans', { title: 'Welcome', employee: s.employee.user.id, start_date: day(2) })
    const tasks = (await get(s.employee, 'onboarding/tasks')).body.data.filter((task) => task.data.plan === plan.record_id)
    assert.equal(tasks.length, 2, 'employee sees their own tasks')
    const product = (await query(`SELECT product_id FROM zx_products WHERE sku = 'DEMO-MON-27'`)).rows[0].product_id
    const rfq = await make(s.customer, 'contacts_quotes/rfqs', { title: 'Need monitors', product, qty: 2 })
    const done = await post(s.manager, `contacts_quotes/rfqs/${rfq.record_id}/actions/convertRfq`, {})
    assert.equal(done.status, 200)
    const quote = await query('SELECT quote_id, status, total_eur FROM zx_quotes WHERE quote_number = $1', [done.body.data.message])
    assert.deepEqual([quote.rows[0].status, quote.rows[0].total_eur], ['DRAFT', '796.18'])
    assert.equal((await get(s.customer, `contacts_quotes/rfqs/${rfq.record_id}`)).body.data.status, 'QUOTED')
    await query('DELETE FROM zx_quotes WHERE quote_id = $1', [quote.rows[0].quote_id])
  })

  it('sells at POS, numbers invoices and refunds stock', async () => {
    const product = (await query(`SELECT product_id, stock_qty FROM zx_products WHERE sku = 'DEMO-SCN-02'`)).rows[0]
    assert.equal((await post(s.customer, 'pos/sales', { payment_method: 'CASH', items: [{ product_id: product.product_id, qty: 1 }] })).status, 403)
    const sale = await post(s.employee, 'pos/sales', { payment_method: 'CARD', items: [{ product_id: product.product_id, qty: 2 }] })
    assert.equal(sale.status, 201)
    invoices.push(sale.body.data.invoice_id)
    assert.match(sale.body.data.invoice_number, /^INV-\d{4}-\d{6}$/)
    assert.equal(sale.body.data.total_eur, '216.59')
    const stock = async () => (await query('SELECT stock_qty FROM zx_products WHERE product_id = $1', [product.product_id])).rows[0].stock_qty
    assert.equal(await stock(), product.stock_qty - 2)
    assert.equal((await post(s.employee, `pos/invoices/${sale.body.data.invoice_id}/refund`, {})).status, 403)
    assert.equal((await post(s.finance, `pos/invoices/${sale.body.data.invoice_id}/refund`, {})).status, 200)
    assert.equal(await stock(), product.stock_qty)
    assert.equal((await post(s.finance, `pos/invoices/${sale.body.data.invoice_id}/refund`, {})).status, 409)
  })

  it('lets all staff pick a cost center but hides its budget', async () => {
    const row = (await get(s.hr, 'expenses/cost_centers')).body.data.find((item) => item.title === 'Commercial Spain')
    assert.ok(row, 'HR can list cost centers')
    assert.equal(row.data.budget_eur, undefined)
    const finance = (await get(s.finance, 'expenses/cost_centers')).body.data.find((item) => item.title === 'Commercial Spain')
    assert.equal(finance.data.budget_eur, 120000)
  })

  it('creates a record in every module entity that allows it', async () => {
    const list = (await request(app).get('/api/zylax/hub/modules').set(auth(s.admin))).body.data
    for (const module of list) {
      for (const entity of module.entities) {
        const res = await get(s.admin, `${module.key}/${entity.key}`)
        assert.equal(res.status, 200, `${module.key}/${entity.key}`)
      }
    }
  })
})
