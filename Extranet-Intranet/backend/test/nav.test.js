import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { integrationReport } from '../src/services/integrationStatus.service.js'

const SITE = 'https://www.example-site.test'
const saved = process.env.NAV_ALLOWED_ORIGINS
afterEach(() => { if (saved === undefined) delete process.env.NAV_ALLOWED_ORIGINS; else process.env.NAV_ALLOWED_ORIGINS = saved })
const navCookie = (response) => (response.headers['set-cookie'] || []).find((value) => value.startsWith('gg_nav='))

describe('WordPress session-aware navigation', () => {
  it('stays off until the site address is configured', async () => {
    delete process.env.NAV_ALLOWED_ORIGINS
    assert.equal((await request(app).get('/api/public/nav.js')).status, 404)
    assert.equal((await request(app).get('/api/public/nav/session').set('Origin', SITE)).status, 404)
    const employee = await loginAs('employee@gmail.com')
    assert.equal((await request(app).post('/api/auth/nav-session').set('Authorization', `Bearer ${employee.token}`)).status, 204)
    assert.equal((await integrationReport()).items.find((item) => item.key === 'wordpress_nav').status, 'NOT_SET')
  })

  it('shows the signed-in user to the allowed site only, without exposing a token', async () => {
    process.env.NAV_ALLOWED_ORIGINS = `${SITE}/`
    const employee = await loginAs('employee@gmail.com')
    const started = await request(app).post('/api/auth/nav-session').set('Authorization', `Bearer ${employee.token}`)
    const cookie = navCookie(started)
    assert.ok(cookie)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Lax/)
    const pair = cookie.split(';')[0]

    const answer = await request(app).get('/api/public/nav/session').set('Origin', SITE).set('Cookie', pair)
    assert.equal(answer.status, 200)
    assert.equal(answer.headers['access-control-allow-origin'], SITE)
    assert.equal(answer.headers['access-control-allow-credentials'], 'true')
    assert.equal(answer.body.signed_in, true)
    assert.equal(answer.body.name, employee.user.name)
    assert.equal(typeof answer.body.unread_notifications, 'number')
    assert.equal(JSON.stringify(answer.body).includes(pair.split('=')[1]), false, 'no token in the answer')
    assert.equal(answer.body.email, undefined)

    assert.equal((await request(app).get('/api/public/nav/session').set('Origin', 'https://evil.test').set('Cookie', pair)).status, 403)
    assert.equal((await request(app).get('/api/public/nav/session').set('Origin', SITE)).body.signed_in, false)
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${pair.split('=')[1]}`)).status, 401, 'the cookie is not a session token')

    const cleared = await request(app).delete('/api/auth/nav-session')
    assert.match(cleared.headers['set-cookie'].join(), /gg_nav=;/)
  })

  it('serves a script that builds the bar without HTML strings', async () => {
    process.env.NAV_ALLOWED_ORIGINS = SITE
    const script = await request(app).get('/api/public/nav.js')
    assert.equal(script.status, 200)
    assert.match(script.headers['content-type'], /javascript/)
    assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(script.text), false)
    assert.equal((await integrationReport()).items.find((item) => item.key === 'wordpress_nav').status, 'CONFIGURED')
  })
})
