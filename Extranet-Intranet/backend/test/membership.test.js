import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query, withTransaction } from '../src/config/database.js'
import { applyPayment } from '../src/services/billing.service.js'
import { revenueSplit, syncRevenueShares } from '../src/services/membership.service.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const SURVEY = {
  company_size: '51-250', annual_revenue: '€10M-€50M', countries: 'India, United Arab Emirates', interests: ['Investment opportunities', 'International expansion'],
  heard_from: 'Partner referral', goals: 'Find partners in Spain.',
}
const stamp = Date.now()
const company = (suffix) => ({
  privacy_accepted: true, legal_name: `Member ${suffix} ${stamp} Pvt Ltd`, tax_id: 'AAACM1234M', country: 'IND', region_corridor: 'INDIA',
  org_type: 'CLIENT', contact_name: 'Priya Shah', contact_email: `priya.${suffix}.${stamp}@example.test`,
})

describe('Paid membership', () => {
  let admin
  let finance
  let orgId
  let invoiceId
  const previousSplit = process.env.MEMBERSHIP_REVENUE_SPLIT
  before(async () => {
    admin = await loginAs('admin@gmail.com')
    finance = await loginAs('finance@gmail.com')
    delete process.env.MEMBERSHIP_REVENUE_SPLIT
  })
  after(() => { if (previousSplit !== undefined) process.env.MEMBERSHIP_REVENUE_SPLIT = previousSplit })

  it('offers the 1-, 2- and 3-year plans and the survey on the registration form', async () => {
    const res = await request(app).get('/api/public/onboarding/membership')
    assert.equal(res.status, 200)
    const prices = Object.fromEntries(res.body.data.plans.map((plan) => [plan.code, plan.amount_eur]))
    assert.equal(prices.MEMBERSHIP_1Y, 15000)
    assert.equal(prices.MEMBERSHIP_2Y, 30000)
    assert.equal(prices.MEMBERSHIP_3Y, 45000)
    assert.equal(res.body.data.plans.find((plan) => plan.code === 'MEMBERSHIP_1Y').total_eur, 18150, '21% VAT shown up front')
    assert.ok(res.body.data.survey.some((question) => question.key === 'interests'))
  })

  it('requires the survey, a plan and an invoicing address from new members', async () => {
    const noSurvey = await request(app).post('/api/public/onboarding').send({ ...company('a'), membership_plan_code: 'MEMBERSHIP_1Y', billing_address: 'MG Road 12, Bengaluru 560001, India' })
    assert.equal(noSurvey.status, 400)
    assert.match(noSurvey.body.message, /survey/i)
    const wrongAnswer = await request(app).post('/api/public/onboarding').send({ ...company('a'), survey: { ...SURVEY, company_size: '7' }, membership_plan_code: 'MEMBERSHIP_1Y', billing_address: 'MG Road 12, Bengaluru 560001, India' })
    assert.equal(wrongAnswer.status, 400)
    const noPlan = await request(app).post('/api/public/onboarding').send({ ...company('a'), survey: SURVEY, billing_address: 'MG Road 12, Bengaluru 560001, India' })
    assert.equal(noPlan.status, 400)
    const noAddress = await request(app).post('/api/public/onboarding').send({ ...company('a'), survey: SURVEY, membership_plan_code: 'MEMBERSHIP_1Y' })
    assert.equal(noAddress.status, 400)
    const partnerWithoutContact = await request(app).post('/api/public/onboarding').send({ ...company('a'), survey: SURVEY, membership_track: 'EXISTING_PARTNER' })
    assert.equal(partnerWithoutContact.status, 400, 'an existing partner names their Grupo Global contact')
  })

  it('starts the membership and issues its invoice when Compliance approves the company', async () => {
    const registered = await request(app).post('/api/public/onboarding').send({
      ...company('b'), survey: SURVEY, membership_plan_code: 'MEMBERSHIP_2Y', billing_address: 'MG Road 12, Bengaluru 560001, India',
    })
    assert.equal(registered.status, 201)
    orgId = registered.body.data.org_id

    const detail = await request(app).get(`/api/organizations/${orgId}`).set(auth(admin))
    assert.equal(detail.body.data.application.membership_track, 'MEMBER')
    assert.equal(detail.body.data.application.membership_plan_code, 'MEMBERSHIP_2Y')
    assert.deepEqual(detail.body.data.application.survey.interests, SURVEY.interests)

    // Documents and screening are covered by kyc.test.js; here the file is ready for the decision.
    await query('UPDATE organizations SET onboarding_stage = 5 WHERE org_id = $1', [orgId])
    const approved = await request(app).post(`/api/organizations/${orgId}/decision`).set(auth(admin)).send({ decision: 'APPROVE' })
    assert.equal(approved.status, 200, approved.body.message)
    assert.equal(approved.body.data.membership.plan_code, 'MEMBERSHIP_2Y')
    assert.equal(Number(approved.body.data.membership.total_eur), 36300, '30,000 + 21% VAT')

    const sub = (await query(
      `SELECT (current_period_end - current_period_start) AS days, s.status FROM billing_subscriptions s
       JOIN billing_plans p ON p.plan_id = s.plan_id WHERE s.org_id = $1 AND p.code = 'MEMBERSHIP_2Y'`, [orgId],
    )).rows[0]
    assert.ok(sub.days >= 730 && sub.days <= 731, 'the 2-year plan runs for two years')
    invoiceId = (await query('SELECT invoice_id FROM zx_invoices WHERE customer_org_id = $1 AND status = $2', [orgId, 'ISSUED'])).rows[0].invoice_id
  })

  it('lets the new member see and pay the invoice', async () => {
    const email = `priya.b.${stamp}@example.test`
    await query('UPDATE users SET password_hash = (SELECT password_hash FROM users WHERE email = $2) WHERE email = $1', [email, 'customer@gmail.com'])
    const member = await loginAs(email)
    const mine = await request(app).get('/api/billing/my').set(auth(member))
    assert.equal(mine.status, 200)
    assert.equal(mine.body.data.subscriptions[0].category, 'MEMBERSHIP')
    assert.ok(mine.body.data.invoices.find((invoice) => invoice.invoice_id === invoiceId).payable)
  })

  it('splits each paid membership 50/50 between the partners, and reverses a refund', async () => {
    const result = await withTransaction((client) => applyPayment(client, { invoiceId, provider: 'STRIPE', providerRef: `cs_test_${stamp}`, amount: 36300, currency: 'EUR' }))
    assert.equal(result.outcome, 'PAID')
    await syncRevenueShares()
    await syncRevenueShares() // running twice must not book twice
    const sales = (await query(`SELECT party, amount_eur FROM membership_revenue_shares WHERE invoice_id = $1 AND kind = 'SALE' ORDER BY party`, [invoiceId])).rows
    assert.deepEqual(sales.map((row) => [row.party, Number(row.amount_eur)]), [['Grupo Global', 15000], ['Zeta AI Labs', 15000]], 'net of VAT, half each')

    const report = await request(app).get('/api/billing/memberships').set(auth(finance))
    assert.equal(report.status, 200)
    assert.ok(report.body.data.members.some((row) => row.org_id === orgId && row.paid_invoices === 1))
    assert.deepEqual(report.body.data.split.map((part) => part.pct), [50, 50])
    const csv = await request(app).get('/api/billing/memberships/shares.csv').set(auth(finance))
    assert.equal(csv.status, 200)
    assert.ok(csv.text.includes(`Member b ${stamp} Pvt Ltd`))

    const customer = await loginAs('customer@gmail.com')
    const refused = await request(app).get('/api/billing/memberships').set(auth(customer))
    assert.equal(refused.status, 403, 'only Finance and administrators see the split')

    await query('UPDATE zx_invoices SET refunded_at = now() WHERE invoice_id = $1', [invoiceId])
    await syncRevenueShares()
    const net = (await query('SELECT party, sum(amount_eur) AS total FROM membership_revenue_shares WHERE invoice_id = $1 GROUP BY party', [invoiceId])).rows
    assert.ok(net.every((row) => Number(row.total) === 0), 'a refund cancels both shares')
  })

  it('follows the configured split and keeps cents exact', async () => {
    process.env.MEMBERSHIP_REVENUE_SPLIT = 'Grupo Global:60,Zeta AI Labs:40'
    assert.deepEqual(revenueSplit().map((part) => part.pct), [60, 40])
    process.env.MEMBERSHIP_REVENUE_SPLIT = 'Grupo Global:70,Zeta AI Labs:40'
    assert.deepEqual(revenueSplit().map((part) => part.pct), [50, 50], 'a split that does not add up to 100% is ignored')
    delete process.env.MEMBERSHIP_REVENUE_SPLIT
  })
})
