-- Global Group platform schema.
-- Applied with: npm run db:init

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS regions (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  region_id INTEGER REFERENCES regions(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metalinks (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  max_downloads INTEGER NOT NULL DEFAULT 10,
  downloads_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflows (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  portal TEXT NOT NULL DEFAULT 'intranet',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emails (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE folders ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE files ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE metalinks ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE metalinks ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'GLOBAL';

CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'GLOBAL',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linked_folders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, folder_id)
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  invitees TEXT,
  region TEXT NOT NULL DEFAULT 'GLOBAL',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS received_files (
  id SERIAL PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  region TEXT NOT NULL DEFAULT 'GLOBAL',
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_shares (
  id SERIAL PRIMARY KEY,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (folder_id, user_id)
);

CREATE TABLE IF NOT EXISTS folder_permissions (
  id SERIAL PRIMARY KEY,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role_name TEXT,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_share BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR role_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- AutoFlow approval engine.
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS decision_note TEXT;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Recycle bin ownership: who deleted each item.
ALTER TABLE folders ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_folders_deleted_at ON folders(deleted_at) WHERE deleted_at IS NOT NULL;

-- In-app notifications (bell icon), pushed live over Socket.IO.
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- Mailboxes: each row belongs to one user's Inbox or Sent folder.
ALTER TABLE emails ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_address TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_name TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS in_reply_to BIGINT REFERENCES emails(id) ON DELETE SET NULL;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'platform';
CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(user_id, folder, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_emails_imap_message ON emails(user_id, message_id) WHERE message_id IS NOT NULL;

-- AutoFlow multi-step approval chains.
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS template TEXT;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS workflow_steps (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approver_role TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order),
  CHECK (approver_id IS NOT NULL OR approver_role IS NOT NULL)
);

-- Older single-approver workflows become a one-step chain.
INSERT INTO workflow_steps (workflow_id, step_order, approver_id, approver_role, status, decided_by, decided_at, note)
SELECT w.id, 1, w.approver_id,
       CASE WHEN w.approver_id IS NULL THEN 'manager' END,
       CASE WHEN w.status IN ('approved', 'completed') THEN 'approved'
            WHEN w.status = 'rejected' THEN 'rejected' ELSE 'pending' END,
       w.decided_by, w.decided_at, w.decision_note
FROM workflows w
WHERE NOT EXISTS (SELECT 1 FROM workflow_steps s WHERE s.workflow_id = w.id);

-- Calendar invitations, reminders and online meeting rooms.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS video_room TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_video_room ON calendar_events(video_room) WHERE video_room IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response TEXT NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees(user_id);

-- Off-site (S3) copy of a backup, when enabled.
ALTER TABLE backups ADD COLUMN IF NOT EXISTS offsite_key TEXT;

-- =====================================================================
-- Schema Document (Nov 2026) — foundation / schema lock
-- =====================================================================

-- §4.1 organizations: legal entities, business units, partners, clients, vendors, investors.
CREATE TABLE IF NOT EXISTS organizations (
  org_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name VARCHAR(255) NOT NULL,
  pic_code VARCHAR(64),
  tax_id VARCHAR(64) NOT NULL,
  country VARCHAR(3) NOT NULL,
  region_corridor VARCHAR(50) NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
  onboarding_stage INT NOT NULL DEFAULT 1 CHECK (onboarding_stage BETWEEN 1 AND 5),
  org_type TEXT NOT NULL DEFAULT 'STRATEGIC_PARTNER'
    CHECK (org_type IN ('PARENT', 'BUSINESS_UNIT', 'CLIENT', 'STRATEGIC_PARTNER', 'DELEGATION_NODE', 'VENDOR', 'INVESTOR')),
  parent_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_legal_name ON organizations (LOWER(legal_name));

-- §4.2 users: public UUID, organisation link, video bio.
ALTER TABLE users ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_uuid ON users(uuid);
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS video_bio_url VARCHAR(512);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

-- §3 RBAC: document role codes and authority levels.
ALTER TABLE roles ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS authority_level TEXT;
INSERT INTO roles (name, description) VALUES
  ('tech_admin', 'Technical Administrator — infrastructure, security policy, integrations'),
  ('investor', 'Confidential Investor — isolated investor vault access')
ON CONFLICT (name) DO NOTHING;
UPDATE roles r SET code = v.code, authority_level = v.level
FROM (VALUES
  ('admin', 'ROLE_SUPER_ADMIN', '0'), ('tech_admin', 'ROLE_TECH_ADMIN', '1'), ('hr', 'ROLE_HR_MGR', '2'),
  ('manager', 'ROLE_EMPLOYEE_DELEGATE', '3'), ('employee', 'ROLE_EMPLOYEE_DELEGATE', '3'),
  ('partner', 'ROLE_CLIENT_PARTNER', '4'), ('client', 'ROLE_CLIENT_PARTNER', '4'),
  ('supplier', 'ROLE_CLIENT_PARTNER', '4'), ('investor', 'ROLE_INVESTOR_VAULT', '0-S')
) AS v(name, code, level)
WHERE r.name = v.name;

-- §2.2 corridors: EUROPE becomes SPAIN_EU (data migrated), plus the new corridors.
UPDATE regions SET code = 'SPAIN_EU', name = 'Spain / European Union'
WHERE code = 'EUROPE' AND NOT EXISTS (SELECT 1 FROM regions WHERE code = 'SPAIN_EU');
UPDATE folders SET region = 'SPAIN_EU' WHERE region = 'EUROPE';
UPDATE files SET region = 'SPAIN_EU' WHERE region = 'EUROPE';
UPDATE metalinks SET region = 'SPAIN_EU' WHERE region = 'EUROPE';
UPDATE workflows SET region = 'SPAIN_EU' WHERE region = 'EUROPE';
UPDATE emails SET region = 'SPAIN_EU' WHERE region = 'EUROPE';
UPDATE announcements SET region = 'SPAIN_EU' WHERE region = 'EUROPE';
UPDATE calendar_events SET region = 'SPAIN_EU' WHERE region = 'EUROPE';
UPDATE received_files SET region = 'SPAIN_EU' WHERE region = 'EUROPE';
INSERT INTO regions (code, name) VALUES
  ('GLOBAL', 'Global (all corridors)'), ('SPAIN_EU', 'Spain / European Union'), ('INDIA', 'India'),
  ('UAE_DUBAI', 'UAE / Dubai'), ('LATAM', 'Latin America'), ('USA_CAN', 'United States & Canada'),
  ('MOROCCO', 'Morocco')
ON CONFLICT (code) DO NOTHING;

-- §2.4 KYC / KYB onboarding (5 steps).
CREATE TABLE IF NOT EXISTS kyc_applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL UNIQUE,
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(64),
  submitted_at TIMESTAMPTZ,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kyc_application_org ON kyc_applications(org_id);

CREATE TABLE IF NOT EXISTS kyc_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('INCORPORATION_CERTIFICATE', 'LEGAL_REPRESENTATION', 'DIRECTOR_ID', 'OPERATING_LICENSE', 'OTHER')),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_org ON kyc_documents(org_id);

CREATE TABLE IF NOT EXISTS kyc_checks (
  check_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  check_type TEXT NOT NULL CHECK (check_type IN ('AUTO_VALIDATION', 'SANCTIONS', 'PEP', 'ADVERSE_MEDIA')),
  result TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL', 'CLEAR', 'HIT')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_checks_org ON kyc_checks(org_id, created_at DESC);

-- §2.4 step 5: NDA issued on approval (document hash), accepted by the organisation's user.
CREATE TABLE IF NOT EXISTS nda_records (
  nda_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  nda_version TEXT NOT NULL,
  document_hash CHAR(64) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  acceptance_hash CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nda_records_org ON nda_records(org_id);

-- §4.3 crm_relationships: business relationships and pipelines across corridors.
CREATE TABLE IF NOT EXISTS crm_relationships (
  rel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('CLIENT', 'STRATEGIC_PARTNER', 'DELEGATION_NODE', 'VENDOR')),
  confidentiality_level TEXT NOT NULL DEFAULT 'RESTRICTED'
    CHECK (confidentiality_level IN ('PUBLIC', 'INTERNAL', 'RESTRICTED', 'HIGHLY_CONFIDENTIAL')),
  assigned_manager INTEGER REFERENCES users(id) ON DELETE SET NULL,
  pipeline_stage VARCHAR(50) NOT NULL DEFAULT 'LEAD'
    CHECK (pipeline_stage IN ('LEAD', 'PROPOSAL', 'DUE_DILIGENCE', 'ACTIVE_CONTRACT', 'ARCHIVED')),
  title VARCHAR(255) NOT NULL,
  estimated_value_eur NUMERIC(15, 2),
  next_action_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_stage ON crm_relationships(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_crm_entity ON crm_relationships(entity_id);

CREATE TABLE IF NOT EXISTS crm_activities (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rel_id UUID NOT NULL REFERENCES crm_relationships(rel_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('NOTE', 'STAGE_CHANGE', 'ASSIGNMENT', 'SYSTEM')),
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_rel ON crm_activities(rel_id, created_at DESC);
