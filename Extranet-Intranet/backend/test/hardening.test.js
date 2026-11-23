import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { app } from './helpers.js'
import { createApp } from '../src/app.js'
import { backupMethod, connectionEnv } from '../src/services/backup.service.js'

const saved = { hops: process.env.TRUST_PROXY_HOPS, method: process.env.BACKUP_METHOD }
afterEach(() => {
  for (const [name, value] of [['TRUST_PROXY_HOPS', saved.hops], ['BACKUP_METHOD', saved.method]]) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('production hardening', () => {
  it('sends security headers and hides the framework', async () => {
    const response = await request(app).get('/api/health')
    assert.equal(response.headers['x-powered-by'], undefined)
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
    assert.match(response.headers['content-security-policy'], /default-src 'none'/)
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/)
  })

  it('believes forwarded client IPs only when told how many proxies exist', () => {
    delete process.env.TRUST_PROXY_HOPS
    assert.equal(createApp().get('trust proxy'), false)
    process.env.TRUST_PROXY_HOPS = '1'
    assert.equal(createApp().get('trust proxy'), 1)
    for (const bad of ['true', '-1', '1.5', '99']) {
      process.env.TRUST_PROXY_HOPS = bad
      assert.equal(createApp().get('trust proxy'), false, bad)
    }
  })

  it('takes the right-most client address, so a forged header cannot dodge rate limits', async () => {
    const probe = express()
    probe.set('trust proxy', 1)
    probe.get('/', (req, res) => res.json({ ip: req.ip }))
    const response = await request(probe).get('/').set('X-Forwarded-For', '1.2.3.4, 203.0.113.9')
    assert.equal(response.body.ip, '203.0.113.9')
  })

  it('selects the backup method and keeps the password out of command arguments', () => {
    delete process.env.BACKUP_METHOD
    assert.equal(backupMethod(), 'docker')
    process.env.BACKUP_METHOD = 'direct'
    assert.equal(backupMethod(), 'direct')
    assert.deepEqual(connectionEnv('postgres://user:p%40ss@db.internal:5433/app_db'), {
      PGHOST: 'db.internal', PGPORT: '5433', PGUSER: 'user', PGPASSWORD: 'p@ss', PGDATABASE: 'app_db',
    })
  })
})
