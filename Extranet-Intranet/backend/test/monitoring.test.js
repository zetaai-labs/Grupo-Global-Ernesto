import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { errorHandler, jobFailed, jobStatus, registerJob, requestMonitor, resetMonitor, runJob, setAlertSender, systemHealth } from '../src/monitoring/monitor.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const realFetch = globalThis.fetch

describe('Monitoring: request IDs, errors, health and job alerts', () => {
  let admin
  let employee
  before(async () => {
    admin = await loginAs('admin@gmail.com')
    employee = await loginAs('employee@gmail.com')
    resetMonitor()
  })
  after(() => {
    globalThis.fetch = realFetch
    delete process.env.SENTRY_DSN
    setAlertSender(null)
    resetMonitor()
  })

  it('gives every response a request ID and keeps a valid incoming one', async () => {
    const plain = await request(app).get('/api/health')
    assert.match(plain.headers['x-request-id'], /^[a-f0-9]{16}$/)
    const traced = await request(app).get('/api/health').set('X-Request-Id', 'lb-trace-12345678')
    assert.equal(traced.headers['x-request-id'], 'lb-trace-12345678')
    const bad = await request(app).get('/api/health').set('X-Request-Id', 'x"><script>')
    assert.match(bad.headers['x-request-id'], /^[a-f0-9]{16}$/)
    assert.equal(plain.headers['x-powered-by'], undefined)
  })

  it('answers server errors with a reference and reports them to Sentry without personal data', async () => {
    const sent = []
    globalThis.fetch = async (url, options) => { sent.push({ url, options }); return new Response('{}') }
    process.env.SENTRY_DSN = 'https://publickey123@o1.ingest.sentry.io/4507'
    const mini = express()
    mini.use(requestMonitor)
    mini.get('/boom', () => { throw new Error('Database exploded') })
    mini.get('/missing', () => { throw Object.assign(new Error('Not here.'), { status: 404 }) })
    mini.use(errorHandler)

    const boom = await request(mini).get('/boom?token=secret-value')
    assert.equal(boom.status, 500)
    assert.equal(boom.body.message, 'Server error')
    assert.equal(boom.body.request_id, boom.headers['x-request-id'])
    assert.equal((await request(mini).get('/missing')).body.message, 'Not here.')
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(sent.length, 1, 'only the 500 is reported')
    assert.equal(sent[0].url, 'https://o1.ingest.sentry.io/api/4507/envelope/')
    assert.match(sent[0].options.headers['X-Sentry-Auth'], /sentry_key=publickey123/)
    const event = JSON.parse(sent[0].options.body.split('\n')[2])
    assert.equal(event.exception.values[0].value, 'Database exploded')
    assert.equal(event.tags.request_id, boom.body.request_id)
    assert.equal(event.extra.path, '/boom')
    assert.ok(!sent[0].options.body.includes('secret-value'), 'query strings are never sent')
    globalThis.fetch = realFetch
    delete process.env.SENTRY_DSN
  })

  it('reports readiness from the database', async () => {
    const ready = await request(app).get('/api/health/ready')
    assert.equal(ready.status, 200)
    assert.equal(ready.body.database.ok, true)
  })

  it('alerts administrators once when a scheduled job fails, and shows it on the health screen', async () => {
    const alerts = []
    setAlertSender(async (alert) => { alerts.push(alert) })
    registerJob('Backups', 24)
    await runJob('Backups', async () => {}, 24)
    await runJob('Backups', async () => { throw new Error('Disk full') }, 24)
    await jobFailed('Backups', new Error('Disk still full'))
    assert.equal(alerts.length, 1, 'at most one alert per job every 6 hours')
    assert.deepEqual(alerts[0], { job: 'Backups', error: 'Disk full' })
    const job = jobStatus().find((item) => item.name === 'Backups')
    assert.equal(job.runs, 2)
    assert.equal(job.failures, 2)
    assert.ok(job.last_ok)
    assert.equal(job.last_error, 'Disk still full')

    const health = await systemHealth()
    assert.equal(health.database.ok, true)
    assert.ok(health.problems.includes('jobs'))
    assert.equal(health.status, 'degraded')
    assert.ok(health.recent_errors.some((item) => item.job === 'Backups'))
  })

  it('shows system health to system administrators only', async () => {
    assert.equal((await request(app).get('/api/monitoring').set(auth(employee))).status, 403)
    assert.equal((await request(app).get('/api/monitoring')).status, 401)
    const health = await request(app).get('/api/monitoring').set(auth(admin))
    assert.equal(health.status, 200)
    for (const key of ['status', 'database', 'disk', 'backups', 'requests', 'jobs', 'recent_errors', 'uptime_seconds']) assert.ok(key in health.body.data, key)
    assert.ok(health.body.data.requests.requests > 0)
  })
})
