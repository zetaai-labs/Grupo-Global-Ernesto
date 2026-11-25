import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { buildDocumentPdf, vatBreakdown, pdfLanguage, clean, hasArabic } from '../src/services/document.service.js'
import { smtpConfigured } from '../src/services/email.service.js'

const auth = (s) => ({ Authorization: `Bearer ${s.token}` })
const binary = (req) => req.buffer(true).parse((res, done) => {
  const chunks = []
  res.on('data', (chunk) => chunks.push(chunk))
  res.on('end', () => done(null, Buffer.concat(chunks)))
})
const invoices = []
let createdOrder = null
let iberiaId = null
let iberiaAddress = null

after(async () => {
  await query('DELETE FROM zx_invoices WHERE corrects_invoice_id = ANY($1::uuid[])', [invoices])
  await query('DELETE FROM zx_invoices WHERE invoice_id = ANY($1::uuid[])', [invoices])
  if (createdOrder) {
    await query('DELETE FROM zx_orders WHERE order_id = $1', [createdOrder.order])
    await query('DELETE FROM zx_quotes WHERE quote_id = $1', [createdOrder.quote])
    await query(`UPDATE zx_products SET stock_qty = stock_qty + 1 WHERE sku = 'DEMO-CHR-10'`)
  }
  await query('UPDATE organizations SET billing_address = $2 WHERE org_id = $1', [iberiaId, iberiaAddress])
  await query(`UPDATE zx_products SET stock_qty = stock_qty + 1 WHERE sku = 'DEMO-SCN-02'`)
})

