import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const PDF = Buffer.from('%PDF-1.4\n% employee document\n')
const stamp = Date.now()

describe('Employee profile documents are private to HR and the employee', () => {
  let hr
  let employee
  let colleague
  let recordId
  const base = () => `/api/zylax/hub/people/profiles/${recordId}`

  before(async () => {
    hr = await loginAs('hr@gmail.com')
    employee = await loginAs('employee@gmail.com')
    colleague = await loginAs('finance@gmail.com')
    recordId = (await query(
      `SELECT record_id FROM zx_records WHERE module = 'people' AND entity = 'profiles' AND assigned_to = $1 LIMIT 1`, [employee.user.id],
    )).rows[0]?.record_id
    assert.ok(recordId, 'the demo employee has a profile')
  })
  after(async () => {
    await query(`DELETE FROM zx_record_files WHERE record_id = $1 AND name LIKE $2`, [recordId, `%${stamp}%`])
    await query(`DELETE FROM zx_record_events WHERE record_id = $1 AND body LIKE $2`, [recordId, `%${stamp}%`])
  })

  it('shows a document HR adds to the employee, and tells them', async () => {
    const added = await request(app).post(`${base()}/files`).set(auth(hr)).field('internal', 'false').attach('file', PDF, { filename: `contract-${stamp}.pdf`, contentType: 'application/pdf' })
    assert.equal(added.status, 201)
    const mine = await request(app).get(base()).set(auth(employee))
    const file = mine.body.data.files.find((item) => item.name === `contract-${stamp}.pdf`)
    assert.ok(file, 'the employee sees it on their own profile')
    assert.equal((await request(app).get(`${base()}/files/${file.file_id}`).set(auth(employee))).status, 200)
    const alerts = await query(`SELECT 1 FROM notifications WHERE user_id = $1 AND title = 'A document was added to your profile' AND body = $2`, [employee.user.id, `contract-${stamp}.pdf`])
    assert.equal(alerts.rowCount, 1)
  })

  it('keeps "HR only" documents and notes from the employee', async () => {
    await request(app).post(`${base()}/files`).set(auth(hr)).field('internal', 'true').attach('file', PDF, { filename: `hr-note-${stamp}.pdf`, contentType: 'application/pdf' })
    await request(app).post(`${base()}/comments`).set(auth(hr)).send({ body: `Salary review ${stamp}`, internal: true })
    const hrView = await request(app).get(base()).set(auth(hr))
    const hidden = hrView.body.data.files.find((item) => item.name === `hr-note-${stamp}.pdf`)
    assert.ok(hidden && hrView.body.data.events.some((event) => event.body === `Salary review ${stamp}`), 'HR sees everything')
    const mine = await request(app).get(base()).set(auth(employee))
    assert.ok(!mine.body.data.files.some((item) => item.name === `hr-note-${stamp}.pdf`))
    assert.ok(!mine.body.data.events.some((event) => event.body === `Salary review ${stamp}`))
    assert.equal((await request(app).get(`${base()}/files/${hidden.file_id}`).set(auth(employee))).status, 404)

    const note = await request(app).post(`${base()}/comments`).set(auth(employee)).send({ body: `My question ${stamp}`, internal: true })
    assert.equal(note.status, 201, 'the employee can write on their own profile')
    const stored = await query('SELECT internal FROM zx_record_events WHERE record_id = $1 AND body = $2', [recordId, `My question ${stamp}`])
    assert.equal(stored.rows[0].internal, false, 'and cannot hide their note from HR')
  })

  it('shows colleagues the card only, never the documents', async () => {
    const view = await request(app).get(base()).set(auth(colleague))
    assert.equal(view.status, 200, 'the basic card stays visible for the organisation chart')
    assert.deepEqual(view.body.data.files, [])
    assert.ok(!view.body.data.events.some((event) => ['comment', 'file'].includes(event.kind)))
    assert.equal(view.body.data.can_add, false)
    const file = (await request(app).get(base()).set(auth(hr))).body.data.files.find((item) => item.name === `contract-${stamp}.pdf`)
    assert.equal((await request(app).get(`${base()}/files/${file.file_id}`).set(auth(colleague))).status, 404)
    assert.equal((await request(app).post(`${base()}/comments`).set(auth(colleague)).send({ body: `Nosy ${stamp}` })).status, 403)
    const upload = await request(app).post(`${base()}/files`).set(auth(colleague)).attach('file', PDF, { filename: `x-${stamp}.pdf`, contentType: 'application/pdf' })
    assert.equal(upload.status, 403)
  })
})
