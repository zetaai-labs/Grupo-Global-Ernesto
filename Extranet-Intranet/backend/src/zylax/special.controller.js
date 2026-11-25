import { query, withTransaction } from '../config/database.js'
import { COMMERCIAL_CUSTOMER_ROLES, COMMERCIAL_READ_ROLES, STAFF_ROLES } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { priceLine, totals } from '../services/commercial.service.js'
import { orgPredicate } from '../services/scope.js'
import { findEntity } from './definitions.js'
import { insertRecord } from './engine.controller.js'
import { ANNUAL_LEAVE_DAYS, httpError, lock } from './rules.js'

/** ZYLAX screens that need more than the record engine: clock, muster, catalog, POS and invoicing. */

const POS_ROLES = ['admin', 'manager', 'employee']
const BILLING_ROLES = ['admin', 'manager', 'finance']
const UUID = /^[0-9a-f-]{36}$/i
const billingScope = (user) => (user.role === 'finance' ? null : user.org_scope ?? null)
/** Work starts at 09:00 Madrid time with a 15-minute grace period. */
const LATE_AFTER_MINUTES = 9 * 60 + 15

function madridMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Number(parts.find((part) => part.type === 'hour').value) * 60 + Number(parts.find((part) => part.type === 'minute').value)
}

// ----- Attendance clock -----

const CLOCK_ACTIONS = ['in', 'out', 'break_start', 'break_end']
/** Shifts left open longer than this are flagged so HR can correct a forgotten clock-out. */
const LONG_SHIFT_SECONDS = 14 * 3600

/** Seconds of the shift's breaks; an open break counts up to `now`. */
export function breakSeconds(breaks = [], now = new Date()) {
  return breaks.reduce((sum, item) => sum + Math.max(0, ((item.end ? new Date(item.end) : now) - new Date(item.start)) / 1000), 0)
}

/** Net worked seconds: time since clock-in minus breaks. */
export function workedSeconds(data, now = new Date()) {
  const end = data.clock_out ? new Date(data.clock_out) : now
  return Math.max(0, Math.round((end - new Date(data.clock_in)) / 1000 - breakSeconds(data.breaks, end)))
}

const openBreak = (data) => (data.breaks || []).find((item) => !item.end) || null

function presentShift(row, now = new Date()) {
  if (!row) return null
  const current = openBreak(row.data)
  return {
    record_id: row.record_id,
    clock_in: row.data.clock_in,
    late: Boolean(row.data.late),
    on_break: Boolean(current),
    break_started_at: current?.start || null,
    break_seconds: Math.round(breakSeconds(row.data.breaks, now)),
    breaks: (row.data.breaks || []).length,
    worked_seconds: workedSeconds(row.data, now),
    long_shift: workedSeconds(row.data, now) > LONG_SHIFT_SECONDS,
  }
}

/** Closed shifts' net seconds (older entries only stored decimal hours). */
const closedSeconds = (filter) => `COALESCE(sum(COALESCE((data->>'worked_seconds')::numeric, (data->>'hours')::numeric * 3600, 0)) FILTER (WHERE ${filter}), 0)`

export async function clockStatus(req, res) {
  if (!STAFF_ROLES.includes(req.user.role)) throw httpError(403, 'Staff only.')
  const year = String(new Date().getUTCFullYear())
  const madridDay = `((data->>'clock_in')::timestamptz AT TIME ZONE 'Europe/Madrid')::date`
  const today = `(now() AT TIME ZONE 'Europe/Madrid')::date`
  const [open, used, totals] = await Promise.all([
    query(`SELECT record_id, data FROM zx_records WHERE module = 'attendance' AND entity = 'attendance' AND assigned_to = $1 AND status = 'OPEN' LIMIT 1`, [req.user.sub]),
    query(
      `SELECT COALESCE(sum((data->>'days')::numeric), 0) AS days FROM zx_records
       WHERE module = 'attendance' AND entity = 'leave' AND created_by = $1 AND status IN ('SUBMITTED', 'APPROVED')
       AND data->>'leave_type' = 'ANNUAL' AND left(data->>'start_date', 4) = $2`,
      [req.user.sub, year],
    ),
    query(
      `SELECT ${closedSeconds(`${madridDay} = ${today}`)} AS today,
              ${closedSeconds(`${madridDay} >= date_trunc('week', ${today})::date`)} AS week
       FROM zx_records WHERE module = 'attendance' AND entity = 'attendance' AND assigned_to = $1 AND status = 'CLOSED'
       AND (data->>'clock_in')::timestamptz > now() - interval '8 days'`,
      [req.user.sub],
    ),
  ])
  const now = new Date()
  const shift = presentShift(open.rows[0], now)
  const running = shift?.worked_seconds || 0
  return res.json({ data: {
    server_now: now.toISOString(),
    open: shift,
    // The open shift counts toward today/this week (a shift is filed under the day it started).
    today_seconds: Math.round(Number(totals.rows[0].today) + running),
    week_seconds: Math.round(Number(totals.rows[0].week) + running),
    leave_total: ANNUAL_LEAVE_DAYS,
    leave_used: Number(used.rows[0].days),
  } })
}

