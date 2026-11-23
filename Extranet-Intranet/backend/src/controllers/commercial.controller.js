import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { CORRIDORS, COMMERCIAL_MANAGE_ROLES } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { orgPredicate } from '../services/scope.js'
import { ORDER_TRANSITIONS, maxDiscount, priceLine, totals } from '../services/commercial.service.js'

/** ZYLAX commercial core: Catalog, Contacts, Distributors, Quotes and Orders. */

const CUSTOMER_TYPES = ['CLIENT', 'STRATEGIC_PARTNER', 'DELEGATION_NODE']
const TERRITORIES = CORRIDORS.map(([code]) => code)
const httpError = (status, message) => Object.assign(new Error(message), { status })
// Finance is a group-wide, read-only function here.
const scope = (req) => (req.user.role === 'finance' ? null : req.user.org_scope ?? null)
const isManager = (user) => COMMERCIAL_MANAGE_ROLES.includes(user.role)
const parse = (schema, body) => {
  const result = schema.safeParse(body || {})
  if (!result.success) throw httpError(400, result.error.issues[0]?.message || 'Invalid data.')
  return result.data
}
const optionalText = (max) => z.string().trim().max(max).nullable().optional()

export function validateId(req, res, next, value) {
  if (!z.string().uuid().safeParse(value).success) return res.status(400).json({ message: 'Invalid id.' })
  return next()
}

function requireManager(req) {
  if (!isManager(req.user)) throw httpError(403, 'Only managers and administrators can do this.')
}

/** Builds a partial UPDATE from fields already validated by a fixed schema. */
async function updateRow(table, idColumn, id, fields, predicate, predicateParam) {
  const keys = Object.keys(fields)
  if (!keys.length) throw httpError(400, 'Nothing to update.')
  const sets = keys.map((key, index) => `${key} = $${index + 3}`)
  const { rows } = await query(
    `UPDATE ${table} SET ${sets.join(', ')}, updated_at = now()
     WHERE ${idColumn} = $1 AND ${predicate} RETURNING *`,
    [id, predicateParam, ...keys.map((key) => fields[key])],
  )
  if (!rows[0]) throw httpError(404, 'Record not found.')
  return rows[0]
}

async function assertCustomer(orgId, db = { query }) {
  const { rows } = await db.query('SELECT legal_name, org_type, verification_status FROM organizations WHERE org_id = $1', [orgId])
  const org = rows[0]
  if (!org) throw httpError(404, 'Customer not found.')
  if (!CUSTOMER_TYPES.includes(org.org_type)) throw httpError(400, 'This organisation cannot be a customer.')
  if (org.verification_status !== 'VERIFIED') throw httpError(409, 'The customer must pass KYC/KYB verification first.')
  return org
}

// ----- Summary and customers -----

