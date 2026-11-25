-- AI engine (Technical Spec §2.2): B2B matchmaking and predictive retention.
-- Sectors an organisation works in, chosen at onboarding or by Compliance; used by matchmaking.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sectors TEXT[] NOT NULL DEFAULT '{}';

-- Renewal (churn) risk per paying member. Every nightly run adds rows, so the history
-- (features + later outcome) can train a supervised model once enough renewals have happened.
CREATE TABLE IF NOT EXISTS member_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES billing_subscriptions(subscription_id) ON DELETE SET NULL,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  level TEXT NOT NULL CHECK (level IN ('LOW', 'MEDIUM', 'HIGH')),
  features JSONB NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_risk_org ON member_risk_scores(org_id, computed_at DESC);
