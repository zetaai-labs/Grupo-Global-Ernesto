import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { query } from '../src/config/database.js'
import { findEntity, MODULES } from '../src/zylax/definitions.js'
import {
  CONTACT_FIELDS, ERASE_BY_ASSIGNEE, ERASE_BY_CREATOR, PERSONAL_BY_ASSIGNEE, PERSONAL_BY_CREATOR, RETAINED,
} from '../src/zylax/privacy.js'
import { app, loginAs } from './helpers.js'

const HUB = '/api/zylax/hub'
const PASSWORD = 'Gdpr-Zylax-Pass1!'
const NAME = `Gdpr Person ${randomUUID().slice(0, 8)}`
const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('GDPR coverage of ZYLAX records', () => {
  const s = {}
  let person
  let personId
  const email = `gdpr-zylax-${randomUUID()}@example.test`
  const post = async (who, path, body) => {
    const response = await request(app).post(`${HUB}/${path}`).set(auth(who)).send(body)
    assert.equal(response.status, 201, `${path}: ${response.body.message}`)
    return response.body.data
  }
  const row = async (id) => (await query('SELECT * FROM zx_records WHERE record_id = $1', [id])).rows[0]
  const records = {}

  before(async () => {
    for (const name of ['admin', 'hr', 'employee']) s[name] = await loginAs(`${name}@gmail.com`)
    const roleId = (await query("SELECT id FROM roles WHERE name = 'employee'")).rows[0].id
    const orgId = s.hr.user.org_id || (await query("SELECT org_id FROM organizations WHERE org_type = 'PARENT' LIMIT 1")).rows[0].org_id
    const created = await request(app).post('/api/users').set(auth(s.admin))
      .send({ name: NAME, email, password: PASSWORD, role_id: roleId, org_id: orgId })
    assert.equal(created.status, 201)
    personId = created.body.data.id
    person = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data

    records.profile = await post(s.hr, 'people/profiles', {
      title: NAME, user: personId, job_title: 'Analyst', salary_eur: 41234, national_id: '12345678Z',
    })
    records.performance = await post(s.hr, 'people/performance', {
      title: 'Annual review', employee: personId, period: '2026-10', rating: 3, goals: 'Private performance detail',
    })
    records.leave = await post(person, 'attendance/leave', {
      title: 'Medical treatment', leave_type: 'SICK', start_date: '2031-02-03', end_date: '2031-02-04',
    })
    records.claim = await post(person, 'expenses/claims', {
      title: 'Client lunch', category: 'MEALS', amount_eur: 45, expense_date: '2026-11-02',
    })
    records.travel = await post(person, 'facilities/travel', {
      title: 'Visit', destination: 'Madrid', depart_on: '2031-03-03', return_on: '2031-03-04', estimate_eur: 300, itinerary: 'Private itinerary',
    })
    records.opportunity = await post(s.employee, 'sales/opportunities', {
      title: 'Deal', contact_name: NAME, contact_email: email, value_eur: 1000,
    })
    records.colleague = await post(s.hr, 'people/performance', {
      title: 'Colleague review', employee: s.employee.user.id, period: '2026-10', rating: 2, goals: 'Colleague secret detail',
    })
    const clock = await request(app).post(`${HUB}/attendance/clock`).set(auth(person)).send({ action: 'in' })
    assert.equal(clock.status, 200, clock.body.message)
  })

  after(async () => {
    const ids = Object.values(records).map((record) => record.record_id)
    await query('DELETE FROM zx_records WHERE record_id = ANY($1::uuid[]) OR assigned_to = $2 OR created_by = $2', [ids, personId])
    await query('DELETE FROM users WHERE id = $1', [personId])
  })

  it('classifies only real entities and covers every email field', () => {
    for (const key of [...PERSONAL_BY_ASSIGNEE, ...PERSONAL_BY_CREATOR, ...ERASE_BY_ASSIGNEE, ...ERASE_BY_CREATOR, ...RETAINED, ...Object.keys(CONTACT_FIELDS)]) {
      const [module, entity] = key.split('/')
      assert.ok(findEntity(module, entity), key)
    }
    for (const key of [...PERSONAL_BY_ASSIGNEE, ...PERSONAL_BY_CREATOR]) {
      assert.ok([...ERASE_BY_ASSIGNEE, ...ERASE_BY_CREATOR, ...RETAINED].includes(key), `${key} needs an erasure policy`)
    }
    const emailFields = MODULES.flatMap((m) => m.entities.flatMap((e) => e.fields.filter((f) => f.type === 'email').map((f) => `${m.key}/${e.key}/${f.key}`)))
    assert.deepEqual(emailFields.sort(), Object.entries(CONTACT_FIELDS).map(([key, value]) => `${key}/${value.email}`).sort())
  })

  it('exports the person’s own HR data, including their confidential fields', async () => {
    const response = await request(app).get('/api/auth/me/export').set(auth(person))
    assert.equal(response.status, 200)
    const byEntity = (entity) => response.body.zylax.personal_records.find((record) => record.entity === entity)
    assert.equal(byEntity('profiles').data.salary_eur, 41234)
    assert.equal(byEntity('profiles').data.national_id, '12345678Z')
    assert.equal(byEntity('performance').data.goals, 'Private performance detail')
    assert.ok(byEntity('leave') && byEntity('claims') && byEntity('travel') && byEntity('attendance'))
    assert.equal(response.body.zylax.contact_entries.sales_opportunities.length, 1)
    assert.equal('sealed_data' in byEntity('profiles'), false)
  })

  it('never exposes colleagues’ records in an HR officer’s export', async () => {
    const response = await request(app).get('/api/auth/me/export').set(auth(s.hr))
    assert.equal(response.status, 200)
    const text = JSON.stringify(response.body.zylax)
    for (const secret of ['Colleague secret detail', 'Private performance detail', '41234', '12345678Z']) {
      assert.equal(text.includes(secret), false, secret)
    }
  })

  it('erases personal records and anonymises those kept by law', async () => {
    const erased = await request(app).post(`/api/users/${personId}/erase`).set(auth(s.admin))
    assert.equal(erased.status, 200, erased.body.message)

    assert.equal(await row(records.profile.record_id), undefined)
    assert.equal(await row(records.performance.record_id), undefined)

    const leave = await row(records.leave.record_id)
    assert.equal(leave.title, 'Leave record')
    assert.equal(leave.data.start_date, '2031-02-03')
    assert.ok(await row(records.claim.record_id))
    assert.equal((await row(records.travel.record_id)).data.itinerary, null)

    const opportunity = await row(records.opportunity.record_id)
    assert.equal(opportunity.data.contact_email, null)
    assert.equal(opportunity.data.contact_name, null)
    assert.ok(await row(records.colleague.record_id), 'colleague records are untouched')

    const named = await query('SELECT COUNT(*)::int AS n FROM zx_records WHERE title LIKE $1', [`%${NAME}%`])
    assert.equal(named.rows[0].n, 0)
  })
})
