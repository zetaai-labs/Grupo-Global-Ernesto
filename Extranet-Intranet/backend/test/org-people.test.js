import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
// The membership survey every registration answers (an existing partner pays no fee).
const SURVEY = { company_size: '11-50', annual_revenue: '€1M-€10M', countries: 'Spain, Portugal', interests: ['Business matchmaking'], heard_from: 'Grupo Global team', referred_by: 'Ernesto' }
// The membership survey every registration answers (an existing partner pays no fee).const SURVEY = { company_size: '11-50', annual_revenue: '€1M-€10M', countries: 'Spain, Portugal', interests: ['Business matchmaking'], heard_from: 'Grupo Global team', referred_by: 'Ernesto' }

describe('applicant-declared directors and owners', () => {
  it('lets the applicant declare people, warns when none are declared, and supports GDPR erasure', async () => {
    const hr = await loginAs('hr@gmail.com')
    const stamp = Date.now()
    const registered = await request(app).post('/api/public/onboarding').send({ privacy_accepted: true, membership_track: 'EXISTING_PARTNER', survey: SURVEY,
      legal_name: `People Test ${stamp} S.L.`, tax_id: 'B12345678', country: 'ESP', region_corridor: 'SPAIN_EU',
      org_type: 'CLIENT', contact_name: 'Ana Gil', contact_email: `people-${stamp}@example.test`,
    })
    assert.equal(registered.status, 201)
    const { token, org_id: orgId } = registered.body.data

    try {
      // No one declared yet: auto-validation warns (does not block).
      await request(app).post(`/api/public/onboarding/${token}/submit`)
      const warned = await query("SELECT details FROM kyc_checks WHERE org_id = $1 AND check_type = 'AUTO_VALIDATION' ORDER BY created_at DESC LIMIT 1", [orgId])
      assert.ok(warned.rows[0].details.warnings.includes('No director or legal representative declared.'))
      await query('UPDATE organizations SET onboarding_stage = 2 WHERE org_id = $1', [orgId])

      const add = (body) => request(app).post(`/api/public/onboarding/${token}/people`).send(body)
      const director = await add({ full_name: 'Ana Gil Ramos', person_role: 'DIRECTOR', nationality: 'esp', birth_year: 1980 })
      assert.equal(director.status, 201)
      assert.equal(director.body.data.nationality, 'ESP')
      assert.equal(director.body.data.added_by_applicant, true)
      assert.equal((await add({ full_name: 'Owner Without Share', person_role: 'BENEFICIAL_OWNER' })).status, 400)
      assert.equal((await add({ full_name: 'Big Owner', person_role: 'BENEFICIAL_OWNER', ownership_pct: 80 })).status, 201)
      const tooMuch = await add({ full_name: 'Second Owner', person_role: 'BENEFICIAL_OWNER', ownership_pct: 30 })
      assert.equal(tooMuch.status, 400)
      assert.match(tooMuch.body.message, /100%/)

      const status = await request(app).get(`/api/public/onboarding/${token}`)
      assert.equal(status.body.data.people.length, 2)

      // A person added by Compliance cannot be removed by the applicant.
      const staffAdded = await request(app).post(`/api/organizations/${orgId}/people`).set(auth(hr)).send({ full_name: 'Legal Rep Staff', person_role: 'REPRESENTATIVE' })
      assert.equal(staffAdded.status, 201)
      assert.equal((await request(app).delete(`/api/public/onboarding/${token}/people/${staffAdded.body.data.person_id}`)).status, 404)
      assert.equal((await request(app).delete(`/api/public/onboarding/${token}/people/${director.body.data.person_id}`)).status, 200)

      // After submission the list is locked for the applicant.
      await request(app).post(`/api/public/onboarding/${token}/submit`)
      await query('UPDATE organizations SET onboarding_stage = 4 WHERE org_id = $1', [orgId])
      assert.equal((await add({ full_name: 'Late Person', person_role: 'DIRECTOR' })).status, 409)

      // GDPR erasure by Compliance: anonymised, kept in the file, left out of screening.
      const owner = (await query("SELECT person_id FROM org_people WHERE org_id = $1 AND full_name = 'Big Owner'", [orgId])).rows[0].person_id
      assert.equal((await request(app).post(`/api/organizations/${orgId}/people/${owner}/erase`).set(auth(hr)).send({ reason: 'short' })).status, 400)
      const erased = await request(app).post(`/api/organizations/${orgId}/people/${owner}/erase`).set(auth(hr)).send({ reason: 'Erasure request received by email on 24/11.' })
      assert.equal(erased.status, 200)
      const row = (await query('SELECT full_name, nationality, erased_at FROM org_people WHERE person_id = $1', [owner])).rows[0]
      assert.equal(row.full_name, 'Erased person')
      assert.equal(row.nationality, null)
      assert.ok(row.erased_at)
      assert.equal((await request(app).post(`/api/organizations/${orgId}/people/${owner}/erase`).set(auth(hr)).send({ reason: 'Erasure request received again.' })).status, 404)

      const detail = await request(app).get(`/api/organizations/${orgId}`).set(auth(hr))
      assert.ok(detail.body.data.people.some((person) => person.erased_at))
    } finally {
      await query('DELETE FROM organizations WHERE org_id = $1', [orgId])
    }
  })
})
