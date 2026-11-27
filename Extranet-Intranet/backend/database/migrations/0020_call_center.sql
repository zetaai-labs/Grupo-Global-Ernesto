-- Call center (client, 26 Nov 2026): Grupo Global and Zeta run a joint call center from the platform,
-- with agents in India and other countries. Agents work through campaigns (who to call and the script),
-- record each call's outcome, and schedule callbacks; supervisors see everything live.
-- Phone calls themselves are made from the agent's phone for now; a telephony provider can be added later.

CREATE TABLE IF NOT EXISTS cc_agents (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team          VARCHAR(80) NOT NULL DEFAULT 'General',
  region        VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
  status        TEXT NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('AVAILABLE', 'ON_CALL', 'BREAK', 'OFFLINE')),
  status_since  TIMESTAMPTZ NOT NULL DEFAULT now(),
  active        BOOLEAN NOT NULL DEFAULT true,
  added_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cc_campaigns (
  campaign_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(150) NOT NULL,
  purpose      TEXT NOT NULL DEFAULT 'OTHER' CHECK (purpose IN ('MEMBERSHIP_SALES', 'MEMBER_SUPPORT', 'RECRUITMENT', 'SURVEY', 'OTHER')),
  direction    TEXT NOT NULL DEFAULT 'OUTBOUND' CHECK (direction IN ('OUTBOUND', 'INBOUND')),
  region       VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
  script       TEXT NOT NULL DEFAULT '' CHECK (char_length(script) <= 8000),
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED')),
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cc_contacts (
  contact_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES cc_campaigns(campaign_id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  company       VARCHAR(255),
  phone         VARCHAR(40),
  email         VARCHAR(255),
  country       VARCHAR(3),
  org_id        UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CALLBACK', 'DONE', 'DO_NOT_CALL')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_outcome  TEXT,
  next_call_at  TIMESTAMPTZ,
  -- Whoever is calling this contact right now (so two agents never call the same person).
  locked_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  locked_until  TIMESTAMPTZ,
  callback_for  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cc_contacts_queue ON cc_contacts (campaign_id, status, next_call_at);
CREATE INDEX IF NOT EXISTS idx_cc_contacts_callback ON cc_contacts (callback_for, next_call_at) WHERE status = 'CALLBACK';

CREATE TABLE IF NOT EXISTS cc_calls (
  call_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID NOT NULL REFERENCES cc_contacts(contact_id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES cc_campaigns(campaign_id) ON DELETE CASCADE,
  agent_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('OUTBOUND', 'INBOUND')),
  outcome       TEXT NOT NULL CHECK (outcome IN ('INTERESTED', 'SALE', 'RESOLVED', 'CALLBACK', 'NO_ANSWER', 'VOICEMAIL', 'NOT_INTERESTED', 'WRONG_NUMBER', 'DO_NOT_CALL')),
  duration_sec  INTEGER NOT NULL DEFAULT 0 CHECK (duration_sec BETWEEN 0 AND 14400),
  notes         TEXT CHECK (char_length(notes) <= 4000),
  callback_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cc_calls_agent_day ON cc_calls (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_calls_campaign ON cc_calls (campaign_id, created_at DESC);
