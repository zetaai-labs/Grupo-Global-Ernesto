import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const realFetch = globalThis.fetch
const NAMES = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_TERMINAL_READERS']
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]))
const sign = (body, time = Math.floor(Date.now() / 1000)) => `t=${time},v1=${createHmac('sha256', 'whsec_test').update(`${time}.${body}`).digest('hex')}`

describe('POS card terminals (Stripe Terminal)', () => {
  after(() => {
    globalThis.fetch = realFetch
    for (const name of NAMES) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  })

  it('sends an issued POS invoice to the reader and marks it paid only from the webhook', async () => {
    const employee = await loginAs('employee@gmail.com')
    const customer = await loginAs('customer@gmail.com')
    for (const name of NAMES) delete process.env[name]
    assert.equal((await request(app).get('/api/zylax/hub/pos/terminal/readers').set(auth(employee))).body.meta.configured, false)

    const product = (await query(`SELECT product_id FROM zx_products WHERE sku = 'DEMO-SCN-02'`)).rows[0].product_id
    const sale = await request(app).post('/api/zylax/hub/pos/sales').set(auth(employee)).send({ payment_method: 'TERMINAL', items: [{ product_id: product, qty: 1 }] })
    assert.equal(sale.status, 201, JSON.stringify(sale.body))
    assert.equal(sale.body.data.status, 'ISSUED', 'waits for the card reader')
    const invoice = sale.body.data
    const path = `/api/zylax/hub/pos/invoices/${invoice.invoice_id}/terminal`
    assert.equal((await request(app).post(path).set(auth(employee)).send({})).status, 503, 'not configured yet')

    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_TERMINAL_READERS: 'tmr_FRONT1:Front desk,bad-id' })
    const calls = []
    const intentId = `pi_term_${Date.now()}`
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), body: String(options?.body || ''), key: options?.headers?.['Idempotency-Key'] })
      if (String(url).endsWith('/payment_intents')) return new Response(JSON.stringify({ id: intentId }), { status: 200 })
      return new Response(JSON.stringify({ id: 'tmr_FRONT1', action: { status: 'in_progress' } }), { status: 200 })
    }

    const readers = await request(app).get('/api/zylax/hub/pos/terminal/readers').set(auth(employee))
    assert.deepEqual(readers.body.data, [{ id: 'tmr_FRONT1', label: 'Front desk' }], 'invalid reader ids are ignored')
    assert.equal((await request(app).post(path).set(auth(customer)).send({})).status, 403)
    assert.equal((await request(app).post(path).set(auth(employee)).send({ reader_id: 'tmr_OTHER' })).status, 400)

    const started = await request(app).post(path).set(auth(employee)).send({ reader_id: 'tmr_FRONT1' })
    assert.equal(started.status, 202, JSON.stringify(started.body))
    assert.match(calls[0].body, /payment_method_types%5B0%5D=card_present/)
    assert.match(calls[0].body, new RegExp(`amount=${Math.round(Number(invoice.total_eur) * 100)}`))
    assert.ok(calls[0].key, 'idempotency key against double charges')
    assert.match(calls[1].url, /\/terminal\/readers\/tmr_FRONT1\/process_payment_intent$/)
    assert.equal((await request(app).get(path).set(auth(employee))).body.data.invoice_status, 'ISSUED')

    // A wrong amount is not accepted.
    const event = (type, amount) => JSON.stringify({ id: `evt_${type}_${amount}_${Date.now()}`, type, data: { object: { id: intentId, amount_received: amount, currency: 'eur', metadata: { invoice_id: invoice.invoice_id, channel: 'terminal' } } } })
    const low = event('payment_intent.succeeded', 1)
    await request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', sign(low)).send(low)
    assert.equal((await request(app).get(path).set(auth(employee))).body.data.invoice_status, 'ISSUED')

    const good = event('payment_intent.succeeded', Math.round(Number(invoice.total_eur) * 100))
    assert.equal((await request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', sign(good)).send(good)).status, 200)
    const status = await request(app).get(path).set(auth(employee))
    assert.equal(status.body.data.invoice_status, 'PAID')
    const paid = (await query('SELECT payment_method FROM zx_invoices WHERE invoice_id = $1', [invoice.invoice_id])).rows[0]
    assert.equal(paid.payment_method, 'CARD')
    assert.equal((await request(app).post(path).set(auth(employee)).send({})).status, 409, 'cannot charge a paid invoice')
  })
})
