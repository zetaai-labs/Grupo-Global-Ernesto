import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../src/config/database.js'
import { checkVat, viesCountry, viesNumber } from '../src/integrations/vies/viesClient.js'
import { runAutoValidation } from '../src/services/kyc.service.js'
import { integrationReport } from '../src/services/integrationStatus.service.js'

const realFetch = globalThis.fetch
const saved = { enabled: process.env.VIES_ENABLED, test: process.env.VIES_USE_TEST_SERVICE }
const restore = (name, value) => { if (value === undefined) delete process.env[name]; else process.env[name] = value }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  globalThis.fetch = realFetch
  restore('VIES_ENABLED', saved.enabled)
  restore('VIES_USE_TEST_SERVICE', saved.test)
})

describe('VIES VAT check', () => {
  it('sends nothing while switched off or for non-EU countries', async () => {
    let calls = 0
    globalThis.fetch = async () => { calls += 1; return json({ valid: true }) }
    delete process.env.VIES_ENABLED
    assert.deepEqual(await checkVat('ESP', 'B12345678'), { status: 'OFF' })
    process.env.VIES_ENABLED = 'true'
    assert.deepEqual(await checkVat('IND', 'ABCDE1234F'), { status: 'NOT_APPLICABLE' })
    assert.equal(calls, 0)
  })

  it('normalises country codes and numbers', () => {
    assert.equal(viesCountry('grc'), 'EL')
    assert.equal(viesCountry('ARE'), null)
    assert.equal(viesNumber('ES', 'es b-123.456 78'), 'B12345678')
    assert.equal(viesNumber('EL', 'GR123456789'), '123456789')
  })

  it('reports valid and invalid numbers without keeping name or address', async () => {
    process.env.VIES_ENABLED = 'true'
    let sent
    globalThis.fetch = async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return json({ valid: true, name: 'Private Name', address: 'Private Address' }) }
    const valid = await checkVat('ESP', 'ESB12345678')
    assert.equal(valid.status, 'VALID')
    assert.deepEqual(sent.body, { countryCode: 'ES', vatNumber: 'B12345678' })
    assert.match(sent.url, /check-vat-number$/)
    assert.equal(JSON.stringify(valid).includes('Private'), false)
    globalThis.fetch = async () => json({ valid: false, userError: 'INVALID' })
    assert.equal((await checkVat('ESP', 'B12345678')).status, 'INVALID')
  })

  it('treats outages as unavailable, never as invalid', async () => {
    process.env.VIES_ENABLED = 'true'
    for (const response of [() => json({}, 500), () => json({ valid: false, userError: 'MS_UNAVAILABLE' }), () => json({ actionSucceed: false }), () => new Response('not json')]) {
      globalThis.fetch = async () => response()
      assert.equal((await checkVat('ESP', 'B12345678')).status, 'UNAVAILABLE')
    }
    globalThis.fetch = async () => { throw new Error('network down') }
    assert.equal((await checkVat('ESP', 'B12345678')).status, 'UNAVAILABLE')
  })

  it('warns Compliance without auto-rejecting the company', async () => {
    process.env.VIES_ENABLED = 'true'
    globalThis.fetch = async () => json({ valid: false })
    const name = `VIES Test ${Date.now()}`
    const { org_id: orgId } = (await query(
      `INSERT INTO organizations (legal_name, tax_id, country, region_corridor, org_type) VALUES ($1, 'B12345674', 'ESP', 'SPAIN_EU', 'CLIENT') RETURNING org_id`,
      [name],
    )).rows[0]
    try {
      const { details } = await runAutoValidation(orgId)
      assert.equal(details.vies.status, 'INVALID')
      assert.equal(details.warnings.length, 1)
      assert.equal(details.issues.some((issue) => issue.includes('VIES')), false)
    } finally {
      await query('DELETE FROM organizations WHERE org_id = $1', [orgId])
    }
  })

  it('appears as ready on the Integrations page once enabled', async () => {
    delete process.env.VIES_ENABLED
    assert.equal((await integrationReport()).items.find((item) => item.key === 'vies').status, 'NOT_SET')
    process.env.VIES_ENABLED = 'true'
    const item = (await integrationReport()).items.find((entry) => entry.key === 'vies')
    assert.deepEqual([item.status, item.built], ['CONFIGURED', true])
  })
})
