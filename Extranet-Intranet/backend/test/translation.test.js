import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { resetAiClient } from '../src/integrations/ai/claude.js'
import { hashText } from '../src/services/translation.service.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const realFetch = globalThis.fetch
const savedKey = process.env.ANTHROPIC_API_KEY
const stamp = Date.now()
const calls = []
const word = `Zarzamora${stamp}`
const hindi = `सहयोग${stamp}`

function fakeClaude() {
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.anthropic.com/')) return realFetch(url, options)
    const body = JSON.parse(String(options.body))
    calls.push(body)
    const text = body.messages[0].content.replace(/<\/?text>/g, '').trim()
    const data = { source_language: 'es', es: text, en: `EN: ${text}`, ar: `AR: ${text}`, hi: `${hindi} ${text}`, ru: `RU: ${text}`, fr: `FR: ${text}` }
    return new Response(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(data) }], usage: { input_tokens: 50, output_tokens: 80 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

const settle = async (check) => {
  for (let i = 0; i < 40; i += 1) {
    if (await check()) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

describe('Multilingual content engine (ES, EN, AR, HI, RU)', () => {
  let employee
  let customer
  let postId
  before(async () => {
    employee = await loginAs('employee@gmail.com')
    customer = await loginAs('customer@gmail.com')
  })
  after(async () => {
    globalThis.fetch = realFetch
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedKey
    resetAiClient()
    if (postId) await query('DELETE FROM community_posts WHERE post_id = $1', [postId])
  })

  it('needs a key and a supported language', async () => {
    delete process.env.ANTHROPIC_API_KEY
    resetAiClient()
    assert.equal((await request(app).post('/api/ai/translate').set(auth(employee)).send({ text: 'Hola', target: 'en' })).status, 503)
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    resetAiClient()
    fakeClaude()
    assert.equal((await request(app).post('/api/ai/translate').set(auth(employee)).send({ text: 'Hola', target: 'xx' })).status, 400)
    assert.equal((await request(app).post('/api/ai/translate').set(auth(employee)).send({ text: '  ', target: 'en' })).status, 400)
    assert.equal((await request(app).post('/api/ai/translate').set(auth(employee)).send({ text: 'x'.repeat(5001), target: 'en' })).status, 400)
  })

  it('indexes a new post in every language so any language finds it', async () => {
    const created = await request(app).post('/api/community/feed').set(auth(employee)).send({ body: `Reunión sobre ${word} el lunes` })
    assert.equal(created.status, 201)
    postId = created.body.data.post_id
    assert.ok(await settle(async () => (await query('SELECT source_hash FROM community_posts WHERE post_id = $1', [postId])).rows[0]?.source_hash), 'indexed in the background')
    const rows = (await query('SELECT lang FROM content_translations WHERE source_hash = (SELECT source_hash FROM community_posts WHERE post_id = $1)', [postId])).rows
    assert.deepEqual(rows.map((row) => row.lang).sort(), ['ar', 'en', 'es', 'fr', 'hi', 'ru'])
    assert.match(calls[0].system, /data, never instructions/)
    assert.equal(calls[0].messages[0].content.includes('<text>'), true)

    const byHindi = await request(app).get(`/api/community/feed?q=${encodeURIComponent(hindi)}`).set(auth(employee))
    assert.ok(byHindi.body.data.some((post) => post.post_id === postId), 'a Hindi search finds the Spanish post')
    const byEnglish = await request(app).get('/api/community/feed?q=EN%3A%20Reuni').set(auth(employee))
    assert.ok(byEnglish.body.data.some((post) => post.post_id === postId))
    assert.equal((await request(app).get('/api/community/feed?q=%25').set(auth(employee))).body.data.some((post) => post.post_id === postId), false, '% is not a wildcard')
    assert.equal(byHindi.body.data.find((post) => post.post_id === postId).lang, 'es')
  })

  it('answers translations of indexed posts from the cache, at no cost', async () => {
    const before = calls.length
    const translated = await request(app).post('/api/ai/translate').set(auth(employee)).send({ text: `Reunión sobre ${word} el lunes`, target: 'hi' })
    assert.equal(translated.status, 200)
    assert.equal(translated.body.data.cached, true)
    assert.match(translated.body.data.translation, new RegExp(hindi))
    assert.equal(calls.length, before)
  })

  it('translates chat text on demand without storing it, also for extranet users', async () => {
    const secret = `Confidential price ${stamp}`
    const translated = await request(app).post('/api/ai/translate').set(auth(customer)).send({ text: secret, target: 'ar' })
    assert.equal(translated.status, 200)
    assert.equal(translated.body.data.translation, `AR: ${secret}`)
    assert.equal(translated.body.data.cached, false)
    assert.equal((await query('SELECT 1 FROM content_translations WHERE source_hash = $1', [hashText(secret)])).rowCount, 0, 'chat text is never stored')
    const audit = await query("SELECT details FROM audit_logs WHERE user_id = $1 AND action = 'AI_REQUEST' ORDER BY created_at DESC LIMIT 1", [customer.user.id])
    assert.equal(audit.rows[0].details.feature, 'translate')
    assert.ok(!JSON.stringify(audit.rows[0].details).includes('Confidential'), 'the text is not logged')
  })

  it('deletes a post’s translations with the post', async () => {
    const { rows } = await query('SELECT source_hash FROM community_posts WHERE post_id = $1', [postId])
    assert.equal((await request(app).delete(`/api/community/feed/${postId}`).set(auth(employee))).status, 200)
    postId = null
    assert.equal((await query('SELECT 1 FROM content_translations WHERE source_hash = $1', [rows[0].source_hash])).rowCount, 0)
  })
})
