import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, generateKeyPairSync } from 'node:crypto'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { providers, vttToText } from '../src/integrations/video/streamUpload.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const ENV_KEYS = ['VIDEO_BIO_DAILY_LIMIT', 'STREAMING_PROVIDER', 'MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY', 'MUX_WEBHOOK_SECRET', 'CF_STREAM_WEBHOOK_SECRET']
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
const realFetch = globalThis.fetch
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const word = `Zanzibar${Date.now()}`

// A fake Mux API: the asset moves from processing to ready, captions included.
const mux = { asset: 'preparing', duration: 185.4, calls: [] }
function fakeFetch(url, options = {}) {
  const method = options.method || 'GET'
  mux.calls.push(`${method} ${url}`)
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))
  if (url === 'https://api.mux.com/video/v1/uploads' && method === 'POST') {
    const body = JSON.parse(options.body)
    mux.uploadBody = body
    return json({ data: { id: 'up_test_1', url: 'https://storage.mux.example/upload/up_test_1' } }, 201)
  }
  if (url.endsWith('/uploads/up_test_1')) return json({ data: { id: 'up_test_1', status: 'asset_created', asset_id: 'as_test_1' } })
  if (url.endsWith('/assets/as_test_1') && method === 'GET') {
    if (mux.asset !== 'ready') return json({ data: { id: 'as_test_1', status: 'preparing' } })
    return json({ data: {
      id: 'as_test_1', status: 'ready', duration: mux.duration,
      playback_ids: [{ id: 'pb_test_123', policy: 'signed' }],
      tracks: [{ id: 'video1', type: 'video' }, { id: 'tr_test_1', type: 'text', text_source: 'generated_vod', status: 'ready' }],
    } })
  }
  if (url.startsWith('https://stream.mux.com/pb_test_123/text/tr_test_1.vtt?token=')) {
    const token = new URL(url).searchParams.get('token')
    mux.transcriptAudience = jwt.verify(token, publicKey.export({ type: 'spki', format: 'pem' })).aud
    return Promise.resolve(new Response(`WEBVTT\n\n1\n00:00:00.000 --> 00:00:04.000\nHola, soy <b>Ana</b>.\n\n2\n00:00:04.000 --> 00:00:09.000\nTrabajo en ${word} y fintech.\n`, { status: 200 }))
  }
  if (url.endsWith('/assets/as_test_1') && method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
  return json({ error: 'unexpected' }, 500)
}

const signMux = (body, secret = 'whsec_test') => {
  const t = Math.floor(Date.now() / 1000)
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
}
const webhook = (event) => {
  const body = JSON.stringify(event)
  return request(app).post('/api/webhooks/mux').set('Content-Type', 'application/json').set('Mux-Signature', signMux(body)).send(body)
}

