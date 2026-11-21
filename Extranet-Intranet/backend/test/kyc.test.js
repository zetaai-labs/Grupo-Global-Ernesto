import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const pdf = Buffer.from('%PDF-1.4\n% test document\n')

describe('KYC / KYB onboarding (5 steps)', () => {
  it('takes an organisation from pre-registration to a verified account with an NDA', async () => {
    const admin = await loginAs('admin@gmail.com')
    const hr = await loginAs('hr@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const stamp = Date.now()
    const email = `kyc-${stamp}@example.test`
    const legalName = `KYC Test Comercial ${stamp} S.L.`
    let orgId

    try {
      // Step 1 — pre-registration (public).
      const registered = await request(app).post('/api/public/onboarding').send({
        legal_name: legalName, tax_id: 'B12345678', pic_code: '999999999', country: 'esp',
        region_corridor: 'SPAIN_EU', org_type: 'CLIENT', contact_name: 'Marta Ruiz', contact_email: email,
      })
      assert.equal(registered.status, 201)
      const { token } = registered.body.data
      orgId = registered.body.data.org_id

      // Submitting without documents fails automatic validation.
      const early = await request(app).post(`/api/public/onboarding/${token}/submit`)
      assert.equal(early.body.data.passed, false)
      assert.ok(early.body.data.issues.some((issue) => issue.includes('Missing documents')))

      // Step 2 — legal documents.
      for (const docType of ['INCORPORATION_CERTIFICATE', 'LEGAL_REPRESENTATION', 'DIRECTOR_ID']) {
        const uploaded = await request(app)
          .post(`/api/public/onboarding/${token}/documents`)
          .field('doc_type', docType)
          .attach('file', pdf, `${docType}.pdf`)
        assert.equal(uploaded.status, 201)
      }

      // Step 3 — automatic validation passes now.
      const submitted = await request(app).post(`/api/public/onboarding/${token}/submit`)
      assert.equal(submitted.body.data.passed, true)
      const status = await request(app).get(`/api/public/onboarding/${token}`)
      assert.equal(status.body.data.onboarding_stage, 4)

      // Approval is blocked until screening is clear.
      const tooEarly = await request(app).post(`/api/organizations/${orgId}/decision`).set(auth(admin)).send({ decision: 'APPROVE' })
      assert.equal(tooEarly.status, 409)

      // Step 4 — screening by the Compliance Office only.
      const denied = await request(app).post(`/api/organizations/${orgId}/screening`).set(auth(employee))
        .send({ sanctions: 'CLEAR', pep: 'CLEAR', adverse_media: 'CLEAR' })
      assert.equal(denied.status, 403)
      const screened = await request(app).post(`/api/organizations/${orgId}/screening`).set(auth(hr))
        .send({ sanctions: 'CLEAR', pep: 'CLEAR', adverse_media: 'CLEAR', notes: 'No matches' })
      assert.equal(screened.body.data.stage, 5)

      // Step 5 — approval issues the account and NDA.
      const approved = await request(app).post(`/api/organizations/${orgId}/decision`).set(auth(admin)).send({ decision: 'APPROVE' })
      assert.equal(approved.status, 200)
      assert.equal(approved.body.data.account_created, true)
      const resetToken = new URL(approved.body.data.set_password_link).searchParams.get('token')

      const setPassword = await request(app).post('/api/auth/password-reset/confirm').send({ token: resetToken, new_password: 'NewClient#2026' })
      assert.equal(setPassword.status, 200)
      const login = await request(app).post('/api/auth/login').send({ email, password: 'NewClient#2026' })
      assert.equal(login.status, 200)
      assert.equal(login.body.data.user.role, 'client')
      assert.equal(login.body.data.user.role_code, 'ROLE_CLIENT_PARTNER')
      assert.equal(login.body.data.user.org_id, orgId)

      const mine = await request(app).get('/api/organizations/me').set(auth(login.body.data))
      assert.equal(mine.body.data.verification_status, 'VERIFIED')
      assert.equal(mine.body.data.nda.accepted_at, null)
      const accepted = await request(app).post('/api/organizations/me/nda/accept').set(auth(login.body.data))
      assert.match(accepted.body.data.acceptance_hash, /^[0-9a-f]{64}$/)

      // Suspending the organisation blocks its users immediately.
      const suspended = await request(app).patch(`/api/organizations/${orgId}/status`).set(auth(admin)).send({ status: 'SUSPENDED' })
      assert.equal(suspended.status, 200)
      const blocked = await request(app).get('/api/organizations/me').set(auth(login.body.data))
      assert.equal(blocked.status, 401)

      // Registry is readable by staff with registry access, not by externals.
      const registry = await request(app).get('/api/organizations?q=KYC%20Test').set(auth(hr))
      assert.ok(registry.body.data.some((org) => org.org_id === orgId))
      const customer = await loginAs('customer@gmail.com')
      const externalDenied = await request(app).get('/api/organizations').set(auth(customer))
      assert.equal(externalDenied.status, 403)
    } finally {
      await query('DELETE FROM users WHERE email = $1', [email])
      if (orgId) await query('DELETE FROM organizations WHERE org_id = $1', [orgId])
      await query("DELETE FROM notifications WHERE title LIKE $1", [`%${legalName}%`])
    }
  })

  it('rejects an invalid tax ID format during automatic validation', async () => {
    const stamp = Date.now()
    const registered = await request(app).post('/api/public/onboarding').send({
      legal_name: `Bad Tax ${stamp} Pvt Ltd`, tax_id: '123', country: 'IND', region_corridor: 'INDIA',
      org_type: 'VENDOR', contact_name: 'Test Person', contact_email: `bad-${stamp}@example.test`,
    })
    try {
      const submitted = await request(app).post(`/api/public/onboarding/${registered.body.data.token}/submit`)
      assert.equal(submitted.body.data.passed, false)
      assert.ok(submitted.body.data.issues.some((issue) => issue.includes('Tax ID format')))
    } finally {
      await query('DELETE FROM organizations WHERE org_id = $1', [registered.body.data.org_id])
    }
  })
})