export async function clock(req, res) {
  if (!STAFF_ROLES.includes(req.user.role)) throw httpError(403, 'Staff only.')
  const action = req.body?.action
  if (!CLOCK_ACTIONS.includes(action)) throw httpError(400, 'Invalid clock action.')
  const def = findEntity('attendance', 'attendance')
  const result = await withTransaction(async (client) => {
    await lock(client, `zx-clock-${req.user.sub}`)
    const open = await client.query(
      `SELECT record_id, data FROM zx_records WHERE module = 'attendance' AND entity = 'attendance' AND assigned_to = $1 AND status = 'OPEN' FOR UPDATE`,
      [req.user.sub],
    )
    const now = new Date()
    if (action === 'in') {
      if (open.rows[0]) throw httpError(409, 'You are already clocked in.')
      const title = `${req.user.name} · ${now.toISOString().slice(0, 10)}`
      const row = await insertRecord(client, 'attendance', def, {
        title, status: 'OPEN', assigned_to: req.user.sub,
        data: { clock_in: now.toISOString(), late: madridMinutes(now) > LATE_AFTER_MINUTES },
      }, req.user.sub, req.user.org_id)
      return { state: 'in', record_id: row.record_id, clock_in: row.data.clock_in, late: row.data.late }
    }
    const shift = open.rows[0]
    if (!shift) throw httpError(409, 'You are not clocked in.')
    const breaks = [...(shift.data.breaks || [])]
    const current = openBreak(shift.data)

    if (action === 'break_start' || action === 'break_end') {
      if (action === 'break_start' && current) throw httpError(409, 'You are already on a break.')
      if (action === 'break_end' && !current) throw httpError(409, 'You are not on a break.')
      if (action === 'break_start') breaks.push({ start: now.toISOString(), end: null })
      else breaks[breaks.indexOf(current)] = { ...current, end: now.toISOString() }
      await client.query(
        `UPDATE zx_records SET data = data || $2::jsonb, updated_at = now() WHERE record_id = $1`,
        [shift.record_id, JSON.stringify({ breaks })],
      )
      return { state: action === 'break_start' ? 'break' : 'in', record_id: shift.record_id, worked_seconds: workedSeconds({ ...shift.data, breaks }, now) }
    }

    // Clocking out ends a break that was left running.
    if (current) breaks[breaks.indexOf(current)] = { ...current, end: now.toISOString() }
    const final = { ...shift.data, breaks, clock_out: now.toISOString() }
    const worked = workedSeconds(final, now)
    const pause = Math.round(breakSeconds(breaks, now))
    const hours = Math.round((worked / 3600) * 100) / 100
    await client.query(
      `UPDATE zx_records SET status = 'CLOSED', data = data || $2::jsonb, updated_at = now() WHERE record_id = $1`,
      [shift.record_id, JSON.stringify({ clock_out: final.clock_out, breaks, worked_seconds: worked, break_minutes: Math.round(pause / 60), hours })],
    )
    await client.query(`INSERT INTO zx_record_events (record_id, kind, from_status, to_status, created_by) VALUES ($1, 'status', 'OPEN', 'CLOSED', $2)`, [shift.record_id, req.user.sub])
    return { state: 'out', record_id: shift.record_id, hours, worked_seconds: worked, break_seconds: pause }
  })
  await writeAudit(req.user.sub, 'ZX_CLOCK', 'zx:attendance', result.record_id, { action })
  return res.json({ data: result })
}

