import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('notifications', () => {
  it('notifies the approver of a new request and supports mark-as-read', async () => {
    const employee = await loginAs('employee@gmail.com')
    const manager = await loginAs('manager@gmail.com')
    const title = `Notification test ${Date.now()}`

    const created = await request(app)
      .post('/api/workflows')
      .set(auth(employee))
      .send({ title, approver_id: manager.user.id })
    assert.equal(created.status, 201)

    try {
      const list = await request(app).get('/api/notifications').set(auth(manager))
      assert.equal(list.status, 200)
      const item = list.body.data.find((n) => n.title.includes(title))
      assert.ok(item, 'manager should receive an approval notification')
      assert.equal(item.read_at, null)
      assert.ok(list.body.unread >= 1)

      const otherUser = await request(app).post(`/api/notifications/${item.id}/read`).set(auth(employee))
      assert.equal(otherUser.status, 404, 'users cannot touch other users’ notifications')

      const read = await request(app).post(`/api/notifications/${item.id}/read`).set(auth(manager))
      assert.equal(read.status, 200)
    } finally {
      await query('DELETE FROM workflows WHERE id = $1', [created.body.data.id])
      await query('DELETE FROM notifications WHERE title LIKE $1', [`%${title}%`])
    }
  })
})
