import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const stamp = Date.now()

describe('Call center', () => {
  let manager
  let agentA
  let agentB
  let outsider
  let campaignId
  let inboundId
  const ids = {}

  before(async () => {
    manager = await loginAs('manager@gmail.com')
    agentA = await loginAs('employee@gmail.com')
    agentB = await loginAs('finance@gmail.com')
    outsider = await loginAs('hr@gmail.com')
    ids.a = agentA.user.id
    ids.b = agentB.user.id
    await query('DELETE FROM cc_agents WHERE user_id = ANY($1)', [[ids.a, ids.b]])
  })
  after(async () => {
    await query('DELETE FROM cc_campaigns WHERE name LIKE $1', [`%${stamp}%`])
    await query('DELETE FROM cc_agents WHERE user_id = ANY($1)', [[ids.a, ids.b]])
  })

  it('only supervisors set it up; people who are not agents are told so', async () => {
    assert.equal((await request(app).get('/api/call-center/live').set(auth(agentA))).status, 403)
    assert.equal((await request(app).post('/api/call-center/campaigns').set(auth(agentA)).send({ name: 'x' })).status, 403)
    const desk = await request(app).get('/api/call-center/me').set(auth(agentA))
    assert.equal(desk.body.data.agent, null)
    assert.equal((await request(app).post('/api/call-center/next').set(auth(agentA)).send({})).status, 403)
    const customer = await loginAs('customer@gmail.com')
    assert.equal((await request(app).get('/api/call-center/me').set(auth(customer))).status, 403, 'external accounts never reach the call center')
  })

  it('creates a campaign, imports contacts without duplicates, and adds agents', async () => {
    const created = await request(app).post('/api/call-center/campaigns').set(auth(manager)).send({
      name: `India membership ${stamp}`, purpose: 'MEMBERSHIP_SALES', region: 'INDIA', script: 'Hello, I am calling from Grupo Global…',
    })
    assert.equal(created.status, 201)
    campaignId = created.body.data.campaign_id
    const imported = await request(app).post(`/api/call-center/campaigns/${campaignId}/contacts`).set(auth(manager)).send({
      contacts: [
        { name: 'Asha Rao', company: 'Rao Textiles', phone: '+91 98765 00001', country: 'IND' },
        { name: 'Vikram Shah', company: 'Shah Exports', phone: '+91 98765 00002', country: 'IND' },
        { name: 'Asha Rao again', phone: '+91-98765-00001' },
        { name: 'No contact details' },
        { name: 'Meera Iyer', company: 'Iyer Foods', phone: '+91 98765 00003' },
      ],
    })
    assert.deepEqual(imported.body.data, { added: 3, duplicates: 1, do_not_call: 0, invalid: 1 })

    for (const [id, team] of [[ids.a, 'Bengaluru'], [ids.b, 'Madrid']]) {
      const added = await request(app).post('/api/call-center/agents').set(auth(manager)).send({ user_id: id, team, region: 'INDIA' })
      assert.equal(added.status, 201)
    }
    const nonStaff = (await query("SELECT id FROM users WHERE email = 'customer@gmail.com'")).rows[0].id
    assert.equal((await request(app).post('/api/call-center/agents').set(auth(manager)).send({ user_id: nonStaff })).status, 400)
  })

  it('never gives the same contact to two agents pressing "Next call" together', async () => {
    const [a, b] = await Promise.all([
      request(app).post('/api/call-center/next').set(auth(agentA)).send({ campaign_id: campaignId }),
      request(app).post('/api/call-center/next').set(auth(agentB)).send({ campaign_id: campaignId }),
    ])
    assert.ok(a.body.data && b.body.data)
    assert.notEqual(a.body.data.contact_id, b.body.data.contact_id)
    assert.match(a.body.data.script, /Grupo Global/)
    const again = await request(app).post('/api/call-center/next').set(auth(agentA)).send({ campaign_id: campaignId })
    assert.equal(again.body.data.contact_id, a.body.data.contact_id, 'an unfinished contact comes back to the same agent')
    ids.contactA = a.body.data.contact_id
    ids.contactB = b.body.data.contact_id
    const stolen = await request(app).post(`/api/call-center/contacts/${ids.contactB}/calls`).set(auth(agentA)).send({ outcome: 'SALE' })
    assert.equal(stolen.status, 409, 'an agent cannot record a call on someone else’s contact')
  })

  it('moves contacts on by outcome: retry later, callback to the same agent, never again', async () => {
    const noAnswer = await request(app).post(`/api/call-center/contacts/${ids.contactA}/calls`).set(auth(agentA)).send({ outcome: 'NO_ANSWER', duration_sec: 20 })
    assert.equal(noAnswer.status, 201)
    const retry = (await query('SELECT status, attempts, next_call_at > now() AS later, locked_by FROM cc_contacts WHERE contact_id = $1', [ids.contactA])).rows[0]
    assert.deepEqual(retry, { status: 'NEW', attempts: 1, later: true, locked_by: null })

    const missing = await request(app).post(`/api/call-center/contacts/${ids.contactB}/calls`).set(auth(agentB)).send({ outcome: 'CALLBACK' })
    assert.equal(missing.status, 400, 'a callback needs a time')
    const soon = new Date(Date.now() + 2 * 60 * 1000).toISOString()
    await request(app).post(`/api/call-center/contacts/${ids.contactB}/calls`).set(auth(agentB)).send({ outcome: 'CALLBACK', callback_at: soon, notes: 'Call after lunch' })
    const desk = await request(app).get('/api/call-center/me').set(auth(agentB))
    assert.equal(desk.body.data.callbacks[0].contact_id, ids.contactB)
    const next = await request(app).post('/api/call-center/next').set(auth(agentB)).send({ campaign_id: campaignId })
    assert.equal(next.body.data.contact_id, ids.contactB, 'a due callback comes first')
    assert.equal(next.body.data.history[0].notes, 'Call after lunch')

    await request(app).post(`/api/call-center/contacts/${ids.contactB}/calls`).set(auth(agentB)).send({ outcome: 'DO_NOT_CALL' })
    const phone = (await query('SELECT phone FROM cc_contacts WHERE contact_id = $1', [ids.contactB])).rows[0].phone
    const other = await request(app).post('/api/call-center/campaigns').set(auth(manager)).send({ name: `Survey ${stamp}`, purpose: 'SURVEY' })
    const blocked = await request(app).post(`/api/call-center/campaigns/${other.body.data.campaign_id}/contacts`).set(auth(manager)).send({ contacts: [{ name: 'Same person', phone }] })
    assert.equal(blocked.body.data.do_not_call, 1, '"do not call" applies to every campaign')
  })

  it('records an inbound call and shows everything on the live board', async () => {
    const inbound = await request(app).post('/api/call-center/campaigns').set(auth(manager)).send({ name: `Member line ${stamp}`, direction: 'INBOUND', purpose: 'MEMBER_SUPPORT' })
    inboundId = inbound.body.data.campaign_id
    const call = await request(app).post('/api/call-center/inbound').set(auth(agentA)).send({
      campaign_id: inboundId, name: 'Ravi Kumar', company: 'Kumar Steel', phone: '+91 90000 11111', outcome: 'INTERESTED', duration_sec: 300, notes: 'Wants the 3-year plan',
    })
    assert.equal(call.status, 201)

    const live = await request(app).get('/api/call-center/live').set(auth(manager))
    assert.equal(live.status, 200)
    const rowA = live.body.data.agents.find((row) => row.user_id === ids.a)
    assert.ok(rowA.calls >= 2)
    assert.ok(rowA.positive >= 1)
    assert.ok(live.body.data.totals.conversion_pct >= 0)
    const campaigns = await request(app).get('/api/call-center/campaigns').set(auth(manager))
    const mine = campaigns.body.data.find((row) => row.campaign_id === campaignId)
    assert.equal(mine.contacts, 3)
    assert.equal(mine.do_not_call, 1)
  })

  it('switching an agent off frees their contact for others', async () => {
    const picked = await request(app).post('/api/call-center/next').set(auth(agentA)).send({ campaign_id: campaignId })
    assert.ok(picked.body.data)
    const off = await request(app).patch(`/api/call-center/agents/${ids.a}`).set(auth(manager)).send({ active: false })
    assert.equal(off.status, 200)
    const lock = (await query('SELECT locked_by FROM cc_contacts WHERE contact_id = $1', [picked.body.data.contact_id])).rows[0]
    assert.equal(lock.locked_by, null)
    assert.equal((await request(app).post('/api/call-center/next').set(auth(agentA)).send({})).status, 403)
    assert.equal((await request(app).get('/api/call-center/live').set(auth(outsider))).status, 403, 'HR is not a call center supervisor')
  })
})
