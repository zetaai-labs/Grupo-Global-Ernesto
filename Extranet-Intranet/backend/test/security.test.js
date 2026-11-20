import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { config } from '../src/config/env.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('session tokens', () => {
  it('rejects an MFA challenge token as a session token', async () => {
    const admin = await loginAs('admin@gmail.com')
    const mfaToken = jwt.sign({ sub: admin.user.id, purpose: 'mfa' }, config.jwtSecret, { expiresIn: '5m' })
    const response = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${mfaToken}`)
    assert.equal(response.status, 401)
  })
})

describe('email privacy', () => {
  it('shows users only their own emails', async () => {
    const admin = await loginAs('admin@gmail.com')
    const employee = await loginAs('employee@gmail.com')

    const sent = await request(app)
      .post('/api/emails')
      .set(auth(admin))
      .send({ to: 'someone@example.com', subject: 'Private test', body: 'Admin only' })
    assert.equal(sent.status, 201)

    try {
      const list = await request(app).get('/api/emails').set(auth(employee))
      assert.equal(list.status, 200)
      assert.equal(list.body.data.some((email) => email.id === sent.body.data.id), false)
    } finally {
      await query('DELETE FROM emails WHERE id = $1', [sent.body.data.id])
    }
  })
})

describe('AutoFlow approvals', () => {
  it('blocks self-approval and invalid transitions, allows an approver', async () => {
    const admin = await loginAs('admin@gmail.com')
    const employee = await loginAs('employee@gmail.com')

    const created = await request(app)
      .post('/api/workflows')
      .set(auth(employee))
      .send({ title: 'Test purchase approval' })
    assert.equal(created.status, 201)
    const id = created.body.data.id

    try {
      const self = await request(app).patch(`/api/workflows/${id}`).set(auth(employee)).send({ status: 'approved' })
      assert.equal(self.status, 403)

      const skip = await request(app).patch(`/api/workflows/${id}`).set(auth(admin)).send({ status: 'completed' })
      assert.equal(skip.status, 409)

      const approved = await request(app).patch(`/api/workflows/${id}`).set(auth(admin)).send({ status: 'approved', note: 'OK' })
      assert.equal(approved.status, 200)

      const done = await request(app).patch(`/api/workflows/${id}`).set(auth(employee)).send({ status: 'completed' })
      assert.equal(done.status, 200)
    } finally {
      await query('DELETE FROM workflows WHERE id = $1', [id])
      await query("DELETE FROM notifications WHERE title LIKE '%Test purchase approval%'")
    }
  })
})

describe('recycle bin', () => {
  it('deletes and restores a folder subtree, and only admins can purge', async () => {
    const admin = await loginAs('admin@gmail.com')
    const employee = await loginAs('employee@gmail.com')

    const parent = await request(app).post('/api/folders').set(auth(admin)).send({ name: 'RB Parent' })
    const child = await request(app)
      .post('/api/folders')
      .set(auth(admin))
      .send({ name: 'RB Child', parent_id: parent.body.data.id })
    assert.equal(child.status, 201)
    const parentId = parent.body.data.id
    const childId = child.body.data.id

    try {
      const removed = await request(app).delete(`/api/folders/${parentId}`).set(auth(admin))
      assert.equal(removed.status, 200)

      const childRow = await query('SELECT deleted_at FROM folders WHERE id = $1', [childId])
      assert.ok(childRow.rows[0].deleted_at, 'sub-folder should be soft-deleted with its parent')

      const restoreChild = await request(app).post(`/api/recycle-bin/folder/${childId}/restore`).set(auth(admin))
      assert.equal(restoreChild.status, 409, 'cannot restore a child while its parent is deleted')

      const purgeByEmployee = await request(app).delete(`/api/recycle-bin/folder/${parentId}`).set(auth(employee))
      assert.ok([403, 404].includes(purgeByEmployee.status))

      const restored = await request(app).post(`/api/recycle-bin/folder/${parentId}/restore`).set(auth(admin))
      assert.equal(restored.status, 200)
      const after = await query('SELECT deleted_at FROM folders WHERE id = $1', [childId])
      assert.equal(after.rows[0].deleted_at, null, 'sub-folder should be restored with its parent')
    } finally {
      await query('DELETE FROM folders WHERE id = $1', [parentId])
    }
  })
})

describe('password reset', () => {
  it('gives the same answer for known and unknown emails', async () => {
    const known = await request(app).post('/api/auth/password-reset/request').send({ email: 'employee@gmail.com' })
    const unknown = await request(app).post('/api/auth/password-reset/request').send({ email: 'nobody@nowhere.test' })
    assert.equal(known.status, 200)
    assert.equal(unknown.status, 200)
    assert.equal(known.body.message, unknown.body.message)
  })
})

describe('extranet shared downloads', () => {
  it('lets an external user download only files shared with them', async () => {
    const client = await loginAs('customer@gmail.com')
    const supplier = await loginAs('supplier@gmail.com')

    const mine = await request(app).get('/api/external-shares/shared-with-me').set(auth(client))
    assert.equal(mine.status, 200)
    const clientFile = mine.body.data.files[0]
    assert.ok(clientFile, 'seed should share at least one file with the client')

    const ok = await request(app)
      .get(`/api/external-shares/shared-with-me/files/${clientFile.id}/download`)
      .set(auth(client))
    assert.equal(ok.status, 200)

    const denied = await request(app)
      .get(`/api/external-shares/shared-with-me/files/${clientFile.id}/download`)
      .set(auth(supplier))
    assert.equal(denied.status, 404)

    const staffOnly = await request(app).get(`/api/files/${clientFile.id}/download`).set(auth(client))
    assert.equal(staffOnly.status, 403)
  })
})
