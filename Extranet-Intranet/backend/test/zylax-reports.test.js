import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import ExcelJS from 'exceljs'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const binary = (req) => req.buffer(true).parse((res, done) => {
  const chunks = []
  res.on('data', (chunk) => chunks.push(chunk))
  res.on('end', () => done(null, Buffer.concat(chunks)))
})
const created = []

describe('ZYLAX exports and reports', () => {
  after(async () => {
    if (created.length) await query('DELETE FROM zx_records WHERE record_id = ANY($1::uuid[])', [created])
  })

  it('exports only what the user can see, without formula injection', async () => {
    const [employee, manager, tech] = await Promise.all(['employee', 'manager', 'admin'].map((n) => loginAs(`${n}@gmail.com`)))
    const stamp = Date.now()
    const mine = await request(app).post('/api/zylax/hub/helpdesk/tickets').set(auth(employee))
      .send({ title: `=HYPERLINK("http://x") ${stamp}`, category: 'ACCESS', priority: 'P4', description: 'Export test' })
    assert.equal(mine.status, 201, JSON.stringify(mine.body))
    created.push(mine.body.data.record_id)
    const other = await request(app).post('/api/zylax/hub/helpdesk/tickets').set(auth(manager))
      .send({ title: `Manager ticket ${stamp}`, category: 'OTHER', priority: 'P4', description: 'Not for the employee' })
    created.push(other.body.data.record_id)

    const csv = await request(app).get('/api/zylax/hub/helpdesk/tickets/export?format=csv').set(auth(employee))
    assert.equal(csv.status, 200)
    assert.match(csv.headers['content-type'], /text\/csv/)
    assert.ok(csv.text.includes(`'=HYPERLINK`), 'formula is neutralised')
    assert.ok(!csv.text.includes(`Manager ticket ${stamp}`), 'employee sees only own tickets')

    const xlsx = await binary(request(app).get('/api/zylax/hub/helpdesk/tickets/export').set(auth(tech)))
    assert.equal(xlsx.status, 200)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(xlsx.body)
    const titles = book.worksheets[0].getColumn(2).values.map(String)
    assert.ok(titles.some((v) => v.includes(`Manager ticket ${stamp}`)), 'the Super Administrator sees every business unit')

    const audit = await query("SELECT 1 FROM audit_logs WHERE action = 'ZX_EXPORT' AND details->>'entity' = 'tickets' LIMIT 1")
    assert.equal(audit.rowCount, 1)
  })

  it('hides confidential columns from people who cannot read them', async () => {
    const [employee, hr] = await Promise.all(['employee', 'hr'].map((n) => loginAs(`${n}@gmail.com`)))
    const staff = await request(app).get('/api/zylax/hub/people/profiles/export?format=csv').set(auth(employee))
    if (staff.status === 200) assert.ok(!staff.text.includes('Annual salary'), 'no salary column for employees')
    else assert.equal(staff.status, 403)
    const hrExport = await request(app).get('/api/zylax/hub/people/profiles/export?format=csv').set(auth(hr))
    assert.equal(hrExport.status, 200)
    assert.ok(hrExport.text.split('\r\n')[0].includes('Annual salary'))
  })

  it('reports counts by status and the last 12 months', async () => {
    const tech = await loginAs('admin@gmail.com')
    const report = await request(app).get('/api/zylax/hub/helpdesk/tickets/report').set(auth(tech))
    assert.equal(report.status, 200)
    assert.equal(report.body.data.by_month.length, 12)
    assert.ok(report.body.data.total >= 2)
    assert.equal(report.body.data.by_status.reduce((sum, row) => sum + row.count, 0), report.body.data.total)
    const customer = await loginAs('customer@gmail.com')
    assert.equal((await request(app).get('/api/zylax/hub/helpdesk/tickets/report').set(auth(customer))).status, 403)
  })
})
