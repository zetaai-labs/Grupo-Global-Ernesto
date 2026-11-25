import { z } from 'zod'
import { query } from '../config/database.js'
import { STAFF_ROLES } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { orgPredicate } from '../services/scope.js'
import { httpError } from './rules.js'

/**
 * Fleet GPS. A driver shares the vehicle position from their phone with one tap; nothing runs in the
 * background. Fleet managers (admin, manager) see the track; a driver sees only points they sent.
 * Positions are deleted after POSITION_RETENTION_DAYS.
 */

export const POSITION_RETENTION_DAYS = 90
const FLEET_MANAGERS = ['admin', 'manager']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const positionSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  accuracy_m: z.coerce.number().min(0).max(100000).optional().nullable(),
  speed_kmh: z.coerce.number().min(0).max(400).optional().nullable(),
})

async function vehicleFor(req) {
  if (!STAFF_ROLES.includes(req.user.role)) throw httpError(403, 'Staff only.')
  if (!UUID.test(req.params.id)) throw httpError(400, 'Invalid id.')
  const { rows } = await query(
    `SELECT r.record_id, r.title, r.data FROM zx_records r
     WHERE r.module = 'fleet' AND r.entity = 'vehicles' AND r.record_id = $1 AND ${orgPredicate('r.owner_org_id', '$2')}`,
    [req.params.id, req.user.org_scope ?? null],
  )
  if (!rows[0]) throw httpError(404, 'Vehicle not found.')
  return rows[0]
}

/** The default driver, or the driver of a trip in progress with this vehicle. */
async function drivesVehicle(user, vehicle) {
  if (Number(vehicle.data?.driver) === user.sub) return true
  const { rowCount } = await query(
    `SELECT 1 FROM zx_records WHERE module = 'fleet' AND entity = 'trips' AND status IN ('PLANNED', 'IN_PROGRESS')
       AND data->>'vehicle' = $1 AND (data->>'driver')::int = $2 LIMIT 1`,
    [vehicle.record_id, user.sub],
  )
  return rowCount > 0
}

export async function reportPosition(req, res) {
  const vehicle = await vehicleFor(req)
  const manager = FLEET_MANAGERS.includes(req.user.role)
  if (!manager && !(await drivesVehicle(req.user, vehicle))) throw httpError(403, 'Only the driver or a fleet manager can report this vehicle’s position.')
  const parsed = positionSchema.safeParse(req.body || {})
  if (!parsed.success) throw httpError(400, 'Invalid position.')
  const p = parsed.data
  const { rows } = await query(
    `INSERT INTO zx_vehicle_positions (vehicle_id, user_id, lat, lng, accuracy_m, speed_kmh)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, lat, lng, accuracy_m, speed_kmh, recorded_at`,
    [vehicle.record_id, req.user.sub, p.lat.toFixed(6), p.lng.toFixed(6), p.accuracy_m == null ? null : Math.round(p.accuracy_m), p.speed_kmh ?? null],
  )
  const last = `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`
  await query(
    `UPDATE zx_records SET data = jsonb_set(data, '{last_location}', to_jsonb($2::text)), updated_at = now() WHERE record_id = $1`,
    [vehicle.record_id, last],
  )
  await writeAudit(req.user.sub, 'ZX_VEHICLE_POSITION', 'zx_records', vehicle.record_id)
  return res.status(201).json({ data: rows[0], message: 'Position shared.' })
}

export async function listPositions(req, res) {
  const vehicle = await vehicleFor(req)
  const manager = FLEET_MANAGERS.includes(req.user.role)
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 24 * POSITION_RETENTION_DAYS)
  const params = [vehicle.record_id, hours]
  let own = ''
  if (!manager) {
    params.push(req.user.sub)
    own = `AND p.user_id = $${params.length}`
  }
  const { rows } = await query(
    `SELECT p.id, p.lat, p.lng, p.accuracy_m, p.speed_kmh, p.recorded_at, u.name AS reported_by
     FROM zx_vehicle_positions p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.vehicle_id = $1 AND p.recorded_at >= now() - make_interval(hours => $2) ${own}
     ORDER BY p.recorded_at DESC LIMIT 500`,
    params,
  )
  return res.json({ data: rows, meta: { retention_days: POSITION_RETENTION_DAYS, can_see_all: manager } })
}

/** Scheduled: deletes positions older than the retention period. */
export async function purgeOldPositions(days = POSITION_RETENTION_DAYS) {
  const { rowCount } = await query('DELETE FROM zx_vehicle_positions WHERE recorded_at < now() - make_interval(days => $1)', [days])
  return rowCount
}
