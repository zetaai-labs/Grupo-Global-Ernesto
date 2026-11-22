import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { priceLine, totals } from '../src/services/commercial.service.js'

const auth = (s) => ({ Authorization: `Bearer ${s.token}` })
const stamp = Date.now()
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
const orgId = async (name) => (await query('SELECT org_id FROM organizations WHERE legal_name = $1', [name])).rows[0].org_id
const created = { products: [], quotes: [], orders: [] }

after(async () => {
  await query('DELETE FROM zx_orders WHERE order_id = ANY($1::uuid[])', [created.orders])
  await query('DELETE FROM zx_quotes WHERE quote_id = ANY($1::uuid[])', [created.quotes])
  await query('DELETE FROM zx_products WHERE product_id = ANY($1::uuid[])', [created.products])
})

async function product(admin, suffix, stock) {
  const res = await request(app).post('/api/zylax/products').set(auth(admin)).send({ sku: `T-${stamp}-${suffix}`, name: `Test ${suffix}`, unit_price_eur: 19.99, tax_rate: 21, stock_qty: stock })
  assert.equal(res.status, 201)
  created.products.push(res.body.data.product_id)
  return res.body.data
}
async function quote(session, customer, productId, qty, extra = {}) {
  const res = await request(app).post('/api/zylax/quotes').set(auth(session)).send({ customer_org_id: customer, valid_until: future, lines: [{ product_id: productId, qty, ...extra }] })
  if (res.status === 201) created.quotes.push(res.body.data.quote_id)
  return res
}
const stockOf = async (id) => (await query('SELECT stock_qty FROM zx_products WHERE product_id = $1', [id])).rows[0].stock_qty
const setStatus = (session, id, status) => request(app).patch(`/api/zylax/orders/${id}/status`).set(auth(session)).send({ status })

describe('ZYLAX commercial', () => {
  it('calculates money in cents', () => {
    const line = priceLine({ qty: 3, unit_price_eur: '19.99', discount_pct: 10, tax_rate: 21 })
    assert.deepEqual([line.net_eur, line.tax_eur], ['53.97', '11.33'])
    assert.deepEqual(totals([line]), { net_eur: '53.97', tax_eur: '11.33', total_eur: '65.30' })
  })

  it('runs quote to order to delivery and protects stock', async () => {
    const [admin, employee, customer] = await Promise.all(['admin', 'employee', 'customer'].map((n) => loginAs(`${n}@gmail.com`)))
    const iberia = await orgId('Iberia Retail S.L.')
    const item = await product(admin, 'flow', 5)

    assert.equal((await quote(employee, iberia, item.product_id, 1, { discount_pct: 30 })).status, 403, 'employee discount cap')
    const q = (await quote(employee, iberia, item.product_id, 3)).body.data
    assert.equal(q.total_eur, '72.56')

    assert.equal((await request(app).get(`/api/zylax/portal/quotes/${q.quote_id}`).set(auth(customer))).status, 404, 'drafts are hidden')
    assert.equal((await request(app).post(`/api/zylax/portal/quotes/${q.quote_id}/accept`).set(auth(customer))).status, 404)
    assert.equal((await request(app).post(`/api/zylax/quotes/${q.quote_id}/send`).set(auth(employee))).status, 200)

    const portal = await request(app).get(`/api/zylax/portal/quotes/${q.quote_id}`).set(auth(customer))
    assert.equal(portal.status, 200)
    assert.equal(portal.body.data.created_by, undefined)

    const [first, second] = await Promise.all([
      request(app).post(`/api/zylax/portal/quotes/${q.quote_id}/accept`).set(auth(customer)),
      request(app).post(`/api/zylax/portal/quotes/${q.quote_id}/accept`).set(auth(customer)),
    ])
    assert.deepEqual([first.status, second.status].sort(), [201, 409], 'double accept creates one order')
    const order = (first.status === 201 ? first : second).body.data
    created.orders.push(order.order_id)
    assert.equal(await stockOf(item.product_id), 2)

    assert.equal((await setStatus(employee, order.order_id, 'PROCESSING')).status, 403)
    assert.equal((await setStatus(admin, order.order_id, 'DELIVERED')).status, 409)
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
      assert.equal((await setStatus(admin, order.order_id, status)).status, 200)
    }
    assert.equal((await setStatus(admin, order.order_id, 'CANCELLED')).status, 409)
    const tracked = await request(app).get(`/api/zylax/portal/orders/${order.order_id}`).set(auth(customer))
    assert.equal(tracked.body.data.events.length, 4)
  })

  it('refuses overselling and restores stock on cancel', async () => {
    const [admin, customer] = await Promise.all([loginAs('admin@gmail.com'), loginAs('customer@gmail.com')])
    const iberia = await orgId('Iberia Retail S.L.')
    const item = await product(admin, 'stock', 4)
    const big = (await quote(admin, iberia, item.product_id, 5)).body.data
    await request(app).post(`/api/zylax/quotes/${big.quote_id}/send`).set(auth(admin))
    assert.equal((await request(app).post(`/api/zylax/portal/quotes/${big.quote_id}/accept`).set(auth(customer))).status, 409)
    assert.equal(await stockOf(item.product_id), 4)

    const ok = (await quote(admin, iberia, item.product_id, 4)).body.data
    await request(app).post(`/api/zylax/quotes/${ok.quote_id}/send`).set(auth(admin))
    const order = (await request(app).post(`/api/zylax/portal/quotes/${ok.quote_id}/accept`).set(auth(customer))).body.data
    created.orders.push(order.order_id)
    assert.equal(await stockOf(item.product_id), 0)
    assert.equal((await setStatus(admin, order.order_id, 'CANCELLED')).status, 200)
    assert.equal(await stockOf(item.product_id), 4)
  })

  it('keeps companies and roles apart', async () => {
    const [admin, partner, supplier, finance, investor, customer] = await Promise.all(['admin', 'partner', 'supplier', 'finance', 'investor', 'customer'].map((n) => loginAs(`${n}@gmail.com`)))
    const iberia = await orgId('Iberia Retail S.L.')
    const item = await product(admin, 'iso', 3)
    const q = (await quote(admin, iberia, item.product_id, 1)).body.data
    await request(app).post(`/api/zylax/quotes/${q.quote_id}/send`).set(auth(admin))

    assert.equal((await request(app).get(`/api/zylax/portal/quotes/${q.quote_id}`).set(auth(partner))).status, 404)
    assert.equal((await request(app).post(`/api/zylax/portal/quotes/${q.quote_id}/accept`).set(auth(partner))).status, 404)
    assert.equal((await request(app).get('/api/zylax/portal/quotes').set(auth(supplier))).status, 403)
    assert.equal((await request(app).get('/api/zylax/portal/orders').set(auth(investor))).status, 403)
    assert.equal((await request(app).get('/api/zylax/products').set(auth(customer))).status, 403)
    assert.equal((await request(app).get('/api/zylax/orders').set(auth(finance))).status, 200)
    assert.equal((await request(app).post('/api/zylax/products').set(auth(finance)).send({ sku: 'NO-NO', name: 'No', unit_price_eur: 1 })).status, 403)
  })
})
