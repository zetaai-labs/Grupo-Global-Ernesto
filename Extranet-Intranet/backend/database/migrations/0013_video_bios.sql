-- Video bios (Technical Spec §1.2 Module 1): a 3–4 minute presentation video per person,
-- uploaded straight to the streaming provider (Mux or Cloudflare Stream), transcribed
-- automatically and played through signed, expiring links.
CREATE TABLE IF NOT EXISTS video_bios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('mux', 'cloudflare')),
  upload_id TEXT,
  asset_id TEXT,
  playback_id TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING_UPLOAD' CHECK (status IN ('WAITING_UPLOAD', 'PROCESSING', 'READY', 'FAILED')),
  failure TEXT,
  language VARCHAR(5) NOT NULL DEFAULT 'es',
  duration_seconds NUMERIC(8, 2),
  transcript TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (transcript_status IN ('PENDING', 'READY', 'NONE')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_bios_upload ON video_bios(upload_id);
CREATE INDEX IF NOT EXISTS idx_video_bios_asset ON video_bios(asset_id);
