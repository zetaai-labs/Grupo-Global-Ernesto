import { describe, it, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { resetAiClient } from '../src/integrations/ai/claude.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const realFetch = globalThis.fetch
const saved = { key: process.env.ANTHROPIC_API_KEY, model: process.env.AI_MODEL }
const calls = []
let reply = {}

function fakeAnthropic() {
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.anthropic.com/')) return realFetch(url, options)
    calls.push({ url: String(url), body: JSON.parse(String(options.body)), headers: options.headers })
    return new Response(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: reply.stop_reason || 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(reply.data || {}) }], usage: { input_tokens: 120, output_tokens: 40 },
    }), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } })
  }
}

describe('AI assistant (Claude)', () => {
  beforeEach(() => {
    calls.length = 0
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    delete process.env.AI_MODEL
    resetAiClient()
    fakeAnthropic()
  })
  after(() => {
    globalThis.fetch = realFetch
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved.key
    if (saved.model !== undefined) process.env.AI_MODEL = saved.model
    resetAiClient()
  })

  it('is off without a key and is for staff only', async () => {
    const [employee, customer] = await Promise.all(['employee', 'customer'].map((n) => loginAs(`${n}@gmail.com`)))
    delete process.env.ANTHROPIC_API_KEY
    assert.equal((await request(app).get('/api/ai/status').set(auth(employee))).body.data.configured, false)
    assert.equal((await request(app).post('/api/ai/zylax/helpdesk/tickets/search').set(auth(employee)).send({ query: 'open tickets' })).status, 503)
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    assert.equal((await request(app).post('/api/ai/zylax/helpdesk/tickets/search').set(auth(customer)).send({ query: 'open tickets' })).status, 403)
    assert.equal(calls.length, 0)
  })

  it('summarises a record without sending confidential fields, using Opus 5.5 with fallbacks', async () => {
    const hr = await loginAs('hr@gmail.com')
    const profile = (await request(app).get('/api/zylax/hub/people/profiles').set(auth(hr))).body.data[0]
    reply = { data: { summary: 'Perfil del responsable técnico.', key_facts: ['Hyderabad'], next_steps: ['Revisar objetivos'], risks: [] } }
    const response = await request(app).post(`/api/ai/zylax/people/profiles/${profile.record_id}/summary`).set(auth(hr)).send({ lang: 'es' })
    assert.equal(response.status, 200, JSON.stringify(response.body))
    assert.equal(response.body.data.summary, 'Perfil del responsable técnico.')
    const sent = calls[0].body
    assert.equal(sent.model, 'claude-opus-5-5')
    assert.equal(sent.fallbacks, 'default')
    assert.equal(sent.output_config.format.type, 'json_schema')
    assert.ok(/Spanish/.test(sent.system))
    const text = JSON.stringify(sent.messages)
    assert.ok(!text.includes('Annual salary') && !text.includes('National ID'), 'confidential fields are never sent')
    const log = await query("SELECT details FROM audit_logs WHERE action = 'AI_REQUEST' ORDER BY created_at DESC LIMIT 1")
    assert.equal(log.rows[0].details.feature, 'record_summary')
    assert.equal(log.rows[0].details.input_tokens, 120)
  })

  it('turns a search into list filters and rejects statuses the list does not have', async () => {
    const tech = await loginAs('techadmin@gmail.com')
    reply = { data: { status: 'OPEN', keywords: 'VPN', explanation: 'Open tickets about VPN.' } }
    const ok = await request(app).post('/api/ai/zylax/helpdesk/tickets/search').set(auth(tech)).send({ query: 'nuevos problemas de VPN', lang: 'es' })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.deepEqual(ok.body.data, { status: 'OPEN', q: 'VPN', explanation: 'Open tickets about VPN.' })
    assert.ok(calls[0].body.output_config.format.schema.properties.status.enum.includes('ANY'))
    reply = { data: { status: 'NOT_A_STATUS', keywords: '', explanation: 'x' } }
    assert.equal((await request(app).post('/api/ai/zylax/helpdesk/tickets/search').set(auth(tech)).send({ query: 'anything weird' })).status, 502)
  })

  it('handles a safety decline and only works on files and relationships the user can open', async () => {
    const [manager, employee] = await Promise.all(['manager', 'employee'].map((n) => loginAs(`${n}@gmail.com`)))
    reply = { stop_reason: 'refusal', data: {} }
    const relId = (await query('SELECT rel_id FROM crm_relationships ORDER BY created_at LIMIT 1')).rows[0]?.rel_id
    if (relId) {
      const declined = await request(app).post(`/api/ai/crm/${relId}/next-step`).set(auth(manager)).send({})
      assert.ok([404, 422].includes(declined.status), `got ${declined.status}`)
    }
    assert.equal((await request(app).post('/api/ai/files/999999/summary').set(auth(employee)).send({})).status, 404)
  })
})
