-- Privacy and data-protection acceptance (GDPR / LOPDGDD). Every user must accept the current policy
-- version before using the platform; registrations must accept it before they are sent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;

ALTER TABLE kyc_applications ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(32);
ALTER TABLE kyc_applications ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;

-- Every acceptance and withdrawal, kept as evidence of consent (who, which version, when, in which language).
CREATE TABLE IF NOT EXISTS privacy_consents (
  consent_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  application_id UUID REFERENCES kyc_applications(application_id) ON DELETE SET NULL,
  policy_version VARCHAR(32) NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('ACCEPTED', 'WITHDRAWN')),
  language       VARCHAR(8),
  ip_address     VARCHAR(64),
  user_agent     VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_privacy_consents_user ON privacy_consents (user_id, created_at DESC);