// ----- Emergency roster -----

export async function musterRoster(req, res) {
  if (!['admin', 'hr', 'manager'].includes(req.user.role)) throw httpError(403, 'Safety managers only.')
  if (!UUID.test(req.params.id)) throw httpError(400, 'Invalid id.')
  const { rows } = await query(
    `SELECT u.id, u.name, r.name AS role, m.state, m.location, m.at
     FROM users u JOIN roles r ON r.id = u.role_id
     LEFT JOIN LATERAL (
       SELECT z.data->>'state' AS state, z.data->>'location' AS location, z.created_at AS at
       FROM zx_records z WHERE z.module = 'safety' AND z.entity = 'musters' AND z.created_by = u.id AND z.data->>'emergency' = $1
       ORDER BY z.created_at DESC LIMIT 1
     ) m ON true
     WHERE u.status = 'active' AND r.name = ANY($2::text[]) ORDER BY m.state NULLS FIRST, u.name`,
    [req.params.id, STAFF_ROLES],
  )
  const summary = { total: rows.length, safe: 0, needs_help: 0, off_site: 0, unaccounted: 0 }
  for (const row of rows) {
    if (row.state === 'SAFE') summary.safe += 1
    else if (row.state === 'NEEDS_HELP') summary.needs_help += 1
    else if (row.state === 'OFF_SITE') summary.off_site += 1
    else summary.unaccounted += 1
  }
  return res.json({ data: rows, meta: summary })
}

// ----- Interactive catalog -----

export async function catalog(req, res) {
  if (![...COMMERCIAL_READ_ROLES, ...COMMERCIAL_CUSTOMER_ROLES].includes(req.user.role)) throw httpError(403, 'No access to the catalog.')
  const params = []
  const filters = ['p.active']
  if (req.query.q) {
    params.push(`%${String(req.query.q).slice(0, 100)}%`)
    filters.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.category ILIKE $${params.length})`)
  }
  const { rows } = await query(
    `SELECT p.product_id, p.sku, p.name, p.description, p.specifications, p.category, p.unit_price_eur, p.tax_rate, p.stock_qty > 0 AS in_stock
     FROM zx_products p WHERE ${filters.join(' AND ')} ORDER BY p.category, p.name LIMIT 500`,
    params,
  )
  return res.json({ data: rows })
}

// ----- POS and invoicing -----

/** Standard and corrective invoices use separate consecutive series. */
async function nextInvoiceNumber(client, corrective = false) {
  const year = new Date().getUTCFullYear()
  const { rows } = await client.query(
    `INSERT INTO zx_counters (name, value) VALUES ($1, 1)
     ON CONFLICT (name) DO UPDATE SET value = zx_counters.value + 1 RETURNING value`,
    [`${corrective ? 'corrective' : 'invoice'}-${year}`],
  )
  return `${corrective ? 'RECT' : 'INV'}-${year}-${String(rows[0].value).padStart(6, '0')}`
}

/** Freezes company details on the invoice, so later edits never change an issued document. */
async function partySnapshots(client, customerOrgId) {
  const seller = (await client.query(`SELECT legal_name, tax_id, country, billing_address FROM organizations WHERE org_type = 'PARENT' ORDER BY created_at LIMIT 1`)).rows[0]
  const buyer = customerOrgId
    ? (await client.query('SELECT legal_name, tax_id, country, billing_address FROM organizations WHERE org_id = $1', [customerOrgId])).rows[0]
    : null
  const party = (row, fallback = null) => (row ? { name: row.legal_name, tax_id: row.tax_id, country: row.country, address: row.billing_address || fallback } : null)
  return { seller: party(seller, process.env.COMPANY_ADDRESS || null), buyer: party(buyer) }
}

export async function insertInvoice(client, invoice, lines) {
  const corrective = invoice.kind === 'CORRECTIVE'
  const number = await nextInvoiceNumber(client, corrective)
  const parties = corrective
    ? { seller: invoice.seller_snapshot, buyer: invoice.buyer_snapshot }
    : await partySnapshots(client, invoice.customer_org_id)
  const { rows } = await client.query(
    `INSERT INTO zx_invoices (invoice_number, source, order_id, customer_org_id, customer_name, status, payment_method, net_eur, tax_eur, total_eur, owner_org_id, created_by, paid_at,
                              kind, corrects_invoice_id, correction_reason, seller_snapshot, buyer_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6::text, $7, $8, $9, $10, $11, $12, CASE WHEN $6::text = 'PAID' THEN now() END, $13, $14, $15, $16, $17) RETURNING *`,
    [number, invoice.source, invoice.order_id || null, invoice.customer_org_id || null, invoice.customer_name || null, invoice.status, invoice.payment_method || null, invoice.net_eur, invoice.tax_eur, invoice.total_eur, invoice.owner_org_id || null, invoice.created_by,
      corrective ? 'CORRECTIVE' : 'STANDARD', invoice.corrects_invoice_id || null, invoice.correction_reason || null,
      parties.seller ? JSON.stringify(parties.seller) : null, parties.buyer ? JSON.stringify(parties.buyer) : null],
  )
  for (const l of lines) {
    await client.query(
      `INSERT INTO zx_invoice_lines (invoice_id, product_id, sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [rows[0].invoice_id, l.product_id, l.sku, l.name, l.qty, l.unit_price_eur, l.discount_pct || 0, l.tax_rate, l.net_eur, l.tax_eur],
    )
  }
  return rows[0]
}

