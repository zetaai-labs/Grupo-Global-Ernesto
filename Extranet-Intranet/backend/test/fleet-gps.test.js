import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, loginAs } from './helpers.js'
import { query } from '../src/config/database.js'
import { purgeOldPositions } from '../src/zylax/fleet.controller.js'

const auth = (session) => ({ Authorization: `Bearer ${session.token}` })
let vehicleId

describe('fleet GPS', () => {
  after(async () => {
    if (vehicleId) await query('DELETE FROM zx_records WHERE record_id = $1', [vehicleId])
  })

  it('lets the driver and fleet managers share positions, and limits who sees the track', async () => {
    const [admin, employee, manager, hr, customer] = await Promise.all(['admin', 'employee', 'manager', 'hr', 'customer'].map((n) => loginAs(`${n}@gmail.com`)))
    const driverId = (await query("SELECT id FROM users WHERE email = 'employee@gmail.com'")).rows[0].id
    const created = await request(app).post('/api/zylax/hub/fleet/vehicles').set(auth(admin))
      .send({ title: `GPS van ${Date.now()}`, plate: `GPS-${Date.now() % 100000}`, kind: 'VAN', driver: driverId })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    vehicleId = created.body.data.record_id
    const path = `/api/zylax/hub/fleet/vehicles/${vehicleId}`

    assert.equal((await request(app).post(`${path}/position`).set(auth(employee)).send({ lat: 40.4168, lng: -3.7038, accuracy_m: 12 })).status, 201)
    assert.equal((await request(app).post(`${path}/position`).set(auth(manager)).send({ lat: 39.4699, lng: -0.3763 })).status, 201)
    assert.equal((await request(app).post(`${path}/position`).set(auth(hr)).send({ lat: 1, lng: 1 })).status, 403, 'not the driver nor a fleet manager')
    assert.equal((await request(app).post(`${path}/position`).set(auth(customer)).send({ lat: 1, lng: 1 })).status, 403)
    assert.equal((await request(app).post(`${path}/position`).set(auth(employee)).send({ lat: 95, lng: 0 })).status, 400)

    const all = await request(app).get(`${path}/positions`).set(auth(manager))
    assert.equal(all.body.data.length, 2)
    const own = await request(app).get(`${path}/positions`).set(auth(employee))
    assert.equal(own.body.data.length, 1, 'the driver sees only their own points')

    const vehicle = await request(app).get(path).set(auth(admin))
    assert.equal(vehicle.body.data.data.last_location, '39.46990, -0.37630')

    await query("UPDATE zx_vehicle_positions SET recorded_at = now() - interval '100 days' WHERE vehicle_id = $1", [vehicleId])
    assert.ok(await purgeOldPositions() >= 2)
    assert.equal((await query('SELECT 1 FROM zx_vehicle_positions WHERE vehicle_id = $1', [vehicleId])).rowCount, 0)
  })
})
