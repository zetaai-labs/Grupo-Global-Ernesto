-- Fleet GPS: positions a driver chooses to share from their phone (no background tracking).
-- Kept 90 days, then deleted by a scheduled job (GDPR data minimisation; drivers are informed on screen).
CREATE TABLE IF NOT EXISTS zx_vehicle_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES zx_records(record_id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lat NUMERIC(9, 6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng NUMERIC(9, 6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m INTEGER CHECK (accuracy_m BETWEEN 0 AND 100000),
  speed_kmh NUMERIC(6, 1),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle ON zx_vehicle_positions(vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_user ON zx_vehicle_positions(user_id);
