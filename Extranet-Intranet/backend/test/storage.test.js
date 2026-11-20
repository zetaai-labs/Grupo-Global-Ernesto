import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { config } from '../src/config/env.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('file storage', () => {
  it('encrypts uploads at rest and returns the original bytes on download', { skip: !config.storage.encryptionKey && 'STORAGE_ENCRYPTION_KEY not set' }, async () => {
    const admin = await loginAs('admin@gmail.com')
    const folder = await request(app).post('/api/folders').set(auth(admin)).send({ name: `Storage test ${Date.now()}` })
    const content = Buffer.from('Confidential: Q4 board minutes — ñ, é, 漢字')

    const uploaded = await request(app)
      .post('/api/files')
      .set(auth(admin))
      .field('folder_id', String(folder.body.data.id))
      .attach('file', content, 'minutes.txt')
    assert.equal(uploaded.status, 201)

    try {
      const { rows } = await query('SELECT stored_name FROM files WHERE id = $1', [uploaded.body.data.id])
      const onDisk = fs.readFileSync(path.join(config.uploadDir, rows[0].stored_name))
      assert.equal(onDisk.subarray(0, 6).toString(), 'GGENC1', 'file is encrypted on disk')
      assert.equal(onDisk.includes(Buffer.from('Confidential')), false, 'no plaintext on disk')

      const download = await request(app)
        .get(`/api/files/${uploaded.body.data.id}/download`)
        .set(auth(admin))
        .buffer(true)
        .parse((res, done) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => done(null, Buffer.concat(chunks))) })
      assert.equal(download.status, 200)
      assert.ok(Buffer.compare(download.body, content) === 0, 'download returns the original bytes')
      assert.match(download.headers['content-disposition'], /minutes\.txt/)
    } finally {
      await request(app).delete(`/api/folders/${folder.body.data.id}`).set(auth(admin))
      await request(app).delete(`/api/recycle-bin/folder/${folder.body.data.id}`).set(auth(admin))
    }
  })
})