export async function getSummary(req, res) {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM zx_products p WHERE p.active AND ${orgPredicate('p.owner_org_id', '$1')}) AS products,
       (SELECT count(*)::int FROM zx_products p WHERE p.active AND p.stock_qty <= 5 AND ${orgPredicate('p.owner_org_id', '$1')}) AS low_stock,
       (SELECT count(*)::int FROM zx_quotes q WHERE q.status = 'SENT' AND q.valid_until >= CURRENT_DATE AND ${orgPredicate('q.owner_org_id', '$1')}) AS open_quotes,
       (SELECT count(*)::int FROM zx_orders o WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED') AND ${orgPredicate('o.owner_org_id', '$1')}) AS active_orders,
       (SELECT COALESCE(sum(o.total_eur), 0) FROM zx_orders o WHERE o.status <> 'CANCELLED' AND ${orgPredicate('o.owner_org_id', '$1')}) AS order_value_eur`,
    [scope(req)],
  )
  return res.json({ data: rows[0] })
}

export async function listCustomers(req, res) {
  const params = [CUSTOMER_TYPES]
  let where = `verification_status = 'VERIFIED' AND org_type = ANY($1::text[])`
  if (req.query.q) {
    params.push(`%${String(req.query.q).slice(0, 100)}%`)
    where += ' AND (legal_name ILIKE $2 OR tax_id ILIKE $2)'
  }
  const { rows } = await query(
    `SELECT org_id, legal_name, tax_id, country, region_corridor, org_type, billing_address FROM organizations
     WHERE ${where} ORDER BY legal_name`,
    params,
  )
  return res.json({ data: rows })
}

const addressBody = z.object({ billing_address: z.string().trim().min(5, 'Enter the full billing address.').max(500) })

/** Issued invoices keep their own frozen copy, so this only affects future documents. */
export async function updateCustomerAddress(req, res) {
  const { billing_address: address } = parse(addressBody, req.body)
  const { rows } = await query(
    `UPDATE organizations SET billing_address = $2
     WHERE org_id = $1 AND verification_status = 'VERIFIED' AND org_type = ANY($3::text[])
     RETURNING org_id, legal_name, billing_address`,
    [req.params.id, address, CUSTOMER_TYPES],
  )
  if (!rows[0]) throw httpError(404, 'Customer not found.')
  await writeAudit(req.user.sub, 'ZX_CUSTOMER_ADDRESS_UPDATED', 'organizations', rows[0].org_id)
  return res.json({ data: rows[0] })
}

// ----- Product Catalog -----

const productFields = {
  sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/, 'SKU may only use letters, numbers, dot, dash and underscore.'),
  name: z.string().trim().min(2).max(255),
  description: optionalText(5000),
  specifications: optionalText(10000),
  category: z.string().trim().min(2).max(100),
  unit_price_eur: z.coerce.number().nonnegative().max(1e9),
  tax_rate: z.coerce.number().min(0).max(100),
  stock_qty: z.coerce.number().int().nonnegative().max(1e9),
  active: z.boolean(),
}
const productCreate = z.object({
  ...productFields,
  category: productFields.category.default('General'),
  tax_rate: productFields.tax_rate.default(21),
  stock_qty: productFields.stock_qty.default(0),
  active: productFields.active.default(true),
})
const productUpdate = z.object(productFields).partial()

export async function listProducts(req, res) {
  const params = [scope(req)]
  let where = orgPredicate('p.owner_org_id', '$1')
  if (req.query.active !== 'all') where += ' AND p.active'
  if (req.query.q) {
    params.push(`%${req.query.q}%`)
    where += ' AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR p.category ILIKE $2)'
  }
  const { rows } = await query(`SELECT p.* FROM zx_products p WHERE ${where} ORDER BY p.category, p.name LIMIT 500`, params)
  return res.json({ data: rows })
}

const duplicateSku = (error) => {
  if (error.code === '23505') throw httpError(409, 'A product with this SKU already exists.')
  throw error
}

export async function createProduct(req, res) {
  requireManager(req)
  const d = parse(productCreate, req.body)
  const { rows } = await query(
    `INSERT INTO zx_products (sku, name, description, category, unit_price_eur, tax_rate, stock_qty, active, owner_org_id, created_by, specifications)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [d.sku, d.name, d.description ?? null, d.category, d.unit_price_eur, d.tax_rate, d.stock_qty, d.active, req.user.org_id || null, req.user.sub, d.specifications ?? null],
  ).catch(duplicateSku)
  await writeAudit(req.user.sub, 'ZX_PRODUCT_CREATED', 'zx_products', rows[0].product_id, { sku: d.sku })
  return res.status(201).json({ data: rows[0] })
}

export async function updateProduct(req, res) {
  requireManager(req)
  const fields = parse(productUpdate, req.body)
  const row = await updateRow('zx_products', 'product_id', req.params.id, fields, orgPredicate('owner_org_id', '$2'), scope(req)).catch(duplicateSku)
  await writeAudit(req.user.sub, 'ZX_PRODUCT_UPDATED', 'zx_products', row.product_id, { fields: Object.keys(fields) })
  return res.json({ data: row })
}

// ----- Contacts -----

const contactFields = {
  org_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().toLowerCase().email().max(255).nullable().optional(),
  phone: optionalText(50),
  job_title: optionalText(150),
  active: z.boolean().optional(),
}
const contactCreate = z.object(contactFields)
const contactUpdate = z.object(contactFields).partial()

