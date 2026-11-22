import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import ExcelJS from 'exceljs'
import request from 'supertest'
import { query } from '../src/config/database.js'
import { detectLayout, mapRow, parseDate } from '../src/imports/mapping.js'
import { app, loginAs } from './helpers.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
const tag = randomBytes(4).toString('hex').toUpperCase()
const digits = () => String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 7)

describe('spreadsheet data import', () => {
  const s = {}
  const batches = []
  const orgs = []

  const upload = async (name, content) => {
    const response = await request(app).post('/api/imports/preview').set(auth(s.admin)).attach('file', content, name)
    assert.equal(response.status, 202, response.body.message)
    const id = response.body.data.batch_id
    batches.push(id)
    for (let i = 0; i < 100; i += 1) {
      const batch = (await request(app).get(`/api/imports/${id}`).set(auth(s.admin))).body.data
      if (batch.status !== 'PARSING') return batch
      await sleep(50)
    }
    throw new Error('Import did not finish.')
  }

  before(async () => {
    for (const name of ['admin', 'manager', 'hr', 'employee']) s[name] = await loginAs(`${name}@gmail.com`)
  })

  after(async () => {
    await query('DELETE FROM crm_relationships WHERE entity_id = ANY($1::uuid[])', [orgs])
    await query('DELETE FROM directory_organizations WHERE batch_id = ANY($1::uuid[])', [batches])
    await query('DELETE FROM organizations WHERE org_id = ANY($1::uuid[])', [orgs])
    await query('DELETE FROM import_batches WHERE batch_id = ANY($1::uuid[])', [batches])
  })

  it('normalises dates and Spanish postcodes', () => {
    assert.equal(parseDate('31/12/2018'), '2018-12-31')
    assert.equal(parseDate('31/02/2018'), null)
    const layout = detectLayout(['REGISTRO', 'DENOMINACIÓN', 'NIF', 'CP', 'WEB'])
    assert.equal(layout.sourceType, 'ASSOCIATIONS')
    const row = mapRow(['1', 'Asociación', 'G29837838', 8001, 'javascript:alert(1)'], layout)
    assert.equal(row.normalized.postal_code, '08001')
    assert.equal(row.normalized.website, undefined)
    assert.equal(row.status, 'WARNING')
  })

  it('reviews an association workbook across sheets, then imports it once', async () => {
    const nif = `G${digits()}8`
    const workbook = new ExcelJS.Workbook()
    const first = workbook.addWorksheet('Sheet 1')
    first.addRow(['REGISTRO', 'DENOMINACION', 'PATRONIMICO', 'NIF', 'FECHA_REGISTRO', 'FECHA_CONSTITUCION', 'SEDE', 'DOMICILIO', 'CP', 'PROVINCIA', 'LOCALIDAD', 'WEB', 'EXTRA'])
    first.addRow([`R-${tag}-1`, `Asociación ${tag} Uno`, 'AU', nif, new Date('2020-01-15'), '10/02/2019', 'Central', 'Calle Mayor 1', 8001, 'Barcelona', 'Barcelona', 'asociacion.example', 'x'])
    first.addRow([`R-${tag}-1B`, `Asociación ${tag} Uno copia`, null, nif, null, null, null, null, 28001, 'Madrid', 'Madrid', null, null])
    first.addRow([`R-${tag}-2`, null, null, null, null, null, null, null, null, null, null, null, null])
    const second = workbook.addWorksheet('Sheet 2')
    second.addRow(['REGISTRO', 'DENOMINACION', 'NIF', 'PROVINCIA', 'LOCALIDAD'])
    second.addRow([`R-${tag}-3`, `Asociación ${tag} Tres`, 'BAD', 'Madrid', 'Getafe'])
    const batch = await upload(`asociaciones-${tag}.xlsx`, Buffer.from(await workbook.xlsx.writeBuffer()))

    assert.equal(batch.status, 'READY', batch.error)
    assert.equal(batch.source_type, 'ASSOCIATIONS')
    assert.deepEqual([batch.total_rows, batch.valid_rows, batch.warning_rows, batch.invalid_rows, batch.duplicate_rows], [4, 1, 1, 1, 1])
    assert.deepEqual(batch.unmapped_columns, ['EXTRA'])
    const before = await request(app).get('/api/imports/directory').query({ q: tag }).set(auth(s.admin))
    assert.equal(before.body.total, 0, 'nothing is imported before confirmation')

    const confirmed = await request(app).post(`/api/imports/${batch.batch_id}/confirm`).set(auth(s.admin))
    assert.equal(confirmed.status, 200, confirmed.body.message)
    assert.equal(confirmed.body.data.imported, 2)
    assert.equal((await request(app).post(`/api/imports/${batch.batch_id}/confirm`).set(auth(s.admin))).status, 409)
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM import_staging WHERE batch_id = $1', [batch.batch_id])).rows[0].n, 0)

    const after = await request(app).get('/api/imports/directory').query({ q: tag }).set(auth(s.manager))
    assert.equal(after.body.total, 2)
    const uno = after.body.data.find((row) => row.tax_identifier === nif)
    assert.equal(uno.postal_code, '08001')
    assert.equal(uno.website, 'https://asociacion.example/')
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM users WHERE email LIKE $1', [`%${tag}%`])).rows[0].n, 0, 'no login is created')

    const again = await upload(`asociaciones-copy-${tag}.xlsx`, Buffer.from(await workbook.xlsx.writeBuffer()))
    assert.equal(again.valid_rows + again.warning_rows, 0, 'a re-upload adds nothing')

    const promoted = await request(app).post(`/api/imports/directory/${uno.directory_id}/promote`).set(auth(s.manager)).send({})
    assert.equal(promoted.status, 201, promoted.body.message)
    orgs.push(promoted.body.data.org_id)
    const org = (await query('SELECT verification_status, onboarding_stage FROM organizations WHERE org_id = $1', [promoted.body.data.org_id])).rows[0]
    assert.deepEqual([org.verification_status, org.onboarding_stage], ['PENDING', 1])
    assert.equal((await request(app).post(`/api/imports/directory/${uno.directory_id}/promote`).set(auth(s.manager)).send({})).status, 409)
  })

  it('reads a Windows-1252 semicolon CSV with contacts and removes them on GDPR erasure', async () => {
    const email = `contact-${tag.toLowerCase()}@example.test`
    const csv = Buffer.from(`NOMBRE COMERCIAL;GIRO;DIRECCIÓN;TELÉFONO;CORREO;PROPIETARIO\nCafé ${tag};Restaurante;Av. Juárez 1;5551234;${email};José Núñez\n`, 'latin1')
    const batch = await upload(`canaco-${tag}.csv`, csv)
    assert.equal(batch.status, 'READY', batch.error)
    assert.equal(batch.source_type, 'BUSINESS_DIRECTORY')
    assert.equal((await request(app).post(`/api/imports/${batch.batch_id}/confirm`).set(auth(s.admin))).status, 200)
    const found = await request(app).get('/api/imports/directory').query({ q: `Café ${tag}` }).set(auth(s.admin))
    assert.equal(found.body.data[0].contacts[0].contact_name, 'José Núñez')

    const roleId = (await query("SELECT id FROM roles WHERE name = 'client'")).rows[0].id
    const user = await query(`INSERT INTO users (name, email, password_hash, role_id) VALUES ('Contact Person', $1, '!test', $2) RETURNING id`, [email, roleId])
    try {
      const exported = await request(app).get(`/api/users/${user.rows[0].id}/export`).set(auth(s.admin))
      assert.equal(exported.body.business_directory_contacts.length, 1)
      assert.equal((await request(app).post(`/api/users/${user.rows[0].id}/erase`).set(auth(s.admin))).status, 200)
      assert.equal((await query('SELECT COUNT(*)::int AS n FROM directory_contacts WHERE LOWER(email) = $1', [email])).rows[0].n, 0)
    } finally {
      await query('DELETE FROM users WHERE id = $1', [user.rows[0].id])
    }
  })

  it('rejects unusable files and removes canceled data', async () => {
    const bad = await upload(`broken-${tag}.xlsx`, Buffer.from('not a spreadsheet'))
    assert.equal(bad.status, 'FAILED')
    const noHeader = await upload(`plain-${tag}.csv`, Buffer.from('a,b\n1,2\n'))
    assert.equal(noHeader.status, 'FAILED')
    const wrongType = await request(app).post('/api/imports/preview').set(auth(s.admin)).attach('file', Buffer.from('x'), 'virus.exe')
    assert.equal(wrongType.status, 400)
    const ready = await upload(`cancel-${tag}.csv`, Buffer.from(`NOMBRE,CIUDAD\nCancel ${tag},Madrid\n`))
    assert.equal((await request(app).post(`/api/imports/${ready.batch_id}/cancel`).set(auth(s.admin))).status, 200)
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM import_staging WHERE batch_id = $1', [ready.batch_id])).rows[0].n, 0)
  })

  it('limits access to confidential records', async () => {
    assert.equal((await request(app).get('/api/imports').set(auth(s.manager))).status, 403)
    assert.equal((await request(app).post('/api/imports/preview').set(auth(s.manager))).status, 403)
    for (const who of ['hr', 'employee']) {
      assert.equal((await request(app).get('/api/imports/directory').set(auth(s[who]))).status, 403, who)
    }
    const partner = await loginAs('partner@gmail.com')
    assert.equal((await request(app).get('/api/imports/directory').set(auth(partner))).status, 403)
  })
})
