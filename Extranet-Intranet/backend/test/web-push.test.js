import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import webpush from 'web-push'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { notify } from '../src/services/notification.service.js'
import { setPushSender, validEndpoint } from '../src/services/push.service.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_HIDE_DETAILS']
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))
const p256dh = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
const authKey = 'tBHItJI5svbpez7KI4CCXg'
const device = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/test-${n}-${Date.now()}`, keys: { p256dh, auth: authKey } })
const sent = []
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

describe('Web Push: phone and desktop alerts', () => {
  let employee

  before(async () => {
    employee = await loginAs('employee@gmail.com')
    for (const key of KEYS) delete process.env[key]
    await query('DELETE FROM push_subscriptions WHERE user_id = $1', [employee.user.id])
  })

  after(async () => {
    setPushSender(null)
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await query('DELETE FROM push_subscriptions WHERE user_id = $1', [employee.user.id])
  })

  it('is off without VAPID keys', async () => {
    const config = await request(app).get('/api/push').set(auth(employee))
    assert.equal(config.status, 200)
    assert.equal(config.body.data.enabled, false)
    assert.equal(config.body.data.public_key, null)
    assert.equal((await request(app).post('/api/push/subscriptions').set(auth(employee)).send({ subscription: device(0) })).status, 503)
    assert.equal((await request(app).get('/api/push')).status, 401)
  })

  it('accepts only real browser push services', async () => {
    const keys = webpush.generateVAPIDKeys()
    Object.assign(process.env, { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'mailto:it@example.test' })
    assert.equal(validEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true)
    assert.equal(validEndpoint('https://web.push.apple.com/abc'), true)
    assert.equal(validEndpoint('https://wns2-db5p.notify.windows.com/w/?token=x'), true)
    assert.equal(validEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false)
    assert.equal(validEndpoint('https://169.254.169.254/latest'), false)
    assert.equal(validEndpoint('https://fcm.googleapis.com.evil.test/x'), false)
    assert.equal(validEndpoint('https://fcm.googleapis.com:8443/x'), false)
    const evil = await request(app).post('/api/push/subscriptions').set(auth(employee))
      .send({ subscription: { endpoint: 'https://localhost/x', keys: { p256dh, auth: authKey } } })
    assert.equal(evil.status, 400)
  })

  it('pushes every in-app notification to each subscribed device', async () => {
    setPushSender(async (subscription, payload, options) => { sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options }) })
    const phone = device(1)
    const laptop = device(2)
    assert.equal((await request(app).post('/api/push/subscriptions').set(auth(employee)).send({ subscription: phone })).status, 201)
    assert.equal((await request(app).post('/api/push/subscriptions').set(auth(employee)).send({ subscription: laptop })).status, 201)
    // Re-subscribing the same device does not duplicate it.
    assert.equal((await request(app).post('/api/push/subscriptions').set(auth(employee)).send({ subscription: phone })).status, 201)
    assert.equal((await request(app).get('/api/push').set(auth(employee))).body.data.devices, 2)

    await notify([employee.user.id], { type: 'leave', title: 'Leave approved', body: '3 days in December', link: '/intranet/zylax' })
    await settle()
    assert.equal(sent.length, 2)
    assert.deepEqual(sent.map((item) => item.endpoint).sort(), [phone.endpoint, laptop.endpoint].sort())
    assert.equal(sent[0].payload.title, 'Leave approved')
    assert.equal(sent[0].payload.body, '3 days in December')
    assert.equal(sent[0].payload.link, '/intranet/zylax')
    assert.equal(sent[0].options.vapidDetails.subject, 'mailto:it@example.test')
  })

  it('can hide the text on lock screens', async () => {
    sent.length = 0
    process.env.PUSH_HIDE_DETAILS = 'true'
    await notify([employee.user.id], { type: 'chat', title: 'Ana in Deals', body: 'Confidential terms…', link: 'https://evil.test' })
    await settle()
    assert.equal(sent[0].payload.body, null)
    assert.equal(sent[0].payload.link, null, 'only in-app links are pushed')
    delete process.env.PUSH_HIDE_DETAILS
  })

  it('forgets devices the browser has dropped', async () => {
    sent.length = 0
    const { rows } = await query('SELECT endpoint FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at LIMIT 1', [employee.user.id])
    const gone = rows[0].endpoint
    setPushSender(async (subscription) => {
      if (subscription.endpoint === gone) throw Object.assign(new Error('Gone'), { statusCode: 410 })
      sent.push(subscription.endpoint)
    })
    await notify([employee.user.id], { type: 'test', title: 'Hello' })
    await settle()
    assert.equal(sent.length, 1)
    assert.equal((await query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [gone])).rowCount, 0)
  })

  it('sends a test alert and turns alerts off', async () => {
    sent.length = 0
    assert.equal((await request(app).post('/api/push/test').set(auth(employee))).status, 200)
    await settle()
    assert.equal(sent.length, 1)
    assert.equal((await request(app).delete('/api/push/subscriptions').set(auth(employee)).send({})).status, 200)
    assert.equal((await request(app).get('/api/push').set(auth(employee))).body.data.devices, 0)
  })
})