export async function listContacts(req, res) {
  const params = [scope(req)]
  let where = `c.active AND ${orgPredicate('c.owner_org_id', '$1')}`
  if (req.query.org_id && z.string().uuid().safeParse(req.query.org_id).success) {
    params.push(req.query.org_id)
    where += ` AND c.org_id = $${params.length}`
  }
  if (req.query.q) {
    params.push(`%${req.query.q}%`)
    where += ` AND (c.full_name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR o.legal_name ILIKE $${params.length})`
  }
  const { rows } = await query(
    `SELECT c.contact_id, c.org_id, c.full_name, c.email, c.phone, c.job_title, c.active, c.created_at, o.legal_name AS organization
     FROM zx_contacts c JOIN organizations o ON o.org_id = c.org_id
     WHERE ${where} ORDER BY c.full_name LIMIT 500`,
    params,
  )
  return res.json({ data: rows })
}

export async function createContact(req, res) {
  const d = parse(contactCreate, req.body)
  await assertCustomer(d.org_id)
  const { rows } = await query(
    `INSERT INTO zx_contacts (org_id, full_name, email, phone, job_title, owner_org_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [d.org_id, d.full_name, d.email ?? null, d.phone ?? null, d.job_title ?? null, req.user.org_id || null, req.user.sub],
  )
  await writeAudit(req.user.sub, 'ZX_CONTACT_CREATED', 'zx_contacts', rows[0].contact_id)
  return res.status(201).json({ data: rows[0] })
}

export async function updateContact(req, res) {
  const fields = parse(contactUpdate, req.body)
  if (fields.org_id) await assertCustomer(fields.org_id)
  const row = await updateRow('zx_contacts', 'contact_id', req.params.id, fields, orgPredicate('owner_org_id', '$2'), scope(req))
  await writeAudit(req.user.sub, 'ZX_CONTACT_UPDATED', 'zx_contacts', row.contact_id, { fields: Object.keys(fields) })
  return res.json({ data: row })
}

// ----- Franchises & Distributors -----

const distributorFields = {
  org_id: z.string().uuid(),
  kind: z.enum(['DISTRIBUTOR', 'FRANCHISE']),
  territory: z.enum(TERRITORIES),
  discount_pct: z.coerce.number().min(0).max(40),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
}
const distributorCreate = z.object({
  ...distributorFields,
  kind: distributorFields.kind.default('DISTRIBUTOR'),
  discount_pct: distributorFields.discount_pct.default(0),
  status: distributorFields.status.default('ACTIVE'),
})
const distributorUpdate = z.object({
  kind: distributorFields.kind,
  territory: distributorFields.territory,
  discount_pct: distributorFields.discount_pct,
  status: distributorFields.status,
}).partial()

export async function listDistributors(req, res) {
  const { rows } = await query(
    `SELECT d.*, o.legal_name AS organization, o.country,
            (SELECT COALESCE(sum(x.total_eur), 0) FROM zx_orders x WHERE x.customer_org_id = d.org_id AND x.status <> 'CANCELLED') AS order_value_eur
     FROM zx_distributors d JOIN organizations o ON o.org_id = d.org_id
     WHERE ${orgPredicate('d.owner_org_id', '$1')} ORDER BY o.legal_name LIMIT 500`,
    [scope(req)],
  )
  return res.json({ data: rows })
}

export async function createDistributor(req, res) {
  requireManager(req)
  const d = parse(distributorCreate, req.body)
  await assertCustomer(d.org_id)
  const { rows } = await query(
    `INSERT INTO zx_distributors (org_id, kind, territory, discount_pct, status, owner_org_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [d.org_id, d.kind, d.territory, d.discount_pct, d.status, req.user.org_id || null, req.user.sub],
  ).catch((error) => {
    if (error.code === '23505') throw httpError(409, 'This organisation is already registered.')
    throw error
  })
  await writeAudit(req.user.sub, 'ZX_DISTRIBUTOR_CREATED', 'zx_distributors', rows[0].distributor_id, { kind: d.kind, discount_pct: d.discount_pct })
  return res.status(201).json({ data: rows[0] })
}

export async function updateDistributor(req, res) {
  requireManager(req)
  const fields = parse(distributorUpdate, req.body)
  const row = await updateRow('zx_distributors', 'distributor_id', req.params.id, fields, orgPredicate('owner_org_id', '$2'), scope(req))
  await writeAudit(req.user.sub, 'ZX_DISTRIBUTOR_UPDATED', 'zx_distributors', row.distributor_id, fields)
  return res.json({ data: row })
}

// ----- Quotes -----

const quoteBody = z.object({
  customer_org_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable().optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.'),
  notes: optionalText(5000),
  lines: z.array(z.object({
    product_id: z.string().uuid(),
    qty: z.coerce.number().int().positive().max(1e6),
    discount_pct: z.coerce.number().min(0).max(100).optional(),
  })).min(1, 'Add at least one product.').max(200),
})

const QUOTE_SELECT = `
  SELECT q.quote_id, q.quote_number, q.customer_org_id, q.contact_id, q.valid_until::text AS valid_until, q.notes,
         q.net_eur, q.tax_eur, q.total_eur, q.owner_org_id, q.created_by, q.decided_at, q.created_at, q.updated_at,
         CASE WHEN q.status = 'SENT' AND q.valid_until < CURRENT_DATE THEN 'EXPIRED' ELSE q.status END AS status,
         o.legal_name AS customer, c.full_name AS contact_name, u.name AS created_by_name,
         x.order_id, x.order_number
  FROM zx_quotes q
  JOIN organizations o ON o.org_id = q.customer_org_id
  LEFT JOIN zx_contacts c ON c.contact_id = q.contact_id
  LEFT JOIN users u ON u.id = q.created_by
  LEFT JOIN zx_orders x ON x.quote_id = q.quote_id
`
const quoteLines = async (quoteId) => (await query(
  `SELECT line_id, product_id, sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur
   FROM zx_quote_lines WHERE quote_id = $1 ORDER BY name`,
  [quoteId],
)).rows
const canSell = (user, quote) => isManager(user) || quote.created_by === user.sub
const withPermissions = (user, quote) => ({ ...quote, can_edit: user.role !== 'finance' && canSell(user, quote) })
const today = () => new Date().toISOString().slice(0, 10)

async function validateQuote(client, req, data) {
  if (Number.isNaN(Date.parse(data.valid_until))) throw httpError(400, 'Use a valid date.')
  if (data.valid_until < today()) throw httpError(400, 'The validity date cannot be in the past.')
  await assertCustomer(data.customer_org_id, client)
  if (data.contact_id) {
    const contact = await client.query('SELECT 1 FROM zx_contacts WHERE contact_id = $1 AND org_id = $2 AND active', [data.contact_id, data.customer_org_id])
    if (!contact.rowCount) throw httpError(400, 'The contact does not belong to this customer.')
  }
  const ids = data.lines.map((line) => line.product_id)
  if (new Set(ids).size !== ids.length) throw httpError(400, 'Each product can appear only once in a quote.')

  const products = await client.query(
    `SELECT product_id, sku, name, unit_price_eur, tax_rate FROM zx_products p
     WHERE p.product_id = ANY($1::uuid[]) AND p.active AND ${orgPredicate('p.owner_org_id', '$2')}`,
    [ids, scope(req)],
  )
  const byId = new Map(products.rows.map((product) => [product.product_id, product]))
  const partner = await client.query(`SELECT discount_pct FROM zx_distributors WHERE org_id = $1 AND status = 'ACTIVE'`, [data.customer_org_id])
  const agreed = Number(partner.rows[0]?.discount_pct || 0)
  const limit = maxDiscount(req.user.role, agreed)

  return data.lines.map((line) => {
    const product = byId.get(line.product_id)
    if (!product) throw httpError(400, 'A selected product is not available.')
    const discount_pct = line.discount_pct ?? agreed
    if (discount_pct > limit) throw httpError(403, `Your maximum discount is ${limit}%.`)
    return { ...product, qty: line.qty, discount_pct, ...priceLine({ qty: line.qty, unit_price_eur: product.unit_price_eur, discount_pct, tax_rate: product.tax_rate }) }
  })
}

async function insertLines(client, quoteId, lines) {
  for (const l of lines) {
    await client.query(
      `INSERT INTO zx_quote_lines (quote_id, product_id, sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [quoteId, l.product_id, l.sku, l.name, l.qty, l.unit_price_eur, l.discount_pct, l.tax_rate, l.net_eur, l.tax_eur],
    )
  }
}

export async function listQuotes(req, res) {
  const params = [scope(req)]
  const filters = [orgPredicate('q.owner_org_id', '$1')]
  if (req.query.q) {
    params.push(`%${req.query.q}%`)
    filters.push(`(q.quote_number ILIKE $${params.length} OR o.legal_name ILIKE $${params.length})`)
  }
  const { rows } = await query(`${QUOTE_SELECT} WHERE ${filters.join(' AND ')} ORDER BY q.created_at DESC LIMIT 500`, params)
  return res.json({ data: rows.map((row) => withPermissions(req.user, row)) })
}

async function findQuote(req) {
  const { rows } = await query(`${QUOTE_SELECT} WHERE q.quote_id = $1 AND ${orgPredicate('q.owner_org_id', '$2')}`, [req.params.id, scope(req)])
  if (!rows[0]) throw httpError(404, 'Quote not found.')
  return rows[0]
}

export async function getQuote(req, res) {
  const quote = await findQuote(req)
  return res.json({ data: { ...withPermissions(req.user, quote), lines: await quoteLines(quote.quote_id) } })
}

export async function createQuote(req, res) {
  const data = parse(quoteBody, req.body)
  const quoteId = await withTransaction(async (client) => {
    const lines = await validateQuote(client, req, data)
    const sum = totals(lines)
    const { rows } = await client.query(
      `INSERT INTO zx_quotes (quote_number, customer_org_id, contact_id, valid_until, notes, net_eur, tax_eur, total_eur, owner_org_id, created_by)
       VALUES ('Q-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('zx_quote_seq')::text, 5, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING quote_id`,
      [data.customer_org_id, data.contact_id ?? null, data.valid_until, data.notes ?? null, sum.net_eur, sum.tax_eur, sum.total_eur, req.user.org_id || null, req.user.sub],
    )
    await insertLines(client, rows[0].quote_id, lines)
    return rows[0].quote_id
  })
  await writeAudit(req.user.sub, 'ZX_QUOTE_CREATED', 'zx_quotes', quoteId)
  req.params.id = quoteId
  const quote = await findQuote(req)
  return res.status(201).json({ data: { ...withPermissions(req.user, quote), lines: await quoteLines(quoteId) } })
}

export async function updateQuote(req, res) {
  const data = parse(quoteBody, req.body)
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT status, created_by FROM zx_quotes q WHERE q.quote_id = $1 AND ${orgPredicate('q.owner_org_id', '$2')} FOR UPDATE`,
      [req.params.id, scope(req)],
    )
    if (!rows[0]) throw httpError(404, 'Quote not found.')
    if (!canSell(req.user, rows[0])) throw httpError(403, 'You can only edit your own quotes.')
    if (rows[0].status !== 'DRAFT') throw httpError(409, 'Only draft quotes can be edited.')
    const lines = await validateQuote(client, req, data)
    const sum = totals(lines)
    await client.query('DELETE FROM zx_quote_lines WHERE quote_id = $1', [req.params.id])
    await insertLines(client, req.params.id, lines)
    await client.query(
      `UPDATE zx_quotes SET customer_org_id = $2, contact_id = $3, valid_until = $4, notes = $5,
         net_eur = $6, tax_eur = $7, total_eur = $8, updated_at = now() WHERE quote_id = $1`,
      [req.params.id, data.customer_org_id, data.contact_id ?? null, data.valid_until, data.notes ?? null, sum.net_eur, sum.tax_eur, sum.total_eur],
    )
  })
  await writeAudit(req.user.sub, 'ZX_QUOTE_UPDATED', 'zx_quotes', req.params.id)
  const quote = await findQuote(req)
  return res.json({ data: { ...withPermissions(req.user, quote), lines: await quoteLines(quote.quote_id) } })
}

async function customerUserIds(orgId) {
  const { rows } = await query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.org_id = $1 AND u.status = 'active' AND r.name IN ('client', 'partner')`,
    [orgId],
  )
  return rows.map((row) => row.id)
}

