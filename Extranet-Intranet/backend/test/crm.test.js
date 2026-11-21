import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { signWebhook } from '../src/controllers/crm.controller.js'
import { config } from '../src/config/env.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

async function orgId(name) {
  return (await query('SELECT org_id FROM organizations WHERE legal_name = $1', [name])).rows[0].org_id
}

describe('CRM relationships', () => {
  it('runs a pipeline with confidentiality rules and an activity timeline', async () => {
    const admin = await loginAs('admin@gmail.com')
    const manager = await loginAs('manager@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const customer = await loginAs('customer@gmail.com')
    const entity = await orgId('Iberia Retail S.L.')
    const ids = []

    try {
      const denied = await request(app).post('/api/crm').set(auth(employee)).send({ entity_id: entity, title: 'x', contact_type: 'CLIENT' })
      assert.equal(denied.status, 403, 'employees cannot create relationships')

      const internal = await request(app).post('/api/crm').set(auth(manager)).send({
        entity_id: entity, title: 'Iberia store roll-out 2027', contact_type: 'CLIENT',
        confidentiality_level: 'INTERNAL', estimated_value_eur: 250000, note: 'Kick-off meeting held.',
      })
      assert.equal(internal.status, 201)
      ids.push(internal.body.data.rel_id)

      const secret = await request(app).post('/api/crm').set(auth(admin)).send({
        entity_id: entity, title: 'Confidential acquisition talks', contact_type: 'STRATEGIC_PARTNER',
        confidentiality_level: 'HIGHLY_CONFIDENTIAL', assigned_manager: admin.user.id,
      })
      ids.push(secret.body.data.rel_id)

      // Visibility: employees see INTERNAL, not HIGHLY_CONFIDENTIAL; managers can't see the admin's secret record either.
      const employeeList = await request(app).get('/api/crm').set(auth(employee))
      assert.ok(employeeList.body.data.some((rel) => rel.rel_id === ids[0]))
      assert.equal(employeeList.body.data.some((rel) => rel.rel_id === ids[1]), false)
      const managerView = await request(app).get(`/api/crm/${ids[1]}`).set(auth(manager))
      assert.equal(managerView.status, 404)
      const externalDenied = await request(app).get('/api/crm').set(auth(customer))
      assert.equal(externalDenied.status, 403)

      // Pipeline move + timeline.
      const moved = await request(app).patch(`/api/crm/${ids[0]}`).set(auth(manager)).send({ pipeline_stage: 'PROPOSAL' })
      assert.equal(moved.status, 200)
      const employeeEdit = await request(app).patch(`/api/crm/${ids[0]}`).set(auth(employee)).send({ pipeline_stage: 'ARCHIVED' })
      assert.equal(employeeEdit.status, 403)
      await request(app).post(`/api/crm/${ids[0]}/activities`).set(auth(employee)).send({ body: 'Sent pricing deck.' })

      const detail = await request(app).get(`/api/crm/${ids[0]}`).set(auth(manager))
      const kinds = detail.body.data.activities.map((activity) => activity.kind)
      assert.ok(kinds.includes('STAGE_CHANGE') && kinds.includes('NOTE') && kinds.includes('SYSTEM'))
      assert.equal(detail.body.data.pipeline_stage, 'PROPOSAL')

      const list = await request(app).get('/api/crm').set(auth(admin))
      assert.ok(list.body.meta.pipeline.PROPOSAL.count >= 1)
    } finally {
      for (const id of ids) await query('DELETE FROM crm_relationships WHERE rel_id = $1', [id])
      await query("DELETE FROM notifications WHERE title LIKE 'CRM:%' OR title LIKE 'Contract active:%'")
    }
  })

  it('accepts only correctly signed, fresh website lead webhooks', { skip: !config.integrations.webhookSecret && 'WEBHOOK_SECRET not set' }, async () => {
    const name = `Webhook Lead ${Date.now()} SL`
    const body = JSON.stringify({ legal_name: name, contact_name: 'Ana López', contact_email: 'ana@example.test', interest: 'CLIENT', message: 'Interested in membership.' })
    const timestamp = String(Math.floor(Date.now() / 1000))
    try {
      const forged = await request(app).post('/api/webhooks/crm-lead').set('Content-Type', 'application/json')
        .set('X-GG-Signature', `sha256=${'0'.repeat(64)}`).set('X-GG-Timestamp', timestamp).send(body)
      assert.equal(forged.status, 401)

      const stale = await request(app).post('/api/webhooks/crm-lead').set('Content-Type', 'application/json')
        .set('X-GG-Signature', `sha256=${signWebhook(body)}`).set('X-GG-Timestamp', '1000').send(body)
      assert.equal(stale.status, 401)

      const accepted = await request(app).post('/api/webhooks/crm-lead').set('Content-Type', 'application/json')
        .set('X-GG-Signature', `sha256=${signWebhook(body)}`).set('X-GG-Timestamp', timestamp).send(body)
      assert.equal(accepted.status, 201)
      const rel = await query('SELECT pipeline_stage, source FROM crm_relationships WHERE rel_id = $1', [accepted.body.data.rel_id])
      assert.equal(rel.rows[0].pipeline_stage, 'LEAD')
      assert.equal(rel.rows[0].source, 'website')
    } finally {
      await query('DELETE FROM organizations WHERE legal_name = $1', [name])
      await query("DELETE FROM notifications WHERE title LIKE 'New website lead:%'")
    }
  })
})
