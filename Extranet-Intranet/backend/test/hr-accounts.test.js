import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { query } from '../src/config/database.js'
import { app, loginAs } from './helpers.js'

const PASSWORD = 'Test-Account-Pass1!'

describe('HR account management', () => {
  let hr
  let roleIds
  let externalOrgId
  let internalOrgId

  const auth = (req) => req.set('Authorization', `Bearer ${hr.token}`)
  const newUser = (role, extra = {}) => ({
    name: `HR test ${role}`,
    email: `hr-test-${randomUUID()}@example.test`,
    password: PASSWORD,
    role_id: roleIds[role],
    ...extra,
  })
  const createDirectly = async (role) => {
    const { rows } = await query(
      "INSERT INTO users (name, email, password_hash, role_id) VALUES ('HR target', $1, '!test', $2) RETURNING id",
      [`hr-target-${randomUUID()}@example.test`, roleIds[role]],
    )
    return rows[0].id
  }

  before(async () => {
    hr = await loginAs('hr@gmail.com')
    const roles = await query('SELECT id, name FROM roles')
    roleIds = Object.fromEntries(roles.rows.map((row) => [row.name, row.id]))
    const orgs = await query("SELECT org_id, org_type FROM organizations WHERE verification_status = 'VERIFIED'")
    internalOrgId = orgs.rows.find((org) => ['PARENT', 'BUSINESS_UNIT'].includes(org.org_type)).org_id
    externalOrgId = orgs.rows.find((org) => !['PARENT', 'BUSINESS_UNIT'].includes(org.org_type)).org_id
  })

  for (const role of ['employee', 'manager']) {
    it(`lets HR create a ${role}`, async () => {
      const response = await auth(request(app).post('/api/users')).send(newUser(role, { org_id: internalOrgId }))
      assert.equal(response.status, 201)
    })

    it(`lets HR suspend and reactivate a ${role}`, async () => {
      const id = await createDirectly(role)
      const suspended = await auth(request(app).patch(`/api/users/${id}/status`)).send({ status: 'suspended' })
      assert.equal(suspended.status, 200)
      const active = await auth(request(app).patch(`/api/users/${id}/status`)).send({ status: 'active' })
      assert.equal(active.status, 200)
    })
  }

  for (const role of ['admin', 'tech_admin', 'hr', 'finance', 'partner', 'client', 'supplier', 'investor']) {
    it(`blocks HR from creating a ${role}`, async () => {
      const response = await auth(request(app).post('/api/users')).send(newUser(role))
      assert.equal(response.status, 403)
    })

    it(`blocks HR from changing a ${role} status`, async () => {
      const id = await createDirectly(role)
      const response = await auth(request(app).patch(`/api/users/${id}/status`)).send({ status: 'suspended' })
      assert.equal(response.status, 403)
      const { rows } = await query('SELECT status FROM users WHERE id = $1', [id])
      assert.equal(rows[0].status, 'active')
    })
  }

  it('blocks HR from placing staff in an external company', async () => {
    const response = await auth(request(app).post('/api/users')).send(newUser('employee', { org_id: externalOrgId }))
    assert.equal(response.status, 403)
  })

  it('does not let HR lift a Tier 2 suspension through the status endpoint', async () => {
    const id = await createDirectly('employee')
    const issued = await auth(request(app).post('/api/governance/sanctions')).send({
      user_id: id, tier: 2, suspension_days: 14, reason: 'Test of the Tier 2 clearance rule.',
    })
    assert.equal(issued.status, 201)
    const response = await auth(request(app).patch(`/api/users/${id}/status`)).send({ status: 'active' })
    assert.equal(response.status, 409)
  })

  for (const role of ['admin', 'tech_admin']) {
    it(`blocks a Technical Admin from changing a ${role} status`, async () => {
      const tech = await loginAs('techadmin@gmail.com')
      const id = await createDirectly(role)
      const response = await request(app)
        .patch(`/api/users/${id}/status`)
        .set('Authorization', `Bearer ${tech.token}`)
        .send({ status: 'suspended' })
      assert.equal(response.status, 403)
      const { rows } = await query('SELECT status FROM users WHERE id = $1', [id])
      assert.equal(rows[0].status, 'active')
    })
  }

  it('lets a Technical Admin still manage an employee', async () => {
    const tech = await loginAs('techadmin@gmail.com')
    const id = await createDirectly('employee')
    const response = await request(app)
      .patch(`/api/users/${id}/status`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({ status: 'suspended' })
    assert.equal(response.status, 200)
  })

  it('lets the Super Admin manage a Technical Admin but not their own account', async () => {
    const admin = await loginAs('admin@gmail.com')
    const id = await createDirectly('tech_admin')
    const other = await request(app)
      .patch(`/api/users/${id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'suspended' })
    assert.equal(other.status, 200)
    const self = await query("SELECT id FROM users WHERE email = 'admin@gmail.com'")
    const own = await request(app)
      .patch(`/api/users/${self.rows[0].id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'suspended' })
    assert.equal(own.status, 400)
  })

  it('still denies employees account management', async () => {
    const employee = await loginAs('employee@gmail.com')
    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${employee.token}`)
      .send(newUser('employee'))
    assert.equal(response.status, 403)
  })
})
