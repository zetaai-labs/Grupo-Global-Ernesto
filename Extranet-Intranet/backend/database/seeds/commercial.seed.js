import { priceLine, totals } from '../../src/services/commercial.service.js'

const PRODUCTS = [
  ['DEMO-LAP-14', 'Business Laptop 14"', 'IT Equipment', 899, 21, 42],
  ['DEMO-MON-27', 'Monitor 27" QHD', 'IT Equipment', 329, 21, 60],
  ['DEMO-POS-01', 'POS Terminal', 'Retail', 549, 21, 4],
  ['DEMO-SCN-02', 'Barcode Scanner', 'Retail', 89.5, 21, 120],
  ['DEMO-CHR-10', 'Ergonomic Office Chair', 'Furniture', 245, 21, 25],
  ['DEMO-SUP-12', 'Annual Support Plan', 'Services', 1200, 21, 999],
]

/** Repeatable demo data for the ZYLAX commercial screens. */
export async function seedCommercial(query) {
  const owner = (await query(`SELECT id FROM users WHERE email = 'manager@gmail.com'`)).rows[0]?.id
  const orgId = async (name) => (await query('SELECT org_id FROM organizations WHERE legal_name = $1', [name])).rows[0]?.org_id
  const iberia = await orgId('Iberia Retail S.L.')
  const vikas = await orgId('Vikas Metal Works')
  if (!owner || !iberia) return

  for (const [sku, name, category, price, tax, stock] of PRODUCTS) {
    await query(
      `INSERT INTO zx_products (sku, name, category, unit_price_eur, tax_rate, stock_qty, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (UPPER(sku)) DO NOTHING`,
      [sku, name, category, price, tax, stock, owner],
    )
  }

  await query(
    `INSERT INTO zx_contacts (org_id, full_name, email, phone, job_title, created_by)
     SELECT $1, 'Demo Procurement Lead', 'procurement@iberiaretail.example', '+34 600 000 000', 'Procurement Lead', $2
     WHERE NOT EXISTS (SELECT 1 FROM zx_contacts WHERE email = 'procurement@iberiaretail.example')`,
    [iberia, owner],
  )
  if (vikas) {
    await query(
      `INSERT INTO zx_distributors (org_id, kind, territory, discount_pct, created_by)
       VALUES ($1, 'DISTRIBUTOR', 'INDIA', 12, $2) ON CONFLICT (org_id) DO NOTHING`,
      [vikas, owner],
    )
  }

  const addQuote = async (number, status, items) => {
    const existing = await query('SELECT quote_id FROM zx_quotes WHERE quote_number = $1', [number])
    if (existing.rows[0]) return existing.rows[0].quote_id
    const lines = []
    for (const [sku, qty] of items) {
      const product = (await query('SELECT product_id, sku, name, unit_price_eur, tax_rate FROM zx_products WHERE sku = $1', [sku])).rows[0]
      lines.push({ ...product, qty, ...priceLine({ qty, unit_price_eur: product.unit_price_eur, tax_rate: product.tax_rate }) })
    }
    const sum = totals(lines)
    const quoteId = (await query(
      `INSERT INTO zx_quotes (quote_number, customer_org_id, status, valid_until, notes, net_eur, tax_eur, total_eur, created_by)
       VALUES ($1, $2, $3, CURRENT_DATE + 30, 'Demo offer for the store roll-out.', $4, $5, $6, $7) RETURNING quote_id`,
      [number, iberia, status, sum.net_eur, sum.tax_eur, sum.total_eur, owner],
    )).rows[0].quote_id
    for (const l of lines) {
      await query(
        `INSERT INTO zx_quote_lines (quote_id, product_id, sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9)`,
        [quoteId, l.product_id, l.sku, l.name, l.qty, l.unit_price_eur, l.tax_rate, l.net_eur, l.tax_eur],
      )
    }
    return quoteId
  }

  await addQuote('Q-DEMO-0001', 'SENT', [['DEMO-POS-01', 2], ['DEMO-SCN-02', 4]])
  await query(`UPDATE zx_quotes SET valid_until = CURRENT_DATE + 30 WHERE quote_number = 'Q-DEMO-0001' AND status = 'SENT'`)

  const acceptedId = await addQuote('Q-DEMO-0002', 'ACCEPTED', [['DEMO-LAP-14', 5], ['DEMO-MON-27', 5]])
  const order = await query(
    `INSERT INTO zx_orders (order_number, quote_id, customer_org_id, status, net_eur, tax_eur, total_eur, created_by)
     SELECT 'SO-DEMO-0001', quote_id, customer_org_id, 'PROCESSING', net_eur, tax_eur, total_eur, $2
     FROM zx_quotes WHERE quote_id = $1
     ON CONFLICT (quote_id) DO NOTHING RETURNING order_id`,
    [acceptedId, owner],
  )
  if (order.rows[0]) {
    await query(
      `INSERT INTO zx_order_events (order_id, status, note, created_by, created_at)
       VALUES ($1, 'CONFIRMED', 'Order created from accepted quote.', $2, now() - interval '1 day'),
              ($1, 'PROCESSING', NULL, $2, now())`,
      [order.rows[0].order_id, owner],
    )
  }
}