describe('PDF quotes and invoices', () => {
  it('groups VAT by rate', () => {
    const rows = vatBreakdown([
      { tax_rate: '21.00', net_eur: '100.10', tax_eur: '21.02' },
      { tax_rate: '10.00', net_eur: '50.00', tax_eur: '5.00' },
      { tax_rate: '21', net_eur: '0.20', tax_eur: '0.04' },
    ])
    assert.deepEqual(rows, [{ rate: 10, base: 50, tax: 5 }, { rate: 21, base: 100.3, tax: 21.06 }])
  })

  it('builds a multi-page PDF with accents and long text', async () => {
    const lines = Array.from({ length: 70 }, (_, i) => ({ sku: `SKU-${i}`, name: `Artículo de diseño ñ ${i} ${'largo '.repeat(i % 5)}`, qty: 1, unit_price_eur: 10, discount_pct: 0, tax_rate: 21, net_eur: 10, tax_eur: 2.1 }))
    const pdf = await buildDocumentPdf({ kind: 'INVOICE', number: 'INV-T', status: 'REFUNDED', date: new Date(), seller: { name: 'Grupo Global', tax_id: 'G1' }, buyer: { name: 'Cliente 日本' }, lines, net_eur: 700, tax_eur: 147, total_eur: 847, notes: 'Observación', lang: 'es' })
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
    assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 2)
  })

  it('builds Russian and Arabic documents with embedded Cyrillic and Arabic fonts', async () => {
    assert.equal(pdfLanguage('ar'), 'ar')
    assert.equal(pdfLanguage('ru'), 'ru')
    assert.equal(pdfLanguage('xx'), 'es')
    assert.equal(clean('Москва 日本'), 'Москва ??')
    assert.equal(hasArabic('فاتورة 12'), true)
    const lines = [{ sku: 'A-1', name: 'Ноутбук / حاسوب محمول', qty: 2, unit_price_eur: 100, discount_pct: 0, tax_rate: 21, net_eur: 200, tax_eur: 42 }]
    for (const lang of ['ru', 'ar']) {
      const pdf = await buildDocumentPdf({ kind: 'INVOICE', number: 'INV-L', status: 'DRAFT', date: new Date(), seller: { name: 'Grupo Global' }, buyer: { name: 'ООО Ромашка — شركة' }, lines, net_eur: 200, tax_eur: 42, total_eur: 242, notes: lang === 'ar' ? 'ملاحظة' : 'Примечание', lang })
      const raw = pdf.toString('latin1')
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
      assert.match(raw, /NotoSans/, `${lang}: Latin/Cyrillic font embedded`)
      assert.match(raw, /NotoSansArabic/, `${lang}: Arabic font embedded`)
    }
  })

  it('lets each party download only its own documents', async () => {
    const [manager, customer, partner, supplier] = await Promise.all(['manager', 'customer', 'partner', 'supplier'].map((n) => loginAs(`${n}@gmail.com`)))
    const quote = (await query(`SELECT quote_id FROM zx_quotes WHERE quote_number = 'Q-DEMO-0002'`)).rows[0].quote_id
    const staff = await binary(request(app).get(`/api/zylax/quotes/${quote}/pdf?lang=es`).set(auth(manager)))
    assert.equal(staff.status, 200)
    assert.equal(staff.headers['content-type'], 'application/pdf')
    assert.match(staff.headers['content-disposition'], /Q-DEMO-0002\.pdf/)
    assert.equal(staff.body.subarray(0, 5).toString(), '%PDF-')
    assert.equal((await binary(request(app).get(`/api/zylax/portal/quotes/${quote}/pdf`).set(auth(customer)))).status, 200)
    assert.equal((await request(app).get(`/api/zylax/portal/quotes/${quote}/pdf`).set(auth(partner))).status, 404)
    assert.equal((await request(app).get(`/api/zylax/portal/quotes/${quote}/pdf`).set(auth(supplier))).status, 403)
    assert.equal((await request(app).get(`/api/zylax/quotes/${quote}/pdf`).set(auth(customer))).status, 403)
  })

  it('limits invoice PDFs to the seller, billing staff and the customer company', async () => {
    const [employee, finance, customer, hr] = await Promise.all(['employee', 'finance', 'customer', 'hr'].map((n) => loginAs(`${n}@gmail.com`)))
    const product = (await query(`SELECT product_id FROM zx_products WHERE sku = 'DEMO-SCN-02'`)).rows[0].product_id
    const sale = await request(app).post('/api/zylax/hub/pos/sales').set(auth(employee)).send({ payment_method: 'CASH', items: [{ product_id: product, qty: 1 }] })
    assert.equal(sale.status, 201)
    const id = sale.body.data.invoice_id
    invoices.push(id)
    assert.equal((await binary(request(app).get(`/api/zylax/hub/pos/invoices/${id}/pdf`).set(auth(employee)))).status, 200)
    assert.equal((await binary(request(app).get(`/api/zylax/hub/pos/invoices/${id}/pdf`).set(auth(finance)))).status, 200)
    assert.equal((await request(app).get(`/api/zylax/hub/pos/invoices/${id}/pdf`).set(auth(hr))).status, 403)
    assert.equal((await request(app).get(`/api/zylax/hub/pos/invoices/${id}/pdf`).set(auth(customer))).status, 403)
    assert.equal((await request(app).get(`/api/zylax/hub/pos/my-invoices/${id}/pdf`).set(auth(customer))).status, 404)
  })

  it('issues a corrective invoice on refund and freezes customer details', async () => {
    const [admin, manager, finance, employee, customer] = await Promise.all(['admin', 'manager', 'finance', 'employee', 'customer'].map((n) => loginAs(`${n}@gmail.com`)))
    const org = (await query(`SELECT org_id, billing_address FROM organizations WHERE legal_name = 'Iberia Retail S.L.'`)).rows[0]
    iberiaId = org.org_id
    iberiaAddress = org.billing_address
    const product = (await query(`SELECT product_id FROM zx_products WHERE sku = 'DEMO-CHR-10'`)).rows[0].product_id
    const quote = await request(app).post('/api/zylax/quotes').set(auth(admin)).send({ customer_org_id: org.org_id, valid_until: new Date(Date.now() + 86400000).toISOString().slice(0, 10), lines: [{ product_id: product, qty: 1 }] })
    await request(app).post(`/api/zylax/quotes/${quote.body.data.quote_id}/send`).set(auth(admin))
    const order = await request(app).post(`/api/zylax/portal/quotes/${quote.body.data.quote_id}/accept`).set(auth(customer))
    createdOrder = { order: order.body.data.order_id, quote: quote.body.data.quote_id }

    await query('UPDATE organizations SET billing_address = NULL WHERE org_id = $1', [org.org_id])
    assert.equal((await request(app).post(`/api/zylax/hub/pos/orders/${createdOrder.order}/invoice`).set(auth(finance))).status, 409, 'address required')
    assert.equal((await request(app).patch(`/api/zylax/customers/${org.org_id}`).set(auth(employee)).send({ billing_address: 'Calle Falsa 1, Madrid' })).status, 403)
    assert.equal((await request(app).patch(`/api/zylax/customers/${org.org_id}`).set(auth(finance)).send({ billing_address: 'Calle Primera 1, Madrid' })).status, 200)
    const issued = await request(app).post(`/api/zylax/hub/pos/orders/${createdOrder.order}/invoice`).set(auth(finance))
    assert.equal(issued.status, 201)
    invoices.push(issued.body.data.invoice_id)
    assert.equal(issued.body.data.buyer_snapshot.address, 'Calle Primera 1, Madrid')
    await request(app).patch(`/api/zylax/customers/${org.org_id}`).set(auth(manager)).send({ billing_address: 'Calle Segunda 2, Madrid' })
    const frozen = (await query('SELECT buyer_snapshot FROM zx_invoices WHERE invoice_id = $1', [issued.body.data.invoice_id])).rows[0]
    assert.equal(frozen.buyer_snapshot.address, 'Calle Primera 1, Madrid')

    assert.equal((await request(app).post(`/api/zylax/hub/pos/invoices/${issued.body.data.invoice_id}/pay`).set(auth(finance)).send({ payment_method: 'TRANSFER' })).status, 200)
    const refund = await request(app).post(`/api/zylax/hub/pos/invoices/${issued.body.data.invoice_id}/refund`).set(auth(finance)).send({ reason: 'Producto devuelto' })
    assert.equal(refund.status, 200)
    assert.match(refund.body.data.corrective_invoice_number, /^RECT-\d{4}-\d{6}$/)
    const rect = (await query('SELECT * FROM zx_invoices WHERE invoice_id = $1', [refund.body.data.corrective_invoice_id])).rows[0]
    assert.equal(Number(rect.total_eur), -Number(issued.body.data.total_eur))
    assert.equal(rect.corrects_invoice_id, issued.body.data.invoice_id)
    assert.equal(rect.buyer_snapshot.address, 'Calle Primera 1, Madrid')
    const lines = (await query('SELECT qty, net_eur FROM zx_invoice_lines WHERE invoice_id = $1', [rect.invoice_id])).rows
    assert.equal(lines[0].qty, -1)
    assert.ok(Number(lines[0].net_eur) < 0)
    assert.equal((await request(app).post(`/api/zylax/hub/pos/invoices/${rect.invoice_id}/pay`).set(auth(finance)).send({ payment_method: 'CASH' })).status, 409)
    assert.equal((await request(app).post(`/api/zylax/hub/pos/invoices/${rect.invoice_id}/refund`).set(auth(finance)).send({})).status, 409)
    const pdf = await binary(request(app).get(`/api/zylax/hub/pos/my-invoices/${rect.invoice_id}/pdf?lang=es`).set(auth(customer)))
    assert.equal(pdf.status, 200)
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-')
  })

  it('reports clearly when email is not configured', { skip: smtpConfigured() }, async () => {
    const manager = await loginAs('manager@gmail.com')
    const quote = (await query(`SELECT quote_id FROM zx_quotes WHERE quote_number = 'Q-DEMO-0001'`)).rows[0].quote_id
    const response = await request(app).post(`/api/zylax/quotes/${quote}/email`).set(auth(manager)).send({ lang: 'es' })
    assert.equal(response.status, 503)
  })
})
