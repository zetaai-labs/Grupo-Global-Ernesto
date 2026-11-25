import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { cosine, complementary, suggest } from '../src/services/matchmaking.service.js'
import { computeRiskScores, latestRiskScores, scoreFeatures } from '../src/services/churnRisk.service.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const stamp = Date.now()
const made = { orgs: [], users: [], plans: [] }

async function org(name, type, corridor, sectors) {
  const { rows } = await query(
    `INSERT INTO organizations (legal_name, tax_id, country, region_corridor, org_type, verification_status, sectors)
     VALUES ($1, $2, 'ESP', $3, $4, 'VERIFIED', $5) RETURNING org_id`,
    [`${name} ${stamp}`, `T${stamp}${made.orgs.length}`, corridor, type, sectors],
  )
  made.orgs.push(rows[0].org_id)
  return rows[0].org_id
}

async function person(name, orgId) {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role_id, status, org_id)
     SELECT $1, $2, '!test', id, 'active', $3 FROM roles WHERE name = 'client' RETURNING id`,
    [name, `ai-engine-${made.users.length}-${stamp}@example.test`, orgId],
  )
  made.users.push(rows[0].id)
  return rows[0].id
}

describe('AI engine: matchmaking vectors and renewal risk', () => {
  after(async () => {
    await query('DELETE FROM users WHERE id = ANY($1::int[])', [made.users])
    await query('DELETE FROM billing_subscriptions WHERE org_id = ANY($1::uuid[])', [made.orgs])
    await query('DELETE FROM billing_plans WHERE plan_id = ANY($1::uuid[])', [made.plans])
    await query('DELETE FROM organizations WHERE org_id = ANY($1::uuid[])', [made.orgs])
  })

  it('computes cosine similarity and complementary roles', () => {
    const a = new Map([['sector:FINTECH', 1], ['event:x', 0.4]])
    assert.equal(cosine(a, a).toFixed(6), '1.000000')
    assert.equal(cosine(a, new Map([['sector:HEALTHCARE', 1]])), 0)
    assert.ok(cosine(a, new Map([['sector:FINTECH', 1]])) > 0.9)
    assert.equal(complementary('CLIENT', 'VENDOR'), true)
    assert.equal(complementary('VENDOR', 'CLIENT'), true)
    assert.equal(complementary('CLIENT', 'CLIENT'), false)
  })

  it('ranks the most relevant people first and explains why', async () => {
    const buyer = await org('Iberia Buyer', 'CLIENT', 'SPAIN_EU', ['FINTECH'])
    const vendor = await org('Mumbai Fintech Vendor', 'VENDOR', 'INDIA', ['FINTECH'])
    const other = await org('Madrid Clinic', 'CLIENT', 'SPAIN_EU', ['HEALTHCARE'])
    const me = await person('Ana Compradora', buyer)
    const colleague = await person('Luis Compras', buyer)
    const best = await person('Priya Vendor', vendor)
    const weak = await person('Carmen Clinic', other)

    const ranked = await suggest(me, [colleague, best, weak], 5)
    assert.equal(ranked[0].user_id, best, 'same sector + complementary + bilateral corridor wins')
    assert.ok(!ranked.some((r) => r.user_id === colleague), 'people from the same organisation are left out')
    const codes = ranked[0].reasons.map((r) => r.code)
    assert.deepEqual(codes.sort(), ['COMPLEMENT', 'CORRIDOR', 'SECTOR'])
    assert.ok(ranked[0].score > (ranked.find((r) => r.user_id === weak)?.score ?? 0))

    // People who opposed profiling (GDPR) are never suggested.
    await query('UPDATE users SET processing_opposed = true WHERE id = $1', [best])
    assert.ok(!(await suggest(me, [best, weak], 5)).some((r) => r.user_id === best))
  })

  it('serves suggestions to staff and refuses event suggestions to non-participants', async () => {
    const [admin, customer] = await Promise.all(['admin', 'customer'].map((n) => loginAs(`${n}@gmail.com`)))
    const staff = await request(app).get('/api/community/suggestions').set(auth(admin))
    assert.equal(staff.status, 200)
    assert.ok(Array.isArray(staff.body.data))
    const fakeEvent = '00000000-0000-4000-8000-000000000000'
    assert.equal((await request(app).get(`/api/zylax/hub/events/events/${fakeEvent}/b2b/suggestions`).set(auth(customer))).status, 403)
  })

  it('scores renewal risk from activity and payment behaviour', async () => {
    const healthy = scoreFeatures({ status: 'ACTIVE', cancel_at_period_end: false, overdue_invoices: 0, active_users_30d: 6, logins_30d: 60, logins_prev_30d: 55, days_to_renewal: 120, course_completions_90d: 3, event_signups_90d: 2 })
    const leaving = scoreFeatures({ status: 'PAST_DUE', cancel_at_period_end: true, overdue_invoices: 2, active_users_30d: 0, logins_30d: 0, logins_prev_30d: 20, days_to_renewal: 10, course_completions_90d: 0, event_signups_90d: 0 })
    assert.equal(healthy.level, 'LOW')
    assert.equal(leaving.level, 'HIGH')
    assert.equal(leaving.reasons[0].code, 'cancelScheduled')

    const memberOrg = await org('Risky Member', 'STRATEGIC_PARTNER', 'LATAM', [])
    const plan = (await query(
      "INSERT INTO billing_plans (code, name, billing_interval, amount_eur) VALUES ($1, 'Risk test plan', 'YEAR', 1200) RETURNING plan_id",
      [`RISK-${stamp}`],
    )).rows[0].plan_id
    made.plans.push(plan)
    await query(
      `INSERT INTO billing_subscriptions (org_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES ($1, $2, 'ACTIVE', CURRENT_DATE - 300, CURRENT_DATE + 10, true)`,
      [memberOrg, plan],
    )
    const run = await computeRiskScores()
    assert.ok(run.members >= 1)
    const mine = (await latestRiskScores()).find((row) => row.org_id === memberOrg)
    assert.equal(mine.level, 'HIGH')
    assert.equal(mine.model_version, 'weighted-v1')
    const alert = await query("SELECT title FROM notifications WHERE title LIKE 'Renewal risk:%' ORDER BY created_at DESC LIMIT 1")
    assert.ok(alert.rowCount, 'Finance is alerted about members that became high risk')

    const finance = await loginAs('finance@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    assert.equal((await request(app).get('/api/billing/risk').set(auth(employee))).status, 403)
    const list = await request(app).get('/api/billing/risk').set(auth(finance))
    assert.equal(list.status, 200)
    assert.ok(list.body.data.some((row) => row.org_id === memberOrg))
  })
})
