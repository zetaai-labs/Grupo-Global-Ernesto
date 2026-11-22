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

export async function clockStatus(req, res) {
  if (!STAFF_ROLES.includes(req.user.role)) throw httpError(403, 'Staff only.')
  const year = String(new Date().getUTCFullYear())
  const [open, used] = await Promise.all([
    query(`SELECT record_id, data FROM zx_records WHERE module = 'attendance' AND entity = 'attendance' AND assigned_to = $1 AND status = 'OPEN' LIMIT 1`, [req.user.sub]),
    query(
      `SELECT COALESCE(sum((data->>'days')::numeric), 0) AS days FROM zx_records
       WHERE module = 'attendance' AND entity = 'leave' AND created_by = $1 AND status IN ('SUBMITTED', 'APPROVED')
       AND data->>'leave_type' = 'ANNUAL' AND left(data->>'start_date', 4) = $2`,
      [req.user.sub, year],
    ),
  ])
  return res.json({ data: { open: open.rows[0] ? { record_id: open.rows[0].record_id, clock_in: open.rows[0].data.clock_in } : null, leave_total: ANNUAL_LEAVE_DAYS, leave_used: Number(used.rows[0].days) } })
}

export async function clock(req, res) {
  if (!STAFF_ROLES.includes(req.user.role)) throw httpError(403, 'Staff only.')
  const action = req.body?.action
  if (!['in', 'out'].includes(action)) throw httpError(400, 'Invalid clock action.')
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
    if (!open.rows[0]) throw httpError(409, 'You are not clocked in.')
    const hours = Math.round(((now - new Date(open.rows[0].data.clock_in)) / 3600000) * 100) / 100
    await client.query(
      `UPDATE zx_records SET status = 'CLOSED', data = data || $2::jsonb, updated_at = now() WHERE record_id = $1`,
      [open.rows[0].record_id, JSON.stringify({ clock_out: now.toISOString(), hours })],
    )
    await client.query(`INSERT INTO zx_record_events (record_id, kind, from_status, to_status, created_by) VALUES ($1, 'status', 'OPEN', 'CLOSED', $2)`, [open.rows[0].record_id, req.user.sub])
    return { state: 'out', record_id: open.rows[0].record_id, hours }
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

async function nextInvoiceNumber(client) {
  const year = new Date().getUTCFullYear()
  const { rows } = await client.query(
    `INSERT INTO zx_counters (name, value) VALUES ($1, 1)
     ON CONFLICT (name) DO UPDATE SET value = zx_counters.value + 1 RETURNING value`,
    [`invoice-${year}`],
  )
  return `INV-${year}-${String(rows[0].value).padStart(6, '0')}`
}

async function insertInvoice(client, invoice, lines) {
  const number = await nextInvoiceNumber(client)
  const { rows } = await client.query(
    `INSERT INTO zx_invoices (invoice_number, source, order_id, customer_org_id, customer_name, status, payment_method, net_eur, tax_eur, total_eur, owner_org_id, created_by, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $6 = 'PAID' THEN now() END) RETURNING *`,
    [number, invoice.source, invoice.order_id || null, invoice.customer_org_id || null, invoice.customer_name || null, invoice.status, invoice.payment_method || null, invoice.net_eur, invoice.tax_eur, invoice.total_eur, invoice.owner_org_id || null, invoice.created_by],
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
  if (!['CASH', 'CARD', 'TRANSFER'].includes(method)) throw httpError(400, 'Choose a payment method.')
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
      source: 'POS', status: 'PAID', payment_method: method, customer_name: customerName ? String(customerName).trim().slice(0, 255) : null,
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
    `SELECT invoice_id, invoice_number, status, payment_method, net_eur, tax_eur, total_eur, created_at, paid_at
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
    if (row.status !== 'ISSUED') throw httpError(409, 'Only issued invoices can be paid.')
    const { rows } = await client.query(`UPDATE zx_invoices SET status = 'PAID', payment_method = $2, paid_at = now() WHERE invoice_id = $1 RETURNING *`, [row.invoice_id, method])
    return rows[0]
  })
  await writeAudit(req.user.sub, 'ZX_INVOICE_PAID', 'zx_invoices', invoice.invoice_id, { method })
  return res.json({ data: invoice })
}

export async function refundInvoice(req, res) {
  if (!['admin', 'finance', 'manager'].includes(req.user.role)) throw httpError(403, 'You cannot refund invoices.')
  const invoice = await withTransaction(async (client) => {
    const row = await lockedInvoice(client, req)
    if (row.status !== 'PAID') throw httpError(409, 'Only paid invoices can be refunded.')
    if (row.source === 'POS') {
      const lines = await client.query('SELECT product_id, qty FROM zx_invoice_lines WHERE invoice_id = $1 ORDER BY product_id', [row.invoice_id])
      for (const line of lines.rows) {
        await client.query('UPDATE zx_products SET stock_qty = stock_qty + $2, updated_at = now() WHERE product_id = $1', [line.product_id, line.qty])
      }
    }
    const { rows } = await client.query(`UPDATE zx_invoices SET status = 'REFUNDED', refunded_at = now() WHERE invoice_id = $1 RETURNING *`, [row.invoice_id])
    return rows[0]
  })
  await writeAudit(req.user.sub, 'ZX_INVOICE_REFUNDED', 'zx_invoices', invoice.invoice_id, { total: invoice.total_eur })
  return res.json({ data: invoice })
}
