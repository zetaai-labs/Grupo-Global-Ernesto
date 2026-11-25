-- Single sign-on: bind each account to the identity provider's permanent subject on first sign-in,
-- so a later email change or reassignment at the provider cannot open someone else's account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_issuer TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_subject TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_linked_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_oidc_subject ON users(oidc_issuer, oidc_subject) WHERE oidc_subject IS NOT NULL;
