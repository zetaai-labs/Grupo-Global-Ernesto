import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { addInterval, runBillingCycle } from '../src/services/billing.service.js'
import { formEncode, verifyWebhook } from '../src/integrations/payments/stripe.js'
import { resetPaypalToken } from '../src/integrations/payments/paypal.js'

const auth = (s) => ({ Authorization: `Bearer ${s.token}` })
const realFetch = globalThis.fetch
const NAMES = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_ENV']
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]))
const stamp = Date.now().toString().slice(-6)
const s = {}
const cleanup = { orgs: [], plans: [] }
let orgId
let otherOrgId

function stripeSignature(body, secret, time = Math.floor(Date.now() / 1000)) {
  return `t=${time},v1=${createHmac('sha256', secret).update(`${time}.${body}`).digest('hex')}`
}

async function customerLogin(email, org) {
  await query(
    `INSERT INTO users (name, email, password_hash, role_id, status, org_id)
     SELECT 'Billing Test Customer', $1, $2, id, 'active', $3 FROM roles WHERE name = 'client'
     ON CONFLICT (email) DO UPDATE SET org_id = EXCLUDED.org_id, status = 'active', password_hash = EXCLUDED.password_hash`,
    [email, await bcrypt.hash('Billing-Test-2026', 4), org],
  )
  return (await request(app).post('/api/auth/login').send({ email, password: 'Billing-Test-2026' })).body.data
}

async function newOrg(name) {
  const { rows } = await query(
    `INSERT INTO organizations (legal_name, tax_id, country, region_corridor, org_type, verification_status, onboarding_stage, billing_address)
     VALUES ($1, 'B12345674', 'ESP', 'SPAIN_EU', 'CLIENT', 'VERIFIED', 5, 'Calle Test 1, Madrid') RETURNING org_id`, [name],
  )
  cleanup.orgs.push(rows[0].org_id)
  return rows[0].org_id
}

before(async () => {
  for (const name of ['admin', 'finance', 'employee']) s[name] = await loginAs(`${name}@gmail.com`)
  orgId = await newOrg(`Billing Test ${stamp}`)
  otherOrgId = await newOrg(`Billing Other ${stamp}`)
  // Dedicated customer logins: tests run in parallel, so shared demo accounts must not change company.
  s.customer = await customerLogin('billing-customer@example.test', orgId)
  s.outsider = await customerLogin('billing-outsider@example.test', otherOrgId)
})

after(async () => {
  await query(`UPDATE users SET org_id = NULL, status = 'suspended' WHERE email IN ('billing-customer@example.test', 'billing-outsider@example.test')`)
  const subs = (await query('SELECT subscription_id FROM billing_subscriptions WHERE org_id = ANY($1::uuid[])', [cleanup.orgs])).rows.map((row) => row.subscription_id)
  const invoices = (await query('SELECT invoice_id FROM zx_invoices WHERE customer_org_id = ANY($1::uuid[])', [cleanup.orgs])).rows.map((row) => row.invoice_id)
  await query('DELETE FROM payments WHERE invoice_id = ANY($1::uuid[])', [invoices])
  await query('DELETE FROM zx_invoices WHERE corrects_invoice_id = ANY($1::uuid[])', [invoices])
  await query('DELETE FROM zx_invoices WHERE invoice_id = ANY($1::uuid[])', [invoices])
  await query('DELETE FROM billing_subscriptions WHERE subscription_id = ANY($1::uuid[])', [subs])
  await query('DELETE FROM billing_plans WHERE plan_id = ANY($1::uuid[])', [cleanup.plans])
  await query('DELETE FROM organizations WHERE org_id = ANY($1::uuid[])', [cleanup.orgs])
  await query(`DELETE FROM payment_events WHERE event_id LIKE $1`, [`%-${stamp}`])
})

afterEach(() => {
  globalThis.fetch = realFetch
  resetPaypalToken()
  for (const name of NAMES) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name] }
})

