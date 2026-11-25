-- Profile photos: the stored file (encrypted like every upload) and when it last changed (cache key).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_file TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;