export async function sendQuote(req, res) {
  const quote = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT quote_id, quote_number, customer_org_id, status, valid_until::text AS valid_until, created_by
       FROM zx_quotes q WHERE q.quote_id = $1 AND ${orgPredicate('q.owner_org_id', '$2')} FOR UPDATE`,
      [req.params.id, scope(req)],
    )
    const row = rows[0]
    if (!row) throw httpError(404, 'Quote not found.')
    if (!canSell(req.user, row)) throw httpError(403, 'You can only send your own quotes.')
    if (row.status !== 'DRAFT') throw httpError(409, 'Only draft quotes can be sent.')
    if (row.valid_until < today()) throw httpError(409, 'Update the validity date before sending.')
    await assertCustomer(row.customer_org_id, client)
    await client.query(`UPDATE zx_quotes SET status = 'SENT', updated_at = now() WHERE quote_id = $1`, [row.quote_id])
    return row
  })
  await writeAudit(req.user.sub, 'ZX_QUOTE_SENT', 'zx_quotes', quote.quote_id)
  await notify(await customerUserIds(quote.customer_org_id), {
    type: 'commercial', title: `New quote ${quote.quote_number}`, body: 'Please review and accept or decline it.', link: '/extranet/orders',
  })
  return res.json({ data: { quote_id: quote.quote_id, status: 'SENT' } })
}

/** Accepts a quote: locks it, reserves stock and creates exactly one order, all or nothing. */
async function acceptQuoteTx(quoteId, user, guard) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM zx_quotes WHERE quote_id = $1 FOR UPDATE', [quoteId])
    const quote = rows[0]
    if (!quote || !guard(quote)) throw httpError(404, 'Quote not found.')
    if (quote.status !== 'SENT') throw httpError(409, 'Only sent quotes can be accepted.')
    const expired = await client.query('SELECT valid_until < CURRENT_DATE AS expired FROM zx_quotes WHERE quote_id = $1', [quoteId])
    if (expired.rows[0].expired) throw httpError(409, 'This quote has expired.')
    await assertCustomer(quote.customer_org_id, client)

    const lines = (await client.query('SELECT product_id, sku, qty FROM zx_quote_lines WHERE quote_id = $1 ORDER BY product_id', [quoteId])).rows
    for (const line of lines) {
      const stock = await client.query(
        'UPDATE zx_products SET stock_qty = stock_qty - $2, updated_at = now() WHERE product_id = $1 AND active AND stock_qty >= $2',
        [line.product_id, line.qty],
      )
      if (!stock.rowCount) throw httpError(409, `Not enough stock for ${line.sku}.`)
    }

    const order = await client.query(
      `INSERT INTO zx_orders (order_number, quote_id, customer_org_id, net_eur, tax_eur, total_eur, owner_org_id, created_by)
       VALUES ('SO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('zx_order_seq')::text, 5, '0'), $1, $2, $3, $4, $5, $6, $7)
       RETURNING order_id, order_number, status, total_eur`,
      [quoteId, quote.customer_org_id, quote.net_eur, quote.tax_eur, quote.total_eur, quote.owner_org_id, user.sub],
    )
    await client.query(`INSERT INTO zx_order_events (order_id, status, note, created_by) VALUES ($1, 'CONFIRMED', 'Order created from accepted quote.', $2)`, [order.rows[0].order_id, user.sub])
    await client.query(`UPDATE zx_quotes SET status = 'ACCEPTED', decided_by = $2, decided_at = now(), updated_at = now() WHERE quote_id = $1`, [quoteId, user.sub])
    return { ...order.rows[0], quote_number: quote.quote_number, seller: quote.created_by, customer_org_id: quote.customer_org_id }
  })
}

async function rejectQuoteTx(quoteId, user, guard) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM zx_quotes WHERE quote_id = $1 FOR UPDATE', [quoteId])
    const quote = rows[0]
    if (!quote || !guard(quote)) throw httpError(404, 'Quote not found.')
    if (quote.status !== 'SENT') throw httpError(409, 'Only sent quotes can be declined.')
    await client.query(`UPDATE zx_quotes SET status = 'REJECTED', decided_by = $2, decided_at = now(), updated_at = now() WHERE quote_id = $1`, [quoteId, user.sub])
    return quote
  })
}

const staffGuard = (req) => {
  const allowed = req.user.org_scope
  return (quote) => (!allowed || !quote.owner_org_id || allowed.includes(quote.owner_org_id)) && canSell(req.user, quote)
}
const portalGuard = (req) => (quote) => Boolean(req.user.org_id) && quote.customer_org_id === req.user.org_id && quote.status !== 'DRAFT'

async function afterAccept(req, order) {
  await writeAudit(req.user.sub, 'ZX_QUOTE_ACCEPTED', 'zx_quotes', req.params.id, { order_id: order.order_id })
  const payload = { type: 'commercial', title: `Order ${order.order_number} confirmed`, body: `From quote ${order.quote_number}.` }
  await notify([order.seller], { ...payload, link: '/intranet/commercial' })
  await notifyRoles(['finance'], { ...payload, link: '/intranet/commercial' }, order.seller)
  await notify(await customerUserIds(order.customer_org_id), { ...payload, link: '/extranet/orders' })
  const { seller: _seller, customer_org_id: _customer, ...data } = order
  return data
}

export async function acceptQuote(req, res) {
  const order = await acceptQuoteTx(req.params.id, req.user, staffGuard(req))
  return res.status(201).json({ data: await afterAccept(req, order) })
}

export async function rejectQuote(req, res) {
  const quote = await rejectQuoteTx(req.params.id, req.user, staffGuard(req))
  await writeAudit(req.user.sub, 'ZX_QUOTE_REJECTED', 'zx_quotes', quote.quote_id)
  return res.json({ data: { quote_id: quote.quote_id, status: 'REJECTED' } })
}

// ----- Orders -----

const ORDER_SELECT = `
  SELECT x.order_id, x.order_number, x.quote_id, x.customer_org_id, x.status, x.net_eur, x.tax_eur, x.total_eur,
         x.owner_org_id, x.created_at, x.updated_at, o.legal_name AS customer, q.quote_number
  FROM zx_orders x
  JOIN organizations o ON o.org_id = x.customer_org_id
  JOIN zx_quotes q ON q.quote_id = x.quote_id
`
const orderDetail = async (order) => {
  const [lines, events] = await Promise.all([
    quoteLines(order.quote_id),
    query(
      `SELECT e.event_id, e.status, e.note, e.created_at, u.name AS author
       FROM zx_order_events e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.order_id = $1 ORDER BY e.created_at, e.event_id`,
      [order.order_id],
    ),
  ])
  return { ...order, lines, events: events.rows, next_statuses: ORDER_TRANSITIONS[order.status] || [] }
}

export async function listOrders(req, res) {
  const params = [scope(req)]
  const filters = [orgPredicate('x.owner_org_id', '$1')]
  if (req.query.status) {
    params.push(String(req.query.status).toUpperCase())
    filters.push(`x.status = $${params.length}`)
  }
  if (req.query.q) {
    params.push(`%${req.query.q}%`)
    filters.push(`(x.order_number ILIKE $${params.length} OR o.legal_name ILIKE $${params.length})`)
  }
  const { rows } = await query(`${ORDER_SELECT} WHERE ${filters.join(' AND ')} ORDER BY x.created_at DESC LIMIT 500`, params)
  return res.json({ data: rows })
}

export async function getOrder(req, res) {
  const { rows } = await query(`${ORDER_SELECT} WHERE x.order_id = $1 AND ${orgPredicate('x.owner_org_id', '$2')}`, [req.params.id, scope(req)])
  if (!rows[0]) return res.status(404).json({ message: 'Order not found.' })
  return res.json({ data: { ...(await orderDetail(rows[0])), can_manage: isManager(req.user) } })
}

const orderStatusBody = z.object({
  status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  note: optionalText(1000),
})

export async function updateOrderStatus(req, res) {
  requireManager(req)
  const data = parse(orderStatusBody, req.body)
  const order = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT order_id, order_number, quote_id, customer_org_id, status FROM zx_orders x
       WHERE x.order_id = $1 AND ${orgPredicate('x.owner_org_id', '$2')} FOR UPDATE`,
      [req.params.id, scope(req)],
    )
    const row = rows[0]
    if (!row) throw httpError(404, 'Order not found.')
    if (!ORDER_TRANSITIONS[row.status].includes(data.status)) throw httpError(409, `An order cannot move from ${row.status} to ${data.status}.`)
    if (data.status === 'CANCELLED') {
      const lines = await client.query('SELECT product_id, qty FROM zx_quote_lines WHERE quote_id = $1 ORDER BY product_id', [row.quote_id])
      for (const line of lines.rows) {
        await client.query('UPDATE zx_products SET stock_qty = stock_qty + $2, updated_at = now() WHERE product_id = $1', [line.product_id, line.qty])
      }
    }
    await client.query('UPDATE zx_orders SET status = $2, updated_at = now() WHERE order_id = $1', [row.order_id, data.status])
    await client.query('INSERT INTO zx_order_events (order_id, status, note, created_by) VALUES ($1, $2, $3, $4)', [row.order_id, data.status, data.note ?? null, req.user.sub])
    return row
  })
  await writeAudit(req.user.sub, 'ZX_ORDER_STATUS', 'zx_orders', order.order_id, { from: order.status, to: data.status })
  await notify(await customerUserIds(order.customer_org_id), {
    type: 'commercial', title: `Order ${order.order_number}: ${data.status.toLowerCase()}`, link: '/extranet/orders',
  })
  return res.json({ data: { order_id: order.order_id, status: data.status } })
}

