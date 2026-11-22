import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const orgId = async (name) => (await query('SELECT org_id FROM organizations WHERE legal_name = $1', [name])).rows[0].org_id
const folderId = async (name) => (await query('SELECT id FROM folders WHERE name = $1', [name])).rows[0].id

describe('organisation isolation', () => {
  it('keeps business-unit folders, links and shares inside the unit', async () => {
    const admin = await loginAs('admin@gmail.com')
    const employee = await loginAs('employee@gmail.com') // Grupo Global Net
    const manager = await loginAs('manager@gmail.com') // Grupo Global Nexus
    const nexus = await folderId('Nexus — Alliance Agreements')
    const net = await folderId('Net — Infrastructure Runbooks')
    const customer = await loginAs('customer@gmail.com')

    const employeeFolders = (await request(app).get('/api/folders').set(auth(employee))).body.data.map((f) => f.id)
    assert.ok(employeeFolders.includes(net))
    assert.equal(employeeFolders.includes(nexus), false)
    const managerFolders = (await request(app).get('/api/folders').set(auth(manager))).body.data.map((f) => f.id)
    assert.ok(managerFolders.includes(nexus))
    assert.equal(managerFolders.includes(net), false)
    assert.ok((await request(app).get('/api/folders').set(auth(admin))).body.data.some((f) => f.id === nexus))

    const uploaded = await request(app).post('/api/files').set(auth(admin))
      .field('folder_id', String(nexus)).attach('file', Buffer.from('private'), 'nexus-private.txt')
    assert.equal(uploaded.status, 201)
    const fileId = uploaded.body.data.id

    try {
      assert.equal((await request(app).get(`/api/files/${fileId}/download`).set(auth(employee))).status, 403)
      assert.equal((await request(app).post('/api/metalinks').set(auth(employee)).send({ file_id: fileId, label: 'leak' })).status, 403)
      assert.equal((await request(app).post('/api/external-shares').set(auth(employee)).send({ folder_id: nexus, user_id: customer.user.id })).status, 403)
      assert.equal((await request(app).post('/api/content/linked-folders').set(auth(employee)).send({ folder_id: nexus, label: 'peek' })).status, 403)
      assert.equal((await request(app).post('/api/folders').set(auth(employee)).send({ name: 'inside', parent_id: nexus })).status, 403)
    } finally {
      await query('DELETE FROM files WHERE id = $1', [fileId])
    }
  })

  it('separates CRM records and projects by unit, with Finance oversight', async () => {
    const manager = await loginAs('manager@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const finance = await loginAs('finance@gmail.com')
    const title = `Isolation test ${Date.now()}`
    const rel = await request(app).post('/api/crm').set(auth(manager)).send({
      entity_id: await orgId('Iberia Retail S.L.'), title, contact_type: 'CLIENT', confidentiality_level: 'INTERNAL',
    })
    const project = await request(app).post('/api/projects').set(auth(manager)).send({
      title, corridor: 'SPAIN_EU_INDIA', budget_eur: 5000, lead_entity: await orgId('Grupo Global Nexus'),
    })
    assert.equal(project.status, 201)

    try {
      assert.equal((await request(app).get(`/api/crm/${rel.body.data.rel_id}`).set(auth(employee))).status, 404)
      assert.equal((await request(app).get(`/api/projects/${project.body.data.project_id}`).set(auth(employee))).status, 404)
      assert.equal((await request(app).get(`/api/projects/${project.body.data.project_id}`).set(auth(finance))).status, 200)
      assert.equal((await request(app).post('/api/projects').set(auth(manager)).send({
        title: `${title} other`, corridor: 'GCC_DUBAI', budget_eur: 1, lead_entity: await orgId('Grupo Global Net'),
      })).status, 403)
      const consoleView = await request(app).get('/api/dashboard/console').set(auth(finance))
      assert.equal(consoleView.body.data.console, 'FINANCE')
    } finally {
      await query('DELETE FROM crm_relationships WHERE rel_id = $1', [rel.body.data.rel_id])
      await query('DELETE FROM projects_programs WHERE project_id = $1', [project.body.data.project_id])
    }
  })
})

describe('Tier 1 remediation and external Code of Ethics', () => {
  it('requires re-completing the course, then clears the warning automatically', async () => {
    const hr = await loginAs('hr@gmail.com')
    const supplier = await loginAs('supplier@gmail.com')
    let sanctionId

    try {
      const signedBefore = await request(app).get('/api/governance/me').set(auth(supplier))
      assert.equal(signedBefore.status, 200)
      assert.equal(signedBefore.body.data.required_tier, 'TIER_1_BASIC')

      assert.equal((await request(app).get('/api/courses').set(auth(supplier))).body.data.length, 0, 'externals have no courses by default')

      const issued = await request(app).post('/api/governance/sanctions').set(auth(hr))
        .send({ user_id: supplier.user.id, tier: 1, reason: 'Procedural oversight in document handling' })
      assert.equal(issued.status, 201)
      sanctionId = issued.body.data.sanction_id

      const list = await request(app).get('/api/courses').set(auth(supplier))
      assert.equal(list.body.data.length, 1)
      const course = list.body.data[0]
      const quiz = (await query('SELECT quiz FROM community_events_courses WHERE item_id = $1', [course.item_id])).rows[0].quiz
      const passed = await request(app).post(`/api/courses/${course.item_id}/submit`).set(auth(supplier))
        .send({ answers: quiz.map((item) => item.answer) })
      assert.equal(passed.body.data.passed, true)

      const after = await query('SELECT status FROM governance_sanctions WHERE sanction_id = $1', [sanctionId])
      assert.equal(after.rows[0].status, 'CLEARED')
      assert.equal((await request(app).get('/api/courses').set(auth(supplier))).body.data.length, 0, 'access ends once cleared')
    } finally {
      if (sanctionId) await query('DELETE FROM governance_sanctions WHERE sanction_id = $1', [sanctionId])
      await query('DELETE FROM course_enrollments WHERE user_id = $1', [supplier.user.id])
      await query("DELETE FROM notifications WHERE title LIKE 'Tier 1 %' OR title = 'Formative warning issued'")
    }
  })
})