async function plan(interval = 'MONTH', amount = 100) {
  const res = await request(app).post('/api/billing/plans').set(auth(s.finance)).send({ code: `T${interval[0]}${stamp}${cleanup.plans.length}`, name: `Test ${interval}`, billing_interval: interval, amount_eur: amount })
  assert.equal(res.status, 201)
  cleanup.plans.push(res.body.data.plan_id)
  return res.body.data
}

describe('billing', () => {
  it('handles month ends and leap years', () => {
    assert.equal(addInterval('2027-01-31', 'MONTH'), '2027-02-28')
    assert.equal(addInterval('2028-01-31', 'MONTH'), '2028-02-29')
    assert.equal(addInterval('2028-02-29', 'YEAR'), '2029-02-28')
    assert.equal(addInterval('2026-12-15', 'MONTH'), '2027-01-15')
  })

  it('limits billing administration to Finance and admins', async () => {
    assert.equal((await request(app).get('/api/billing/plans').set(auth(s.employee))).status, 403)
    assert.equal((await request(app).post('/api/billing/plans').set(auth(s.customer)).send({})).status, 403)
    assert.equal((await request(app).get('/api/billing/metrics').set(auth(s.admin))).status, 200)
  })

  it('invoices the first period, renews, flags overdue and cancels at period end', async () => {
    const monthly = await plan('MONTH', 100)
    const created = await request(app).post('/api/billing/subscriptions').set(auth(s.finance)).send({ org_id: orgId, plan_id: monthly.plan_id })
    assert.equal(created.status, 201)
    assert.match(created.body.data.invoice_number, /^INV-/)
    assert.equal((await request(app).post('/api/billing/subscriptions').set(auth(s.finance)).send({ org_id: orgId, plan_id: monthly.plan_id })).status, 409)
    const id = created.body.data.subscription_id
    const first = (await query('SELECT total_eur, due_date::text AS due FROM zx_invoices WHERE subscription_id = $1', [id])).rows
    assert.deepEqual(first.map((row) => row.total_eur), ['121.00'])

    // Move the subscription three months back: one cycle issues the missing periods, once only.
    await query(`UPDATE billing_subscriptions SET current_period_start = CURRENT_DATE - 90, current_period_end = CURRENT_DATE - 60 WHERE subscription_id = $1`, [id])
    await query(`UPDATE zx_invoices SET period_start = CURRENT_DATE - 90, due_date = CURRENT_DATE - 76 WHERE subscription_id = $1`, [id])
    await runBillingCycle()
    await runBillingCycle()
    const periods = (await query('SELECT period_start::text AS p FROM zx_invoices WHERE subscription_id = $1 ORDER BY period_start', [id])).rows
    assert.equal(periods.length, 3)
    assert.equal(new Set(periods.map((row) => row.p)).size, 3)
    const sub = (await query('SELECT status, current_period_end >= CURRENT_DATE AS current FROM billing_subscriptions WHERE subscription_id = $1', [id])).rows[0]
    assert.deepEqual([sub.status, sub.current], ['PAST_DUE', true])

    const metrics = (await request(app).get('/api/billing/metrics').set(auth(s.finance))).body.data
    assert.ok(metrics.mrr_eur >= 100)
    assert.equal(metrics.arr_eur, Math.round(metrics.mrr_eur * 12 * 100) / 100)

    assert.equal((await request(app).post(`/api/billing/subscriptions/${id}/cancel`).set(auth(s.finance)).send({})).status, 200)
    await query(`UPDATE billing_subscriptions SET current_period_end = CURRENT_DATE WHERE subscription_id = $1`, [id])
    await runBillingCycle()
    assert.equal((await query('SELECT status FROM billing_subscriptions WHERE subscription_id = $1', [id])).rows[0].status, 'CANCELED')
  })

  it('pays an invoice by card through a signed Stripe webhook, exactly once', async () => {
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test' })
    const yearly = await plan('YEAR', 1000)
    const sub = await request(app).post('/api/billing/subscriptions').set(auth(s.finance)).send({ org_id: orgId, plan_id: yearly.plan_id })
    const invoice = (await query('SELECT invoice_id, total_eur FROM zx_invoices WHERE subscription_id = $1', [sub.body.data.subscription_id])).rows[0]

    let sent
    globalThis.fetch = async (url, options) => {
      sent = { url, options }
      return new Response(JSON.stringify({ id: `cs_test_${stamp}`, url: 'https://checkout.stripe.com/c/pay/test' }), { status: 200 })
    }
    assert.equal((await request(app).post(`/api/billing/invoices/${invoice.invoice_id}/checkout`).set(auth(s.employee)).send({ provider: 'stripe' })).status, 403)
    const checkout = await request(app).post(`/api/billing/invoices/${invoice.invoice_id}/checkout`).set(auth(s.customer)).send({ provider: 'stripe' })
    assert.equal(checkout.status, 200)
    assert.equal(checkout.body.data.url, 'https://checkout.stripe.com/c/pay/test')
    const form = new URLSearchParams(sent.options.body.toString())
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), String(Math.round(Number(invoice.total_eur) * 100)))
    assert.equal(form.get('metadata[invoice_id]'), invoice.invoice_id)
    assert.equal(sent.options.headers.Authorization, 'Bearer sk_test_x')

    const event = (id, amount) => JSON.stringify({
      id, type: 'checkout.session.completed',
      data: { object: { id: `cs_test_${stamp}`, payment_status: 'paid', amount_total: amount, currency: 'eur', metadata: { invoice_id: invoice.invoice_id } } },
    })
    const send = (body, signature) => request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(body)
    const good = event(`evt_1-${stamp}`, Math.round(Number(invoice.total_eur) * 100))
    assert.equal((await send(good, stripeSignature(good, 'wrong-secret'))).status, 400)
    assert.equal((await send(good, stripeSignature(good, 'whsec_test', Math.floor(Date.now() / 1000) - 3600))).status, 400, 'old signature')
    assert.equal((await send(good, stripeSignature(good, 'whsec_test'))).status, 200)
    assert.equal((await send(good, stripeSignature(good, 'whsec_test'))).status, 200, 'repeat delivery')
    const paid = (await query('SELECT status, payment_method FROM zx_invoices WHERE invoice_id = $1', [invoice.invoice_id])).rows[0]
    assert.deepEqual([paid.status, paid.payment_method], ['PAID', 'CARD'])
    assert.equal((await query(`SELECT count(*)::int AS n FROM payment_events WHERE event_id = $1`, [`evt_1-${stamp}`])).rows[0].n, 1)

    const again = event(`evt_2-${stamp}`, Math.round(Number(invoice.total_eur) * 100))
    await send(again, stripeSignature(again, 'whsec_test'))
    assert.equal((await query(`SELECT status FROM payments WHERE provider_ref = $1`, [`cs_test_${stamp}`])).rows[0].status, 'DUPLICATE')
    assert.equal((await request(app).post(`/api/billing/invoices/${invoice.invoice_id}/checkout`).set(auth(s.customer)).send({ provider: 'stripe' })).status, 404, 'paid invoices are not payable')
  })

  it('rejects a Stripe payment whose amount does not match', async () => {
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test' })
    const small = await plan('MONTH', 10)
    const sub = await request(app).post('/api/billing/subscriptions').set(auth(s.finance)).send({ org_id: orgId, plan_id: small.plan_id })
    const invoice = (await query('SELECT invoice_id FROM zx_invoices WHERE subscription_id = $1', [sub.body.data.subscription_id])).rows[0]
    globalThis.fetch = async () => new Response(JSON.stringify({ id: `cs_low_${stamp}`, url: 'https://checkout.stripe.com/x' }), { status: 200 })
    await request(app).post(`/api/billing/invoices/${invoice.invoice_id}/checkout`).set(auth(s.customer)).send({ provider: 'stripe' })
    const body = JSON.stringify({ id: `evt_low-${stamp}`, type: 'checkout.session.completed', data: { object: { id: `cs_low_${stamp}`, payment_status: 'paid', amount_total: 1, currency: 'eur', metadata: { invoice_id: invoice.invoice_id } } } })
    await request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', stripeSignature(body, 'whsec_test')).send(body)
    assert.equal((await query('SELECT status FROM zx_invoices WHERE invoice_id = $1', [invoice.invoice_id])).rows[0].status, 'ISSUED')
    assert.equal((await query(`SELECT status FROM payments WHERE provider_ref = $1`, [`cs_low_${stamp}`])).rows[0].status, 'FAILED')
  })

  it('pays with PayPal: the server captures and checks the amount, and other companies cannot claim it', async () => {
    Object.assign(process.env, { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_WEBHOOK_ID: 'wh' })
    const monthly = await plan('MONTH', 50)
    const sub = await request(app).post('/api/billing/subscriptions').set(auth(s.finance)).send({ org_id: orgId, plan_id: monthly.plan_id })
    const invoice = (await query('SELECT invoice_id, invoice_number, total_eur FROM zx_invoices WHERE subscription_id = $1', [sub.body.data.subscription_id])).rows[0]
    const orderId = `ORDER${stamp}`
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push(String(url))
      if (String(url).endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }))
      if (String(url).endsWith('/v2/checkout/orders')) {
        const order = JSON.parse(options.body)
        assert.equal(order.purchase_units[0].amount.value, Number(invoice.total_eur).toFixed(2))
        return new Response(JSON.stringify({ id: orderId, links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=x' }] }))
      }
      if (String(url).endsWith('/capture')) {
        return new Response(JSON.stringify({ status: 'COMPLETED', purchase_units: [{ custom_id: invoice.invoice_id, payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', amount: { value: Number(invoice.total_eur).toFixed(2), currency_code: 'EUR' } }] } }] }))
      }
      return new Response('{}', { status: 404 })
    }
    const checkout = await request(app).post(`/api/billing/invoices/${invoice.invoice_id}/checkout`).set(auth(s.customer)).send({ provider: 'paypal' })
    assert.equal(checkout.status, 200)
    assert.match(calls[0], /api-m\.sandbox\.paypal\.com/)

    assert.equal((await request(app).post('/api/billing/paypal/capture').set(auth(s.outsider)).send({ order_id: orderId })).status, 404)

    assert.equal((await request(app).post('/api/billing/paypal/capture').set(auth(s.customer)).send({ order_id: orderId })).status, 200)
    const paid = (await query('SELECT status, payment_method FROM zx_invoices WHERE invoice_id = $1', [invoice.invoice_id])).rows[0]
    assert.deepEqual([paid.status, paid.payment_method], ['PAID', 'PAYPAL'])
  })

  it('refuses unsigned PayPal webhooks and stays off without keys', async () => {
    assert.equal((await request(app).post('/api/webhooks/paypal').send({ id: 'x', event_type: 'PAYMENT.CAPTURE.COMPLETED' })).status, 503)
    assert.equal((await request(app).post('/api/webhooks/stripe').send({})).status, 503)
    Object.assign(process.env, { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_WEBHOOK_ID: 'wh' })
    assert.equal((await request(app).post('/api/webhooks/paypal').send({ id: 'x', event_type: 'PAYMENT.CAPTURE.COMPLETED' })).status, 400)
    const providers = (await request(app).get('/api/billing/providers').set(auth(s.customer))).body.data
    assert.deepEqual(providers, { stripe: false, paypal: true })
  })

  it('encodes Stripe forms and rejects bad signatures', () => {
    assert.equal(formEncode({ a: { b: [{ c: 1 }] } }).toString(), 'a%5Bb%5D%5B0%5D%5Bc%5D=1')
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    const body = '{"id":"evt"}'
    assert.ok(verifyWebhook(body, stripeSignature(body, 'whsec_test')))
    assert.equal(verifyWebhook(body, 't=1,v1=00'), null)
    assert.equal(verifyWebhook(`${body} `, stripeSignature(body, 'whsec_test')), null)
  })
})
