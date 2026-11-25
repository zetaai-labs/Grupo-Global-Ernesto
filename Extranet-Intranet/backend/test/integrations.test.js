import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { integrationReport } from '../src/services/integrationStatus.service.js'

const auth = (s) => ({ Authorization: `Bearer ${s.token}` })
const NAMES = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'AUDIT_S3_BUCKET', 'AUDIT_S3_REGION', 'S3_REGION', 'AWS_REGION', 'AUDIT_RETENTION_DAYS']
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]))
const find = (report, key) => report.items.find((item) => item.key === key)

afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

describe('integration status', () => {
  it('is limited to system administrators', async () => {
    for (const user of ['admin', 'techadmin']) {
      const session = await loginAs(`${user}@gmail.com`)
      assert.equal((await request(app).get('/api/integrations').set(auth(session))).status, 200)
    }
    for (const user of ['hr', 'finance', 'manager', 'employee', 'customer', 'partner', 'supplier', 'investor']) {
      const session = await loginAs(`${user}@gmail.com`)
      assert.equal((await request(app).get('/api/integrations').set(auth(session))).status, 403, user)
    }
    assert.equal((await request(app).get('/api/integrations')).status, 401)
  })

  it('reports presence without ever returning a value', async () => {
    const secret = 'zx-test-secret-value-9931'
    Object.assign(process.env, { SMTP_HOST: 'mail.example.test', SMTP_USER: 'mailer', SMTP_PASS: secret, MAIL_FROM: 'no-reply@example.test' })
    const admin = await loginAs('admin@gmail.com')
    const response = await request(app).get('/api/integrations').set(auth(admin))
    assert.equal(response.text.includes(secret), false)
    assert.equal(response.text.includes('mail.example.test'), false)
    assert.equal(response.body.data.items.find((item) => item.key === 'smtp').status, 'CONFIGURED')
    assert.equal(response.headers['cache-control'], 'no-store')
  })

  it('needs a bucket, a region and positive retention for audit storage', async () => {
    for (const name of ['AUDIT_S3_REGION', 'S3_REGION', 'AWS_REGION']) delete process.env[name]
    Object.assign(process.env, { AUDIT_S3_BUCKET: 'audit-test', AUDIT_RETENTION_DAYS: '365' })
    assert.equal(find(await integrationReport(), 'audit_lock').status, 'PARTIAL')
    process.env.AWS_REGION = 'eu-south-2'
    assert.equal(find(await integrationReport(), 'audit_lock').status, 'CONFIGURED')
    process.env.AUDIT_RETENTION_DAYS = '0'
    assert.equal(find(await integrationReport(), 'audit_lock').status, 'PARTIAL')
  })

  it('separates partial, missing and unbuilt integrations', async () => {
    for (const name of NAMES) delete process.env[name]
    assert.equal(find(await integrationReport(), 'smtp').status, 'NOT_SET')
    process.env.SMTP_HOST = 'mail.example.test'
    const partial = find(await integrationReport(), 'smtp')
    assert.equal(partial.status, 'PARTIAL')
    assert.deepEqual(partial.settings.filter((item) => !item.present).map((item) => item.name), ['SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'])
    // The AI engine is built now: the AI assistant is a normal integration, switched on by its key.
    const ai = find(await integrationReport(), 'ai')
    assert.equal(ai.built, true)
  })
})
