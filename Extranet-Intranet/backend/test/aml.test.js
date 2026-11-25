import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { buildQuery, categoriesFor, screenOrganization } from '../src/integrations/aml/openSanctions.js'
import { integrationReport } from '../src/services/integrationStatus.service.js'

const realFetch = globalThis.fetch
const saved = { provider: process.env.AML_PROVIDER, key: process.env.OPENSANCTIONS_API_KEY }
const restore = (name, value) => { if (value === undefined) delete process.env[name]; else process.env[name] = value }
const enable = () => Object.assign(process.env, { AML_PROVIDER: 'opensanctions', OPENSANCTIONS_API_KEY: 'test-key' })
const reply = (results) => async () => new Response(JSON.stringify({ responses: { org: { status: 200, results } } }), { status: 200 })
const auth = (s) => ({ Authorization: `Bearer ${s.token}` })

afterEach(() => {
  globalThis.fetch = realFetch
  restore('AML_PROVIDER', saved.provider)
  restore('OPENSANCTIONS_API_KEY', saved.key)
})

describe('automatic AML screening', () => {
  it('maps list topics to the three checks', () => {
    assert.deepEqual(categoriesFor(['sanction.linked']), ['SANCTIONS'])
    assert.deepEqual(categoriesFor(['role.rca']), ['PEP'])
    assert.deepEqual(categoriesFor(['crime.fraud', 'debarment']), ['ADVERSE_MEDIA'])
    assert.deepEqual(categoriesFor(['poi']), [])
  })

  it('sends the company name, country and real registration number only', () => {
    assert.deepEqual(buildQuery({ legal_name: ' Acme S.L. ', country: 'ESP', tax_id: 'B12345674' }).queries.org, {
      schema: 'Company', properties: { name: ['Acme S.L.'], jurisdiction: ['es'], registrationNumber: ['B12345674'] },
    })
    assert.deepEqual(buildQuery({ legal_name: 'Demo', country: 'XXX', tax_id: 'DEMO-ES-0001' }).queries.org.properties, { name: ['Demo'] })
  })

  it('records hits only at or above the threshold and authenticates with the key', async () => {
    enable()
    let sent
    globalThis.fetch = async (url, options) => {
      sent = { url, options }
      return reply([
        { id: 'NK-1', caption: 'Listed Co', score: 0.93, match: true, properties: { topics: ['sanction'] } },
        { id: 'NK-2', caption: 'Weak Co', score: 0.4, match: false, properties: { topics: ['role.pep'] } },
      ])()
    }
    const result = await screenOrganization({ legal_name: 'Acme', country: 'ESP' })
    assert.deepEqual([result.SANCTIONS, result.PEP, result.ADVERSE_MEDIA], ['HIT', 'CLEAR', 'CLEAR'])
    assert.equal(result.matches.length, 1)
    assert.equal(sent.options.headers.Authorization, 'ApiKey test-key')
    assert.match(sent.url, /^https:\/\/api\.opensanctions\.org\/match\/default\?threshold=0\.7$/)
  })

  it('never records CLEAR when the service fails', async () => {
    enable()
    for (const failure of [async () => new Response('{}', { status: 500 }), async () => { throw new Error('down') }, async () => new Response('{"responses":{}}', { status: 200 })]) {
      globalThis.fetch = failure
      await assert.rejects(screenOrganization({ legal_name: 'Acme' }), (error) => error.status === 503)
    }
  })

  it('lets Compliance run it on a pending organisation and keeps manual override', async () => {
    enable()
    globalThis.fetch = reply([{ id: 'NK-9', caption: 'Risky Co', score: 0.88, match: true, properties: { topics: ['role.pep', 'crime.fraud'] } }])
    const [hr, manager] = await Promise.all([loginAs('hr@gmail.com'), loginAs('manager@gmail.com')])
    const { org_id: orgId } = (await query(
      `INSERT INTO organizations (legal_name, tax_id, country, region_corridor, org_type, onboarding_stage)
       VALUES ($1, 'B12345674', 'ESP', 'SPAIN_EU', 'CLIENT', 4) RETURNING org_id`,
      [`AML Test ${Date.now()}`],
    )).rows[0]
    try {
      assert.equal((await request(app).post(`/api/organizations/${orgId}/screening/auto`).set(auth(manager))).status, 403)
      const run = await request(app).post(`/api/organizations/${orgId}/screening/auto`).set(auth(hr))
      assert.equal(run.status, 200)
      assert.deepEqual(run.body.data.results, { SANCTIONS: 'CLEAR', PEP: 'HIT', ADVERSE_MEDIA: 'HIT' })
      const org = (await request(app).get(`/api/organizations/${orgId}`).set(auth(hr))).body.data
      assert.equal(org.onboarding_stage, 4)
      assert.equal(org.screening.find((check) => check.check_type === 'PEP').details.method, 'automatic')
      assert.equal(org.screening.find((check) => check.check_type === 'PEP').details.matches[0].name, 'Risky Co')

      const manual = await request(app).post(`/api/organizations/${orgId}/screening`).set(auth(hr))
        .send({ sanctions: 'CLEAR', pep: 'CLEAR', adverse_media: 'CLEAR', notes: 'False positive: different company.' })
      assert.equal(manual.body.data.clear, true)
    } finally {
      await query('DELETE FROM organizations WHERE org_id = $1', [orgId])
    }
  })

  it('screens directors and owners with the company in one request', async () => {
    enable()
    let sent
    globalThis.fetch = async (_url, options) => {
      sent = JSON.parse(options.body)
      return new Response(JSON.stringify({ responses: {
        org: { results: [] },
        p0: { results: [{ id: 'NK-P', caption: 'Ana Risk', score: 0.91, match: true, properties: { topics: ['role.pep'] } }] },
        p1: { results: [] },
      } }), { status: 200 })
    }
    const hr = await loginAs('hr@gmail.com')
    const { org_id: orgId } = (await query(
      `INSERT INTO organizations (legal_name, tax_id, country, region_corridor, org_type, onboarding_stage)
       VALUES ($1, 'B12345674', 'ESP', 'SPAIN_EU', 'CLIENT', 4) RETURNING org_id`,
      [`AML People ${Date.now()}`],
    )).rows[0]
    try {
      const add = (body) => request(app).post(`/api/organizations/${orgId}/people`).set(auth(hr)).send(body)
      assert.equal((await add({ full_name: 'Ana Risk', person_role: 'DIRECTOR', nationality: 'esp', birth_year: 1970 })).status, 201)
      assert.equal((await add({ full_name: 'Bo Owner', person_role: 'BENEFICIAL_OWNER' })).status, 400, 'owners need a percentage')
      assert.equal((await add({ full_name: 'Bo Owner', person_role: 'BENEFICIAL_OWNER', ownership_pct: 60 })).status, 201)
      assert.equal((await add({ full_name: 'Cy Owner', person_role: 'BENEFICIAL_OWNER', ownership_pct: 50 })).status, 400, 'over 100%')

      const run = await request(app).post(`/api/organizations/${orgId}/screening/auto`).set(auth(hr))
      assert.equal(run.status, 200)
      assert.equal(run.body.data.people_screened, 2)
      assert.deepEqual(run.body.data.results, { SANCTIONS: 'CLEAR', PEP: 'HIT', ADVERSE_MEDIA: 'CLEAR' })
      assert.deepEqual(sent.queries.p0, { schema: 'Person', properties: { name: ['Ana Risk'], nationality: ['es'], birthDate: ['1970'] } })
      const people = (await request(app).get(`/api/organizations/${orgId}`).set(auth(hr))).body.data.people
      const ana = people.find((person) => person.full_name === 'Ana Risk')
      assert.equal(ana.last_screening.PEP, 'HIT')
      assert.equal(people.find((person) => person.full_name === 'Bo Owner').last_screening.PEP, 'CLEAR')
      const manager = await loginAs('manager@gmail.com')
      assert.equal((await request(app).post(`/api/organizations/${orgId}/people`).set(auth(manager)).send({ full_name: 'X Y', person_role: 'DIRECTOR' })).status, 403)
      assert.equal((await request(app).delete(`/api/organizations/${orgId}/people/${ana.person_id}`).set(auth(hr))).status, 200)
    } finally {
      await query('DELETE FROM organizations WHERE org_id = $1', [orgId])
    }
  })

  it('is reported on the Integrations page', async () => {
    restore('AML_PROVIDER', undefined)
    assert.equal((await integrationReport()).items.find((item) => item.key === 'aml').status, 'NOT_SET')
    enable()
    const item = (await integrationReport()).items.find((entry) => entry.key === 'aml')
    assert.deepEqual([item.status, item.built], ['CONFIGURED', true])
  })
})
