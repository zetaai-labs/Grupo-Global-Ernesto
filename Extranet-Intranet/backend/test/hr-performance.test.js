import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { query } from '../src/config/database.js'
import { app, loginAs } from './helpers.js'

const PATH = '/api/zylax/hub/people/performance'
const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('HR performance logs', () => {
  const s = {}
  const created = []
  const log = (employee, extra = {}) => ({
    title: 'Q4 review', employee, period: '2026-11', rating: 4, goals: 'Delivered the planned goals.', ...extra,
  })

  before(async () => {
    for (const name of ['admin', 'hr', 'manager', 'employee', 'finance', 'customer']) s[name] = await loginAs(`${name}@gmail.com`)
  })

  after(async () => {
    await query('DELETE FROM zx_records WHERE record_id = ANY($1::uuid[])', [created])
  })

  it('lets HR log a review that only HR, admin and that employee can see', async () => {
    const response = await request(app).post(PATH).set(auth(s.hr)).send(log(s.employee.user.id))
    assert.equal(response.status, 201, response.body.message)
    const id = response.body.data.record_id
    created.push(id)

    for (const who of ['hr', 'admin', 'employee']) {
      const view = await request(app).get(`${PATH}/${id}`).set(auth(s[who]))
      assert.equal(view.status, 200, who)
      assert.equal(view.body.data.data.rating, 4)
    }
    for (const who of ['manager', 'finance']) {
      assert.equal((await request(app).get(`${PATH}/${id}`).set(auth(s[who]))).status, 404, who)
      const list = await request(app).get(PATH).set(auth(s[who]))
      assert.equal(list.body.data.some((row) => row.record_id === id), false, who)
    }
    assert.equal((await request(app).get(`${PATH}/${id}`).set(auth(s.customer))).status, 403)
  })

  it('only lets HR and the Super Admin write logs', async () => {
    for (const who of ['employee', 'manager', 'finance', 'customer']) {
      const response = await request(app).post(PATH).set(auth(s[who])).send(log(s.employee.user.id))
      assert.equal(response.status, 403, who)
    }
  })

  it('keeps logs append-only', async () => {
    const response = await request(app).post(PATH).set(auth(s.hr)).send(log(s.employee.user.id, { title: 'Locked' }))
    assert.equal(response.status, 201)
    created.push(response.body.data.record_id)
    for (const who of ['hr', 'employee']) {
      const edit = await request(app).patch(`${PATH}/${response.body.data.record_id}`).set(auth(s[who])).send({ rating: 5 })
      assert.notEqual(edit.status, 200, who)
    }
  })

  it('rejects self-review and invalid ratings', async () => {
    assert.equal((await request(app).post(PATH).set(auth(s.hr)).send(log(s.hr.user.id))).status, 403)
    assert.equal((await request(app).post(PATH).set(auth(s.hr)).send(log(s.employee.user.id, { rating: 6 }))).status, 400)
  })
})