export async function posSale(req, res) {
  if (!POS_ROLES.includes(req.user.role)) throw httpError(403, 'You cannot use the POS.')
  const { items, payment_method: method, customer_name: customerName } = req.body || {}
  if (!['CASH', 'CARD', 'TRANSFER', 'TERMINAL'].includes(method)) throw httpError(400, 'Choose a payment method.')
  if (!Array.isArray(items) || !items.length || items.length > 200) throw httpError(400, 'Add at least one product.')
  const merged = new Map()
  for (const item of items) {
    const qty = Number(item?.qty)
    if (!UUID.test(String(item?.product_id)) || !Number.isInteger(qty) || qty <= 0 || qty > 1e6) throw httpError(400, 'Invalid sale line.')
    merged.set(item.product_id, (merged.get(item.product_id) || 0) + qty)
  }
  const ids = [...merged.keys()].sort()
  const invoice = await withTransaction(async (client) => {
    const lines = []
    for (const id of ids) {
      const qty = merged.get(id)
      const { rows } = await client.query(
        `UPDATE zx_products p SET stock_qty = stock_qty - $2, updated_at = now()
         WHERE p.product_id = $1 AND p.active AND p.stock_qty >= $2 AND ${orgPredicate('p.owner_org_id', '$3')}
         RETURNING product_id, sku, name, unit_price_eur, tax_rate`,
        [id, qty, req.user.org_scope ?? null],
      )
      if (!rows[0]) throw httpError(409, 'A product is unavailable or has insufficient stock.')
      lines.push({ ...rows[0], qty, ...priceLine({ qty, unit_price_eur: rows[0].unit_price_eur, tax_rate: rows[0].tax_rate }) })
    }
    const sum = totals(lines)
    return insertInvoice(client, {
      source: 'POS', status: method === 'TERMINAL' ? 'ISSUED' : 'PAID', payment_method: method === 'TERMINAL' ? null : method, customer_name: customerName ? String(customerName).trim().slice(0, 255) : null,
      ...sum, owner_org_id: req.user.org_id, created_by: req.user.sub,
    }, lines)
  })
  await writeAudit(req.user.sub, 'ZX_POS_SALE', 'zx_invoices', invoice.invoice_id, { total: invoice.total_eur, method })
  return res.status(201).json({ data: invoice })
}

export async function listInvoices(req, res) {
  if (![...BILLING_ROLES, 'employee'].includes(req.user.role)) throw httpError(403, 'No access to invoices.')
  const params = [billingScope(req.user)]
  let where = orgPredicate('i.owner_org_id', '$1')
  if (req.user.role === 'employee') {
    params.push(req.user.sub)
    where += ` AND i.created_by = $${params.length}`
  }
  const { rows } = await query(
    `SELECT i.*, o.legal_name AS customer FROM zx_invoices i LEFT JOIN organizations o ON o.org_id = i.customer_org_id
     WHERE ${where} ORDER BY i.created_at DESC LIMIT 500`,
    params,
  )
  return res.json({ data: rows })
}

