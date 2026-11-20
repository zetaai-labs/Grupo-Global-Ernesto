import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { sendWorkflowReminders } from '../src/controllers/workflows.controller.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('AutoFlow approval chains', () => {
  it('moves a purchase request Manager → Admin in order', async () => {
    const employee = await loginAs('employee@gmail.com')
    const manager = await loginAs('manager@gmail.com')
    const admin = await loginAs('admin@gmail.com')

    const title = `Chain test ${Date.now()}`
    const created = await request(app)
      .post('/api/workflows')
      .set(auth(employee))
        .send({ title, template: 'purchase', due_at: new Date(Date.now() + 3600e3).toISOString() })
    assert.equal(created.status, 201)
    const id = created.body.data.id

    try {
      const adminFirst = await request(app).patch(`/api/workflows/${id}`).set(auth(manager)).send({ status: 'approved', note: 'Budget OK' })
      assert.equal(adminFirst.status, 200)

      const afterStep1 = (await request(app).get('/api/workflows').set(auth(manager))).body.data.find((w) => w.id === id)
      assert.equal(afterStep1.status, 'pending')
      assert.equal(afterStep1.current_step, 2)
      assert.equal(afterStep1.steps[0].status, 'approved')
      assert.equal(afterStep1.can_decide, false, 'manager cannot approve the admin step')

      const wrongStep = await request(app).patch(`/api/workflows/${id}`).set(auth(manager)).send({ status: 'approved' })
      assert.equal(wrongStep.status, 403)

      // Due within a day → the current approver (admin) gets a reminder, only once per day.
      assert.ok((await sendWorkflowReminders()) >= 1)
      const again = await query('SELECT last_reminded_at FROM workflows WHERE id = $1', [id])
      assert.ok(again.rows[0].last_reminded_at)

      const final = await request(app).patch(`/api/workflows/${id}`).set(auth(admin)).send({ status: 'approved' })
      assert.equal(final.status, 200)
      const done = (await request(app).get('/api/workflows').set(auth(employee))).body.data.find((w) => w.id === id)
      assert.equal(done.status, 'approved')
      assert.equal(done.can_complete, true)
    } finally {
      await query('DELETE FROM workflows WHERE id = $1', [id])
      await query('DELETE FROM notifications WHERE title LIKE $1', [`%${title}%`])
    }
  })
})
