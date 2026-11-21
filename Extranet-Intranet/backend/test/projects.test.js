import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const orgId = async (name) => (await query('SELECT org_id FROM organizations WHERE legal_name = $1', [name])).rows[0].org_id

describe('projects & programs', () => {
  it('manages a project and shows partners only shared milestones (no budget)', async () => {
    const manager = await loginAs('manager@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const customer = await loginAs('customer@gmail.com')
    const supplier = await loginAs('supplier@gmail.com')
    const title = `Test corridor programme ${Date.now()}`
    let projectId

    try {
      const denied = await request(app).post('/api/projects').set(auth(employee))
        .send({ title, corridor: 'SPAIN_EU_INDIA', budget_eur: 1000, lead_entity: await orgId('Grupo Global Nexus') })
      assert.equal(denied.status, 403)

      const notUnit = await request(app).post('/api/projects').set(auth(manager))
        .send({ title, corridor: 'SPAIN_EU_INDIA', budget_eur: 1000, lead_entity: await orgId('Iberia Retail S.L.') })
      assert.equal(notUnit.status, 400, 'lead entity must be a business unit')

      const created = await request(app).post('/api/projects').set(auth(manager)).send({
        title, corridor: 'SPAIN_EU_INDIA', budget_eur: 480000, phase: 'PLANNING',
        lead_entity: await orgId('Grupo Global Nexus'), start_date: '2026-12-01', end_date: '2027-06-30',
      })
      assert.equal(created.status, 201)
      projectId = created.body.data.project_id

      assert.equal((await request(app).post(`/api/projects/${projectId}/members`).set(auth(manager)).send({ user_id: employee.user.id })).status, 201)
      assert.equal((await request(app).post(`/api/projects/${projectId}/partners`).set(auth(manager)).send({ org_id: await orgId('Iberia Retail S.L.') })).status, 201)

      // Members (not only managers) can add and update milestones.
      const shared = await request(app).post(`/api/projects/${projectId}/milestones`).set(auth(employee))
        .send({ title: 'Store survey complete', due_date: '2027-01-15', shared_with_partners: true })
      assert.equal(shared.status, 201)
      await request(app).post(`/api/projects/${projectId}/milestones`).set(auth(employee)).send({ title: 'Internal budget review' })
      const progressed = await request(app).patch(`/api/projects/${projectId}/milestones/${shared.body.data.milestone_id}`).set(auth(employee)).send({ status: 'DONE' })
      assert.equal(progressed.status, 200)

      // Employees cannot change the project itself.
      assert.equal((await request(app).patch(`/api/projects/${projectId}`).set(auth(employee)).send({ phase: 'EXECUTION' })).status, 403)
      assert.equal((await request(app).patch(`/api/projects/${projectId}`).set(auth(manager)).send({ phase: 'EXECUTION' })).status, 200)

      // The linked client sees only shared milestones and no budget; other externals see nothing.
      const clientView = await request(app).get('/api/projects/shared').set(auth(customer))
      const project = clientView.body.data.find((item) => item.project_id === projectId)
      assert.ok(project)
      assert.equal('budget_eur' in project, false)
      assert.deepEqual(project.milestones.map((m) => m.title), ['Store survey complete'])
      assert.equal(project.milestones[0].status, 'DONE')
      const supplierView = await request(app).get('/api/projects/shared').set(auth(supplier))
      assert.equal(supplierView.body.data.some((item) => item.project_id === projectId), false)
      assert.equal((await request(app).get('/api/projects').set(auth(customer))).status, 403)
    } finally {
      if (projectId) await query('DELETE FROM projects_programs WHERE project_id = $1', [projectId])
      await query("DELETE FROM notifications WHERE title LIKE $1 OR title LIKE $2 OR title LIKE $3", [`%${title}%`, 'Added to project:%', 'Project shared with you:%'])
    }
  })
})
