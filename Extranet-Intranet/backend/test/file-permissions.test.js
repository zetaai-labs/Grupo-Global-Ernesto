import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'

describe('file region scoping', () => {
  it('hides another region’s files from list and download', async () => {
    const admin = await loginAs('admin@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const adminHeaders = { Authorization: `Bearer ${admin.token}` }
    const employeeHeaders = { Authorization: `Bearer ${employee.token}` }

    const folder = await request(app)
      .post('/api/folders')
      .set(adminHeaders)
      .send({ name: 'Scoped Test Folder' })
    assert.equal(folder.status, 201)

    const uploaded = await request(app)
      .post('/api/files')
      .set(adminHeaders)
      .field('folder_id', String(folder.body.data.id))
      .attach('file', Buffer.from('scoped test content'), 'scoped.txt')
    assert.equal(uploaded.status, 201)

    try {
      const list = await request(app).get('/api/files').set(employeeHeaders)
      assert.equal(list.status, 200)
      assert.equal(list.body.data.some((file) => file.id === uploaded.body.data.id), false)

      const download = await request(app)
        .get(`/api/files/${uploaded.body.data.id}/download`)
        .set(employeeHeaders)
      assert.equal(download.status, 403)
    } finally {
      // Move the folder (and its file) to the recycle bin, then purge it permanently.
      await request(app).delete(`/api/folders/${folder.body.data.id}`).set(adminHeaders)
      await request(app)
        .delete(`/api/recycle-bin/folder/${folder.body.data.id}`)
        .set(adminHeaders)
    }
  })
})