export async function myInvoices(req, res) {
  if (!COMMERCIAL_CUSTOMER_ROLES.includes(req.user.role)) throw httpError(403, 'No access to invoices.')
  const { rows } = await query(
    `SELECT invoice_id, invoice_number, kind, status, payment_method, net_eur, tax_eur, total_eur, created_at, paid_at
     FROM zx_invoices WHERE customer_org_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [req.user.org_id],
  )
  return res.json({ data: rows })
}

export async function invoiceOrder(req, res) {
  if (!BILLING_ROLES.includes(req.user.role)) throw httpError(403, 'You cannot issue invoices.')
  if (!UUID.test(req.params.orderId)) throw httpError(400, 'Invalid id.')
  const invoice = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM zx_orders x WHERE x.order_id = $1 AND ${orgPredicate('x.owner_org_id', '$2')} FOR UPDATE`,
      [req.params.orderId, billingScope(req.user)],
    )
    const order = rows[0]
    if (!order) throw httpError(404, 'Order not found.')
    if (order.status === 'CANCELLED') throw httpError(409, 'A cancelled order cannot be invoiced.')
    const existing = await client.query('SELECT invoice_number FROM zx_invoices WHERE order_id = $1', [order.order_id])
    if (existing.rows[0]) throw httpError(409, `Already invoiced: ${existing.rows[0].invoice_number}.`)
    const buyer = await client.query('SELECT billing_address FROM organizations WHERE org_id = $1', [order.customer_org_id])
    if (!buyer.rows[0]?.billing_address?.trim()) throw httpError(409, 'Add the customer billing address before invoicing.')
    const lines = await client.query(
      'SELECT product_id, sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur FROM zx_quote_lines WHERE quote_id = $1',
      [order.quote_id],
    )
    return insertInvoice(client, {
      source: 'ORDER', order_id: order.order_id, customer_org_id: order.customer_org_id, status: 'ISSUED',
      net_eur: order.net_eur, tax_eur: order.tax_eur, total_eur: order.total_eur, owner_org_id: order.owner_org_id, created_by: req.user.sub,
    }, lines.rows)
  })
  await writeAudit(req.user.sub, 'ZX_INVOICE_ISSUED', 'zx_invoices', invoice.invoice_id, { order_id: req.params.orderId })
  return res.status(201).json({ data: invoice })
}

async function lockedInvoice(client, req) {
  if (!UUID.test(req.params.id)) throw httpError(400, 'Invalid id.')
  const { rows } = await client.query(
    `SELECT * FROM zx_invoices i WHERE i.invoice_id = $1 AND ${orgPredicate('i.owner_org_id', '$2')} FOR UPDATE`,
    [req.params.id, billingScope(req.user)],
  )
  if (!rows[0]) throw httpError(404, 'Invoice not found.')
  return rows[0]
}

export async function payInvoice(req, res) {
  if (!['admin', 'finance'].includes(req.user.role)) throw httpError(403, 'Only finance can record payments.')
  const method = req.body?.payment_method
  if (!['CASH', 'CARD', 'TRANSFER'].includes(method)) throw httpError(400, 'Choose a payment method.')
  const invoice = await withTransaction(async (client) => {
    const row = await lockedInvoice(client, req)
    if (row.kind === 'CORRECTIVE') throw httpError(409, 'A corrective invoice cannot be paid.')
    if (row.status !== 'ISSUED') throw httpError(409, 'Only issued invoices can be paid.')
    const { rows } = await client.query(`UPDATE zx_invoices SET status = 'PAID', payment_method = $2, paid_at = now() WHERE invoice_id = $1 RETURNING *`, [row.invoice_id, method])
    return rows[0]
  })
  await writeAudit(req.user.sub, 'ZX_INVOICE_PAID', 'zx_invoices', invoice.invoice_id, { method })
  return res.json({ data: invoice })
}

