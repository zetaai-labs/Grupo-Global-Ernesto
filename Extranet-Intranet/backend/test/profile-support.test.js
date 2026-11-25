import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
// A real 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
const binary = (res, callback) => { const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('end', () => callback(null, Buffer.concat(chunks))) }

describe('Profile photo and support', () => {
  let employee
  let customer
  let supplier
  const tickets = []
  before(async () => {
    employee = await loginAs('employee@gmail.com')
    customer = await loginAs('customer@gmail.com')
    supplier = await loginAs('supplier@gmail.com')
  })
  after(async () => {
    for (const session of [employee, customer]) await request(app).delete('/api/auth/me/avatar').set(auth(session))
    await query('DELETE FROM zx_record_events WHERE record_id = ANY($1::uuid[])', [tickets])
    await query('DELETE FROM zx_records WHERE record_id = ANY($1::uuid[])', [tickets])
  })

  it('accepts a real image only, up to 2 MB', async () => {
    const fake = await request(app).put('/api/auth/me/avatar').set(auth(employee)).attach('photo', Buffer.from('<svg onload=alert(1)>'), { filename: 'me.png', contentType: 'image/png' })
    assert.equal(fake.status, 400, 'content is checked, not the name')
    const svg = await request(app).put('/api/auth/me/avatar').set(auth(employee)).attach('photo', Buffer.from('<svg/>'), { filename: 'me.svg', contentType: 'image/svg+xml' })
    assert.equal(svg.status, 400)
    const big = await request(app).put('/api/auth/me/avatar').set(auth(employee)).attach('photo', Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), { filename: 'big.png', contentType: 'image/png' })
    assert.equal(big.status, 400)

    const saved = await request(app).put('/api/auth/me/avatar').set(auth(employee)).attach('photo', PNG, { filename: 'me.png', contentType: 'image/png' })
    assert.equal(saved.status, 200)
    assert.ok(saved.body.data.avatar_version > 0)
    const me = await request(app).get('/api/auth/me').set(auth(employee))
    assert.equal(me.body.data.avatar_version, saved.body.data.avatar_version)
  })

  it('shows photos inline, and external users only see staff and themselves', async () => {
    const photo = await request(app).get(`/api/people/${employee.user.id}/avatar`).set(auth(customer)).buffer(true).parse(binary)
    assert.equal(photo.status, 200)
    assert.equal(photo.headers['content-type'], 'image/png')
    assert.equal(photo.headers['content-disposition'], 'inline')
    assert.ok(photo.body.equals(PNG), 'decrypted back to the original')

    await request(app).put('/api/auth/me/avatar').set(auth(customer)).attach('photo', PNG, { filename: 'c.png', contentType: 'image/png' })
    assert.equal((await request(app).get(`/api/people/${customer.user.id}/avatar`).set(auth(customer))).status, 200, 'own photo')
    assert.equal((await request(app).get(`/api/people/${customer.user.id}/avatar`).set(auth(supplier))).status, 404, 'another company’s person')
    assert.equal((await request(app).get(`/api/people/${customer.user.id}/avatar`).set(auth(employee))).status, 200, 'staff see everyone')
    assert.equal((await request(app).get(`/api/people/${employee.user.id}/avatar`)).status, 401)

    assert.equal((await request(app).delete('/api/auth/me/avatar').set(auth(customer))).status, 200)
    assert.equal((await request(app).get(`/api/people/${customer.user.id}/avatar`).set(auth(customer))).status, 404)
  })

  it('tells people how to reach support', async () => {
    const info = await request(app).get('/api/support').set(auth(customer))
    assert.equal(info.status, 200)
    assert.match(info.body.data.email, /@/)
  })

  it('turns "Report a problem" into a HelpDesk or Client Support ticket', async () => {
    assert.equal((await request(app).post('/api/support/requests').set(auth(employee)).send({ subject: 'x', message: 'short' })).status, 400)
    const staff = await request(app).post('/api/support/requests').set(auth(employee))
      .send({ category: 'bug', subject: 'Calendar does not load', message: 'The calendar page stays empty since this morning.', page: '/intranet/calendar' })
    assert.equal(staff.status, 201)
    assert.match(staff.body.data.ref, /^ZX-HEL-/)
    const row = (await query('SELECT record_id, module, status, data, created_by FROM zx_records WHERE ref_no = $1', [staff.body.data.ref])).rows[0]
    tickets.push(row.record_id)
    assert.equal(row.module, 'helpdesk')
    assert.equal(row.status, 'OPEN')
    assert.equal(row.data.category, 'SOFTWARE')
    assert.ok(row.data.sla_due, 'SLA set like any ticket')
    assert.match(row.data.description, /Page: \/intranet\/calendar/)
    assert.equal(row.created_by, employee.user.id)

    const client = await request(app).post('/api/support/requests').set(auth(customer))
      .send({ category: 'billing', subject: 'Invoice question', message: 'The last invoice shows the wrong VAT number.' })
    assert.equal(client.status, 201)
    const clientRow = (await query('SELECT record_id, module, customer_org_id, data FROM zx_records WHERE ref_no = $1', [client.body.data.ref])).rows[0]
    tickets.push(clientRow.record_id)
    assert.equal(clientRow.module, 'client_support')
    assert.equal(clientRow.customer_org_id, customer.user.org_id)
    assert.equal(clientRow.data.category, 'BILLING')
  })
})
