import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { config } from '../src/config/env.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })

describe('Investor Vault', { skip: !process.env.VAULT_ENCRYPTION_KEY && 'VAULT_ENCRYPTION_KEY not set' }, () => {
  it('encrypts profiles, gates deal rooms behind access + NDA, logs and reports intrusions', async () => {
    const admin = await loginAs('admin@gmail.com')
    const employee = await loginAs('employee@gmail.com')
    const stamp = Date.now()
    const orgName = `Vault Test Capital ${stamp}`
    const email = `vault-${stamp}@example.test`
    let orgId

    try {
      // A non-investor, non-admin attempt is denied and reported to the Super Admin.
      const intrusion = await request(app).get('/api/vault/investors').set(auth(employee))
      assert.equal(intrusion.status, 403)
      const alerts = await request(app).get('/api/notifications').set(auth(admin))
      assert.ok(alerts.body.data.some((n) => n.title.startsWith('Security alert: unauthorised Investor Vault')))

      // Temporary investor organisation + user.
      orgId = (await query(
        `INSERT INTO organizations (legal_name, tax_id, country, region_corridor, org_type, verification_status, onboarding_stage)
         VALUES ($1, 'DEMO-TEST', 'ARE', 'UAE_DUBAI', 'INVESTOR', 'VERIFIED', 5) RETURNING org_id`, [orgName],
      )).rows[0].org_id
      await query(
        `INSERT INTO users (name, email, password_hash, role_id, org_id, status)
         VALUES ('Vault Tester', $1, $2, (SELECT id FROM roles WHERE name = 'investor'), $3, 'active')`,
        [email, await bcrypt.hash(config.seedUserPassword, 4), orgId],
      )
      const investorUser = await loginAs(email)

      const created = await request(app).post('/api/vault/investors').set(auth(admin)).send({
        org_id: orgId, investment_ticket_range: 'EUR 1M-5M', sector_focus: ['FINTECH', 'REAL_ESTATE'],
        profile: { full_name: 'Layla Haddad', email: 'layla@example.test', iban: 'AE070331234567890123456' },
      })
      assert.equal(created.status, 201)
      const investorId = created.body.data.investor_id

      const stored = await query('SELECT encrypted_profile FROM investors_vault WHERE investor_id = $1', [investorId])
      assert.ok(stored.rows[0].encrypted_profile.startsWith('v1:'))
      assert.equal(stored.rows[0].encrypted_profile.includes('Layla'), false, 'no plaintext in the database')

      // Investors cannot use admin endpoints (reported as intrusion).
      assert.equal((await request(app).get('/api/vault/investors').set(auth(investorUser))).status, 403)

      // Deal room with a document, granted to the investor.
      const room = await request(app).post('/api/vault/rooms').set(auth(admin)).send({ title: `Test deal ${stamp}`, sector: 'FINTECH', ticket_range: 'EUR 1M-5M' })
      const roomId = room.body.data.room_id
      const doc = await request(app).post(`/api/vault/rooms/${roomId}/documents`).set(auth(admin))
        .attach('file', Buffer.from('%PDF-1.4 confidential term sheet'), 'term-sheet.pdf')
      assert.equal(doc.status, 201)
      assert.equal((await request(app).post(`/api/vault/rooms/${roomId}/access`).set(auth(admin)).send({ investor_id: investorId })).status, 201)

      const listed = await request(app).get('/api/vault/rooms').set(auth(investorUser))
      assert.ok(listed.body.data.some((r) => r.room_id === roomId))
      assert.equal(listed.body.meta.nda_signed, false)

      // Room stays closed until the NDA is signed.
      assert.equal((await request(app).get(`/api/vault/rooms/${roomId}`).set(auth(investorUser))).status, 403)
      await request(app).patch(`/api/vault/investors/${investorId}`).set(auth(admin)).send({ nda_signed: true })
      const opened = await request(app).get(`/api/vault/rooms/${roomId}`).set(auth(investorUser))
      assert.equal(opened.status, 200)
      const download = await request(app).get(`/api/vault/rooms/${roomId}/documents/${doc.body.data.document_id}/download`).set(auth(investorUser))
      assert.equal(download.status, 200)

      const mine = await request(app).get('/api/vault/me').set(auth(investorUser))
      assert.equal(mine.body.data.profile.full_name, 'Layla Haddad')

      const detail = await request(app).get(`/api/vault/investors/${investorId}`).set(auth(admin))
      const actions = detail.body.data.access_audit_log.map((entry) => entry.action)
      for (const action of ['CREATE_INVESTOR', 'OPEN_ROOM', 'DOWNLOAD_DOCUMENT', 'VIEW_OWN_PROFILE']) assert.ok(actions.includes(action), action)

      await query('DELETE FROM vault_deal_rooms WHERE room_id = $1', [roomId])
    } finally {
      await query('DELETE FROM users WHERE email = $1', [email])
      if (orgId) await query('DELETE FROM investors_vault WHERE org_id = $1', [orgId])
      if (orgId) await query('DELETE FROM organizations WHERE org_id = $1', [orgId])
      await query("DELETE FROM notifications WHERE title LIKE 'Security alert: unauthorised Investor Vault%' OR title LIKE 'New deal room: Test deal%'")
    }
  })
})
