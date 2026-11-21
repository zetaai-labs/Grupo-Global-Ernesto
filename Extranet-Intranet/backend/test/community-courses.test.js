import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('community', () => {
  it('serves the staff directory, committees and feed', async () => {
    const employee = await loginAs('employee@gmail.com')
    const manager = await loginAs('manager@gmail.com')
    const customer = await loginAs('customer@gmail.com')
    const name = `Test Committee ${Date.now()}`
    const committee = (await query("INSERT INTO community_committees (name, sector) VALUES ($1, 'FINTECH') RETURNING committee_id", [name])).rows[0].committee_id

    try {
      assert.equal((await request(app).get('/api/community/directory').set(auth(customer))).status, 403)
      const directory = await request(app).get('/api/community/directory?q=Rahul').set(auth(employee))
      assert.ok(directory.body.data.some((person) => person.email === 'manager@gmail.com'))
      assert.equal(directory.body.data.some((person) => person.role === 'client'), false)

      assert.equal((await request(app).post('/api/community/feed').set(auth(employee)).send({ body: 'Hello', committee_id: committee })).status, 403)
      assert.equal((await request(app).post(`/api/community/committees/${committee}/join`).set(auth(employee))).status, 201)
      const post = await request(app).post('/api/community/feed').set(auth(employee)).send({ body: 'Committee update', committee_id: committee })
      assert.equal(post.status, 201)
      assert.equal((await request(app).delete(`/api/community/feed/${post.body.data.post_id}`).set(auth(manager))).status, 403)
      assert.equal((await request(app).delete(`/api/community/feed/${post.body.data.post_id}`).set(auth(employee))).status, 200)

      assert.equal((await request(app).patch('/api/community/me/video-bio').set(auth(employee)).send({ video_bio_url: 'javascript:alert(1)' })).status, 400)
    } finally {
      await query('DELETE FROM community_committees WHERE committee_id = $1', [committee])
    }
  })
})

describe('courses', () => {
  it('grades on the server, issues a verifiable certificate and hides answers', async () => {
    const hr = await loginAs('hr@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const title = `Test compliance course ${Date.now()}`
    const created = await request(app).post('/api/courses').set(auth(hr)).send({
      module_type: 'COMPLIANCE_COURSE', title, pass_mark: 100,
      lessons: [{ title: 'Lesson 1', body: 'Protect confidential data.' }],
      quiz: [{ question: 'Share vault data by email?', options: ['Yes', 'No'], answer: 1 }],
    })
    assert.equal(created.status, 201)
    const id = created.body.data.item_id

    try {
      assert.equal((await request(app).post('/api/courses').set(auth(employee)).send({ module_type: 'EVENT', title: 'x y z' })).status, 403)
      const view = await request(app).get(`/api/courses/${id}`).set(auth(employee))
      assert.equal('answer' in view.body.data.quiz[0], false, 'answers are never sent to the client')

      const failed = await request(app).post(`/api/courses/${id}/submit`).set(auth(employee)).send({ answers: [0] })
      assert.equal(failed.body.data.passed, false)
      const passed = await request(app).post(`/api/courses/${id}/submit`).set(auth(employee)).send({ answers: [1] })
      assert.equal(passed.body.data.passed, true)
      assert.match(passed.body.data.certificate_hash, /^[0-9a-f]{64}$/)

      const verified = await request(app).get(`/api/public/certificates/${passed.body.data.certificate_hash}`)
      assert.equal(verified.body.data.valid, true)
      assert.equal(verified.body.data.course, title)
      assert.equal((await request(app).get(`/api/public/certificates/${'a'.repeat(64)}`)).status, 404)
    } finally {
      await query('DELETE FROM community_events_courses WHERE item_id = $1', [id])
      await query('DELETE FROM notifications WHERE title LIKE $1', [`%${title}%`])
    }
  })
})

describe('role consoles', () => {
  it('returns the console matching each role', async () => {
    const expected = { 'admin@gmail.com': 'PRESIDENTIAL', 'techadmin@gmail.com': 'DEVOPS', 'hr@gmail.com': 'HR', 'employee@gmail.com': 'DELEGATE', 'manager@gmail.com': 'DELEGATE' }
    for (const [email, consoleName] of Object.entries(expected)) {
      const session = await loginAs(email)
      const response = await request(app).get('/api/dashboard/console').set(auth(session))
      assert.equal(response.status, 200, email)
      assert.equal(response.body.data.console, consoleName)
      assert.ok(response.body.data.cards.length >= 5)
    }
    const customer = await loginAs('customer@gmail.com')
    assert.equal((await request(app).get('/api/dashboard/console').set(auth(customer))).status, 403)
  })
})
