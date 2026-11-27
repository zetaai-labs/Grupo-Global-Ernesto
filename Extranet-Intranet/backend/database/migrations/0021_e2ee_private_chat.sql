-- End-to-end encrypted private chat (Technical Document, Module 1).
-- Each person has a key pair made in their browser. The private key is locked with their passphrase in the
-- browser before it is stored here, so the server never sees it, and messages arrive already encrypted.
-- Old keys are kept (retired) so the other person can still read earlier messages after a passphrase reset.

CREATE TABLE IF NOT EXISTS e2ee_keys (
  key_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_jwk      JSONB NOT NULL,
  wrapped_private TEXT NOT NULL CHECK (char_length(wrapped_private) <= 4000),
  kdf_salt        VARCHAR(64) NOT NULL,
  kdf_iterations  INTEGER NOT NULL CHECK (kdf_iterations >= 210000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_e2ee_keys_current ON e2ee_keys (user_id) WHERE retired_at IS NULL;

-- A private conversation is between exactly two people and is listed in both portals.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS e2ee BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
