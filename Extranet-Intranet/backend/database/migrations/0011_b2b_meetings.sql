-- B2B matchmaking at events: registered participants request short 1:1 meetings with each other.
-- An accepted meeting gets a private video room (online) or a table number (in person).
CREATE TABLE IF NOT EXISTS b2b_meetings (
  meeting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES zx_records(record_id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 20 CHECK (slot_minutes BETWEEN 10 AND 60),
  mode TEXT NOT NULL CHECK (mode IN ('ONLINE', 'IN_PERSON')),
  table_label VARCHAR(40),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_b2b_event ON b2b_meetings(event_id, slot_start);
CREATE INDEX IF NOT EXISTS idx_b2b_people ON b2b_meetings(requester_id, recipient_id);