describe('Video bios: direct upload, processing, transcript and signed playback', () => {
  let employee
  let manager

  before(async () => {
    employee = await loginAs('employee@gmail.com')
    manager = await loginAs('manager@gmail.com')
    for (const key of ENV_KEYS) delete process.env[key]
    await query('DELETE FROM video_bios WHERE user_id = $1', [employee.user.id])
  })

  after(async () => {
    globalThis.fetch = realFetch
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await query('DELETE FROM video_bios WHERE user_id = $1', [employee.user.id])
  })

  it('says uploads are off until the provider keys are set', async () => {
    const status = await request(app).get('/api/community/me/video-bio').set(auth(employee))
    assert.equal(status.status, 200)
    assert.equal(status.body.meta.enabled, false)
    assert.equal(status.body.data, null)
    assert.equal((await request(app).post('/api/community/me/video-bio/upload').set(auth(employee)).send({ language: 'es' })).status, 503)
  })

  it('creates a signed-playback direct upload with auto captions', async () => {
    Object.assign(process.env, {
      VIDEO_BIO_DAILY_LIMIT: '100000', STREAMING_PROVIDER: 'mux', MUX_TOKEN_ID: 'tok_id', MUX_TOKEN_SECRET: 'tok_secret', MUX_WEBHOOK_SECRET: 'whsec_test',
      MUX_SIGNING_KEY_ID: 'sk_test', MUX_SIGNING_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    })
    globalThis.fetch = fakeFetch
    assert.equal((await request(app).post('/api/community/me/video-bio/upload').set(auth(employee)).send({ language: 'xx' })).status, 400)
    const created = await request(app).post('/api/community/me/video-bio/upload').set(auth(employee)).send({ language: 'es' })
    assert.equal(created.status, 201)
    assert.equal(created.body.data.upload_url, 'https://storage.mux.example/upload/up_test_1')
    assert.equal(created.body.data.method, 'PUT')
    assert.equal(created.body.data.max_seconds, 300)
    assert.deepEqual(mux.uploadBody.new_asset_settings.playback_policies, ['signed'])
    assert.equal(mux.uploadBody.new_asset_settings.inputs[0].generated_subtitles[0].language_code, 'es')
    assert.equal(created.body.data.bio.status, 'WAITING_UPLOAD')
  })

  it('rejects unsigned webhooks and follows processing to a ready transcript', async () => {
    const bad = await request(app).post('/api/webhooks/mux').set('Mux-Signature', 't=1,v1=00').send({ type: 'video.asset.ready', data: { upload_id: 'up_test_1' } })
    assert.equal(bad.status, 401)

    assert.equal((await webhook({ type: 'video.upload.asset_created', data: { id: 'up_test_1', asset_id: 'as_test_1' } })).status, 200)
    let row = (await query('SELECT * FROM video_bios WHERE user_id = $1', [employee.user.id])).rows[0]
    assert.equal(row.status, 'PROCESSING')
    assert.equal(row.asset_id, 'as_test_1')

    mux.asset = 'ready'
    assert.equal((await webhook({ type: 'video.asset.ready', data: { id: 'as_test_1', upload_id: 'up_test_1' } })).status, 200)
    row = (await query('SELECT * FROM video_bios WHERE user_id = $1', [employee.user.id])).rows[0]
    assert.equal(row.status, 'READY')
    assert.equal(row.playback_id, 'pb_test_123')
    assert.equal(row.transcript_status, 'READY')
    assert.equal(row.transcript, `Hola, soy Ana. Trabajo en ${word} y fintech.`)
    assert.equal(mux.transcriptAudience, 't')

    const mine = await request(app).get('/api/community/me/video-bio').set(auth(employee))
    assert.equal(mine.body.data.status, 'READY')
    assert.equal(mine.body.data.duration_seconds, 185.4)
  })

  it('finds people by what they say in their video and plays it through a signed link', async () => {
    const found = await request(app).get(`/api/community/directory?q=${word}`).set(auth(manager))
    assert.equal(found.status, 200)
    const person = found.body.data.find((row) => row.id === employee.user.id)
    assert.ok(person, 'the transcript is searchable')
    assert.equal(person.has_video, true)

    const play = await request(app).get(`/api/community/video-bios/${employee.user.id}`).set(auth(manager))
    assert.equal(play.status, 200)
    assert.match(play.body.data.hls, /^https:\/\/stream\.mux\.com\/pb_test_123\.m3u8\?token=/)
    assert.equal(play.body.data.token, undefined)
    const token = new URL(play.body.data.hls).searchParams.get('token')
    const claims = jwt.verify(token, publicKey.export({ type: 'spki', format: 'pem' }))
    assert.equal(claims.aud, 'v')
    assert.equal(claims.sub, 'pb_test_123')
    assert.match(play.body.data.transcript, new RegExp(word))

    assert.equal((await request(app).get('/api/community/video-bios/abc').set(auth(manager))).status, 400)
    assert.equal((await request(app).get(`/api/community/video-bios/${manager.user.id}`).set(auth(manager))).status, 404)
  })

  it('rejects videos longer than five minutes', async () => {
    mux.asset = 'preparing'
    mux.duration = 420
    await request(app).post('/api/community/me/video-bio/upload').set(auth(employee)).send({ language: 'en' })
    mux.asset = 'ready'
    await webhook({ type: 'video.asset.ready', data: { id: 'as_test_1', upload_id: 'up_test_1' } })
    const row = (await query('SELECT * FROM video_bios WHERE user_id = $1', [employee.user.id])).rows[0]
    assert.equal(row.status, 'FAILED')
    assert.match(row.failure, /5 minutes/)
    assert.equal(row.playback_id, null)
    assert.ok(mux.calls.some((call) => call === 'DELETE https://api.mux.com/video/v1/assets/as_test_1'))
  })

  it('deletes the video at the provider and in the database', async () => {
    mux.calls = []
    await query("UPDATE video_bios SET asset_id = 'as_test_1' WHERE user_id = $1", [employee.user.id])
    const removed = await request(app).delete('/api/community/me/video-bio').set(auth(employee))
    assert.equal(removed.status, 200)
    assert.ok(mux.calls.includes('DELETE https://api.mux.com/video/v1/assets/as_test_1'))
    assert.equal((await query('SELECT 1 FROM video_bios WHERE user_id = $1', [employee.user.id])).rowCount, 0)
  })

  it('turns captions into plain text and checks Cloudflare webhook signatures', () => {
    assert.equal(vttToText('WEBVTT\n\nNOTE auto\n\n00:00.000 --> 00:01.000\n<v Ana>Hello</v>\nworld\n'), 'Hello world')
    process.env.CF_STREAM_WEBHOOK_SECRET = 'cf_secret'
    const body = '{"uid":"abc"}'
    const time = Math.floor(Date.now() / 1000)
    const sig = createHmac('sha256', 'cf_secret').update(`${time}.${body}`).digest('hex')
    assert.equal(providers.cloudflare.verify(body, `time=${time},sig1=${sig}`), true)
    assert.equal(providers.cloudflare.verify(body, `time=${time - 3600},sig1=${sig}`), false)
    assert.equal(providers.cloudflare.verify('{"uid":"other"}', `time=${time},sig1=${sig}`), false)
  })
})