// ----- Customer portal (Extranet): only the signed-in company's own records -----

const stripInternal = ({ owner_org_id: _o, created_by: _c, created_by_name: _n, ...row }) => row

export async function portalListQuotes(req, res) {
  const { rows } = await query(
    `${QUOTE_SELECT} WHERE q.customer_org_id = $1 AND q.status <> 'DRAFT' ORDER BY q.created_at DESC LIMIT 200`,
    [req.user.org_id],
  )
  return res.json({ data: rows.map(stripInternal) })
}

export async function portalGetQuote(req, res) {
  const { rows } = await query(
    `${QUOTE_SELECT} WHERE q.quote_id = $1 AND q.customer_org_id = $2 AND q.status <> 'DRAFT'`,
    [req.params.id, req.user.org_id],
  )
  if (!rows[0]) return res.status(404).json({ message: 'Quote not found.' })
  return res.json({ data: { ...stripInternal(rows[0]), lines: await quoteLines(rows[0].quote_id) } })
}

export async function portalAcceptQuote(req, res) {
  const order = await acceptQuoteTx(req.params.id, req.user, portalGuard(req))
  return res.status(201).json({ data: await afterAccept(req, order) })
}

export async function portalRejectQuote(req, res) {
  const quote = await rejectQuoteTx(req.params.id, req.user, portalGuard(req))
  await writeAudit(req.user.sub, 'ZX_QUOTE_REJECTED', 'zx_quotes', quote.quote_id)
  await notify([quote.created_by], { type: 'commercial', title: `Quote ${quote.quote_number} declined`, link: '/intranet/commercial' })
  return res.json({ data: { quote_id: quote.quote_id, status: 'REJECTED' } })
}

export async function portalListOrders(req, res) {
  const { rows } = await query(`${ORDER_SELECT} WHERE x.customer_org_id = $1 ORDER BY x.created_at DESC LIMIT 200`, [req.user.org_id])
  return res.json({ data: rows.map(stripInternal) })
}

export async function portalGetOrder(req, res) {
  const { rows } = await query(`${ORDER_SELECT} WHERE x.order_id = $1 AND x.customer_org_id = $2`, [req.params.id, req.user.org_id])
  if (!rows[0]) return res.status(404).json({ message: 'Order not found.' })
  const { next_statuses: _next, ...detail } = await orderDetail(rows[0])
  return res.json({ data: stripInternal(detail) })
}