/** Cancels an issued, unpaid invoice. A corrective invoice with negative amounts records it, as the law requires. */
export async function cancelInvoice(req, res) {
  if (!['admin', 'finance'].includes(req.user.role)) throw httpError(403, 'Only Finance can cancel invoices.')
  const reason = String(req.body?.reason || '').trim().slice(0, 500)
  if (reason.length < 3) throw httpError(400, 'Give a reason for the cancellation.')
  const { invoice, corrective } = await withTransaction(async (client) => {
    const row = await lockedInvoice(client, req)
    if (row.kind === 'CORRECTIVE') throw httpError(409, 'A corrective invoice cannot be cancelled.')
    if (row.status !== 'ISSUED') throw httpError(409, 'Only unpaid invoices can be cancelled. Refund paid ones instead.')
    const { rows } = await client.query(`UPDATE zx_invoices SET status = 'CANCELLED', cancelled_at = now() WHERE invoice_id = $1 RETURNING *`, [row.invoice_id])
    const originals = await client.query('SELECT product_id, sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur FROM zx_invoice_lines WHERE invoice_id = $1', [row.invoice_id])
    const negative = (value) => (-Number(value)).toFixed(2)
    const correction = await insertInvoice(client, {
      kind: 'CORRECTIVE', source: row.source, customer_org_id: row.customer_org_id, customer_name: row.customer_name, status: 'ISSUED',
      net_eur: negative(row.net_eur), tax_eur: negative(row.tax_eur), total_eur: negative(row.total_eur), owner_org_id: row.owner_org_id, created_by: req.user.sub,
      corrects_invoice_id: row.invoice_id, correction_reason: reason, seller_snapshot: row.seller_snapshot, buyer_snapshot: row.buyer_snapshot,
    }, originals.rows.map((line) => ({ ...line, qty: -line.qty, net_eur: negative(line.net_eur), tax_eur: negative(line.tax_eur) })))
    return { invoice: rows[0], corrective: correction }
  })
  await writeAudit(req.user.sub, 'ZX_INVOICE_CANCELLED', 'zx_invoices', invoice.invoice_id, { corrective: corrective.invoice_number })
  return res.json({ data: { ...invoice, corrective_invoice_number: corrective.invoice_number } })
}

export async function refundInvoice(req, res) {
  if (!['admin', 'finance', 'manager'].includes(req.user.role)) throw httpError(403, 'You cannot refund invoices.')
  const reason = String(req.body?.reason || '').trim().slice(0, 500) || 'Customer refund'
  const { invoice, corrective } = await withTransaction(async (client) => {
    const row = await lockedInvoice(client, req)
    if (row.kind === 'CORRECTIVE') throw httpError(409, 'A corrective invoice cannot be refunded.')
    if (row.status !== 'PAID') throw httpError(409, 'Only paid invoices can be refunded.')
    if (row.source === 'POS') {
      const lines = await client.query('SELECT product_id, qty FROM zx_invoice_lines WHERE invoice_id = $1 ORDER BY product_id', [row.invoice_id])
      for (const line of lines.rows) {
        await client.query('UPDATE zx_products SET stock_qty = stock_qty + $2, updated_at = now() WHERE product_id = $1', [line.product_id, line.qty])
      }
    }
    const { rows } = await client.query(`UPDATE zx_invoices SET status = 'REFUNDED', refunded_at = now() WHERE invoice_id = $1 RETURNING *`, [row.invoice_id])
    const originals = await client.query('SELECT product_id, sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur FROM zx_invoice_lines WHERE invoice_id = $1', [row.invoice_id])
    const negative = (value) => (-Number(value)).toFixed(2)
    const correction = await insertInvoice(client, {
      kind: 'CORRECTIVE', source: row.source, customer_org_id: row.customer_org_id, customer_name: row.customer_name, status: 'ISSUED', payment_method: row.payment_method,
      net_eur: negative(row.net_eur), tax_eur: negative(row.tax_eur), total_eur: negative(row.total_eur), owner_org_id: row.owner_org_id, created_by: req.user.sub,
      corrects_invoice_id: row.invoice_id, correction_reason: reason, seller_snapshot: row.seller_snapshot, buyer_snapshot: row.buyer_snapshot,
    }, originals.rows.map((line) => ({ ...line, qty: -line.qty, net_eur: negative(line.net_eur), tax_eur: negative(line.tax_eur) })))
    return { invoice: rows[0], corrective: correction }
  })
  await writeAudit(req.user.sub, 'ZX_INVOICE_REFUNDED', 'zx_invoices', invoice.invoice_id, { total: invoice.total_eur, corrective: corrective.invoice_number })
  return res.json({ data: { ...invoice, corrective_invoice_id: corrective.invoice_id, corrective_invoice_number: corrective.invoice_number } })
}
