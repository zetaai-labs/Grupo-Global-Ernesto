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

-- §4.5 projects_programs: joint ventures, initiatives, developments, deployments.
CREATE TABLE IF NOT EXISTS projects_programs (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  corridor VARCHAR(50) NOT NULL CHECK (corridor IN ('SPAIN_EU_INDIA', 'LATAM_EXPANSION', 'GCC_DUBAI', 'NORTH_AFRICA')),
  budget_eur NUMERIC(15, 2) NOT NULL CHECK (budget_eur >= 0),
  phase TEXT NOT NULL DEFAULT 'INITIATION' CHECK (phase IN ('INITIATION', 'PLANNING', 'EXECUTION', 'MONITORING', 'COMPLETED')),
  lead_entity UUID NOT NULL REFERENCES organizations(org_id),
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_title ON projects_programs (LOWER(title));

CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects_programs(project_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role TEXT NOT NULL DEFAULT 'MEMBER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_partners (
  project_id UUID NOT NULL REFERENCES projects_programs(project_id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, org_id)
);

CREATE TABLE IF NOT EXISTS project_milestones (
  milestone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects_programs(project_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'DONE', 'BLOCKED')),
  shared_with_partners BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id, due_date);

-- §4.4 investors_vault: isolated, separately encrypted investor records (Technical Spec §3.1).
CREATE TABLE IF NOT EXISTS investors_vault (
  investor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  encrypted_profile TEXT NOT NULL,
  investment_ticket_range VARCHAR(50) NOT NULL
    CHECK (investment_ticket_range IN ('EUR 100K-500K', 'EUR 500K-1M', 'EUR 1M-5M', 'EUR 5M+')),
  sector_focus VARCHAR(255) NOT NULL,
  nda_signed BOOLEAN NOT NULL DEFAULT false,
  access_audit_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_org ON investors_vault(org_id) WHERE org_id IS NOT NULL;

-- Tier-1 deal rooms with encrypted documents, opened to selected investors under NDA.
CREATE TABLE IF NOT EXISTS vault_deal_rooms (
  room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  sector VARCHAR(50) NOT NULL,
  ticket_range VARCHAR(50),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vault_room_access (
  room_id UUID NOT NULL REFERENCES vault_deal_rooms(room_id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors_vault(investor_id) ON DELETE CASCADE,
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, investor_id)
);

CREATE TABLE IF NOT EXISTS vault_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES vault_deal_rooms(room_id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §4.6 governance_compliance: Code of Ethics acknowledgements and contract linkage.
CREATE TABLE IF NOT EXISTS governance_compliance (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ethics_code_tier TEXT NOT NULL CHECK (ethics_code_tier IN ('TIER_1_BASIC', 'TIER_2_EXECUTIVE', 'TIER_3_CRITICAL_VAULT')),
  employment_contract_ref VARCHAR(128) NOT NULL,
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ethics_code_tier)
);

-- §5.2 Code of Ethics disciplinary regime (three escalating tiers).
CREATE TABLE IF NOT EXISTS governance_sanctions (
  sanction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier INT NOT NULL CHECK (tier IN (1, 2, 3)),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLEARED', 'PERMANENT')),
  remediation_due DATE,
  suspended_until DATE,
  issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cleared_at TIMESTAMPTZ,
  clearance_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sanctions_user ON governance_sanctions(user_id, issued_at DESC);

-- Technical Spec §1.2 Module 1: Community (activity feed and sector committees).
CREATE TABLE IF NOT EXISTS community_committees (
  committee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  sector VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_committee_members (
  committee_id UUID NOT NULL REFERENCES community_committees(committee_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (committee_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_posts (
  post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  committee_id UUID REFERENCES community_committees(committee_id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_posts ON community_posts(created_at DESC);

-- §4.7 community_events_courses: training modules, compliance webinars, corporate events.
CREATE TABLE IF NOT EXISTS community_events_courses (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_type TEXT NOT NULL CHECK (module_type IN ('EVENT', 'COMPLIANCE_COURSE', 'TECHNICAL_WORKSHOP')),
  title VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  access_tier VARCHAR(50) NOT NULL DEFAULT 'ALL_EMPLOYEES' CHECK (access_tier IN ('ALL_EMPLOYEES', 'DELEGATES_ONLY', 'EXECUTIVES')),
  lessons JSONB NOT NULL DEFAULT '[]'::jsonb,
  quiz JSONB NOT NULL DEFAULT '[]'::jsonb,
  pass_mark INT NOT NULL DEFAULT 70 CHECK (pass_mark BETWEEN 1 AND 100),
  starts_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Participation per user; certificate_hash is the SHA-256 of the completion certificate.
CREATE TABLE IF NOT EXISTS course_enrollments (
  item_id UUID NOT NULL REFERENCES community_events_courses(item_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ENROLLED' CHECK (status IN ('ENROLLED', 'FAILED', 'COMPLETED')),
  attempts INT NOT NULL DEFAULT 0,
  best_score INT,
  completed_at TIMESTAMPTZ,
  certificate_hash VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

-- Schema Document §2.1: logical data isolation between organisations and business units.
-- NULL org_id = group-wide (visible across Grupo Global, subject to role permissions).
ALTER TABLE folders ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_folders_org ON folders(org_id);
ALTER TABLE crm_relationships ADD COLUMN IF NOT EXISTS owner_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_owner_org ON crm_relationships(owner_org_id);

-- Technical Spec §3.1: Finance role (mandatory MFA).
INSERT INTO roles (name, description) VALUES ('finance', 'Finance Manager — budgets, revenue and financial oversight')
ON CONFLICT (name) DO NOTHING;
UPDATE roles SET code = 'ROLE_FINANCE_MGR', authority_level = '2' WHERE name = 'finance';

-- §5.2 Tier 1: mandatory re-completion of a compliance course.
ALTER TABLE governance_sanctions ADD COLUMN IF NOT EXISTS required_course_id UUID REFERENCES community_events_courses(item_id) ON DELETE SET NULL;
ALTER TABLE governance_sanctions ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ;

-- Technical Spec §3.2: GDPR ARCO rights (Access, Rectification, Cancellation, Opposition).
ALTER TABLE users ADD COLUMN IF NOT EXISTS processing_opposed BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS gdpr_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('RECTIFICATION', 'CANCELLATION', 'OPPOSITION')),
  field VARCHAR(50),
  requested_value VARCHAR(255),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  due_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gdpr_pending ON gdpr_requests(user_id, request_type) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_gdpr_status ON gdpr_requests(status, due_at);

-- =====================================================================
-- Business integrations (Technical Spec §1.2 module 3, §2.1, §2.3; Schema §2.4)
-- =====================================================================
CREATE TABLE IF NOT EXISTS membership_plans (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('MONTHLY', 'YEARLY')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  active BOOLEAN NOT NULL DEFAULT true,
  stripe_price_id VARCHAR(255),
  paypal_plan_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES membership_plans(plan_id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INCOMPLETE', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED')),
  provider TEXT NOT NULL DEFAULT 'MANUAL' CHECK (provider IN ('MANUAL', 'STRIPE', 'PAYPAL')),
  provider_ref VARCHAR(255),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_open_org ON subscriptions(org_id) WHERE status IN ('INCOMPLETE', 'TRIAL', 'ACTIVE', 'PAST_DUE');
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_provider_ref ON subscriptions(provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(32) NOT NULL UNIQUE,
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
  subscription_id UUID REFERENCES subscriptions(subscription_id) ON DELETE SET NULL,
  description VARCHAR(500) NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAID', 'VOID')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  provider TEXT NOT NULL DEFAULT 'MANUAL' CHECK (provider IN ('MANUAL', 'STRIPE', 'PAYPAL')),
  provider_ref VARCHAR(255),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id, issued_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_provider_ref ON invoices(provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS member_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason VARCHAR(255),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_org ON member_lifecycle_events(org_id, created_at DESC);

-- OIDC authorization codes (stored hashed, single use).
CREATE TABLE IF NOT EXISTS oidc_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash CHAR(64) NOT NULL UNIQUE,
  client_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge VARCHAR(128) NOT NULL,
  nonce VARCHAR(255),
  scope VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provisioning_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('GOOGLE', 'MICROSOFT')),
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'SUSPEND')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_email VARCHAR(255) NOT NULL,
  dry_run BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PLANNED', 'SUCCESS', 'FAILED')),
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Provider advice is kept apart from kyc_checks: it never advances or approves onboarding.
CREATE TABLE IF NOT EXISTS kyc_provider_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  sanctions TEXT NOT NULL CHECK (sanctions IN ('CLEAR', 'HIT')),
  pep TEXT NOT NULL CHECK (pep IN ('CLEAR', 'HIT')),
  adverse_media TEXT NOT NULL CHECK (adverse_media IN ('CLEAR', 'HIT')),
  matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_provider_org ON kyc_provider_screenings(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kyc_registry_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  registry VARCHAR(32) NOT NULL,
  lookup_value VARCHAR(64) NOT NULL,
  valid BOOLEAN,
  registered_name VARCHAR(255),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_registry_org ON kyc_registry_lookups(org_id, created_at DESC);

-- =====================================================================
-- Technical Spec §3.2: tamper-evident audit trail (SHA-256 hash chain).
-- The chain covers a hash of the original details and a pseudonymous actor reference,
-- so GDPR scrubbing (removing detail keys, nulling user_id) does not break verification.
-- =====================================================================
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS chain_seq BIGINT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash CHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entry_hash CHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details_hash CHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_ref CHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details_redacted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_chain_seq ON audit_logs(chain_seq);

CREATE TABLE IF NOT EXISTS audit_chain_head (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_seq BIGINT NOT NULL DEFAULT 0,
  last_hash CHAR(64) NOT NULL DEFAULT repeat('0', 64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO audit_chain_head (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Immutable-storage anchors: batches of the chain copied to S3 Object Lock (when configured).
CREATE TABLE IF NOT EXISTS audit_anchors (
  anchor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_seq BIGINT NOT NULL,
  to_seq BIGINT NOT NULL,
  head_hash CHAR(64) NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  retain_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION audit_sha256(value TEXT) RETURNS CHAR(64) LANGUAGE sql IMMUTABLE AS $fn$
  SELECT encode(sha256(convert_to(value, 'UTF8')), 'hex')::char(64)
$fn$;

CREATE OR REPLACE FUNCTION audit_entry_hash(
  p_prev TEXT, p_seq BIGINT, p_action TEXT, p_entity TEXT, p_entity_id TEXT,
  p_created_at TIMESTAMPTZ, p_actor_ref TEXT, p_details_hash TEXT
) RETURNS CHAR(64) LANGUAGE sql STABLE AS $fn$
  SELECT audit_sha256(jsonb_build_array(
    p_prev, p_seq, p_action, p_entity, p_entity_id,
    to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    p_actor_ref, p_details_hash
  )::text)
$fn$;

CREATE OR REPLACE FUNCTION audit_actor_ref(p_user_id INTEGER) RETURNS CHAR(64) LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p_user_id IS NULL THEN NULL ELSE audit_sha256('gg-audit-actor:' || p_user_id) END
$fn$;

CREATE OR REPLACE FUNCTION audit_chain_insert() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_seq BIGINT;
  v_hash CHAR(64);
BEGIN
  -- The row lock serialises writers, so the chain order always matches commit order.
  SELECT last_seq, last_hash INTO v_seq, v_hash FROM audit_chain_head WHERE id = 1 FOR UPDATE;
  NEW.chain_seq := v_seq + 1;
  NEW.prev_hash := v_hash;
  NEW.details_hash := audit_sha256(NEW.details::text);
  NEW.actor_ref := audit_actor_ref(NEW.user_id);
  NEW.details_redacted_at := NULL;
  NEW.entry_hash := audit_entry_hash(v_hash, NEW.chain_seq, NEW.action, NEW.entity, NEW.entity_id,
                                     NEW.created_at, NEW.actor_ref, NEW.details_hash);
  UPDATE audit_chain_head SET last_seq = NEW.chain_seq, last_hash = NEW.entry_hash, updated_at = now() WHERE id = 1;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION audit_chain_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_logs is append-only';
  END IF;
  -- Rows that have not joined the chain yet are being backfilled by the migration below.
  IF OLD.chain_seq IS NULL THEN
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.action, NEW.entity, NEW.entity_id, NEW.created_at, NEW.chain_seq, NEW.prev_hash,
      NEW.entry_hash, NEW.details_hash, NEW.actor_ref)
     IS DISTINCT FROM
     (OLD.id, OLD.action, OLD.entity, OLD.entity_id, OLD.created_at, OLD.chain_seq, OLD.prev_hash,
      OLD.entry_hash, OLD.details_hash, OLD.actor_ref) THEN
    RAISE EXCEPTION 'audit_logs is append-only';
  END IF;
  -- Allowed GDPR changes: unlink the user, or remove keys from details.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'audit_logs actor cannot be reassigned';
  END IF;
  IF NEW.details IS DISTINCT FROM OLD.details THEN
    IF NOT (OLD.details @> NEW.details) THEN
      RAISE EXCEPTION 'audit_logs details can only be redacted';
    END IF;
    NEW.details_redacted_at := now();
  ELSE
    NEW.details_redacted_at := OLD.details_redacted_at;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION audit_chain_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END
$fn$;

-- Existing rows join the chain once, in id order; the insert trigger takes over atomically.
DO $mig$
DECLARE
  rec RECORD;
  v_seq BIGINT;
  v_hash CHAR(64);
  v_details CHAR(64);
  v_actor CHAR(64);
  v_entry CHAR(64);
BEGIN
  LOCK TABLE audit_logs IN SHARE ROW EXCLUSIVE MODE;
  SELECT last_seq, last_hash INTO v_seq, v_hash FROM audit_chain_head WHERE id = 1 FOR UPDATE;
  FOR rec IN SELECT id, user_id, action, entity, entity_id, details, created_at
             FROM audit_logs WHERE chain_seq IS NULL ORDER BY id LOOP
    v_seq := v_seq + 1;
    v_details := audit_sha256(rec.details::text);
    v_actor := audit_actor_ref(rec.user_id);
    v_entry := audit_entry_hash(v_hash, v_seq, rec.action, rec.entity, rec.entity_id, rec.created_at, v_actor, v_details);
    UPDATE audit_logs SET chain_seq = v_seq, prev_hash = v_hash, entry_hash = v_entry,
           details_hash = v_details, actor_ref = v_actor
    WHERE id = rec.id;
    v_hash := v_entry;
  END LOOP;
  UPDATE audit_chain_head SET last_seq = v_seq, last_hash = v_hash, updated_at = now() WHERE id = 1;

  DROP TRIGGER IF EXISTS trg_audit_chain_insert ON audit_logs;
  CREATE TRIGGER trg_audit_chain_insert BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_chain_insert();
  DROP TRIGGER IF EXISTS trg_audit_chain_guard ON audit_logs;
  CREATE TRIGGER trg_audit_chain_guard BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_chain_guard();
  DROP TRIGGER IF EXISTS trg_audit_chain_no_truncate ON audit_logs;
  CREATE TRIGGER trg_audit_chain_no_truncate BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION audit_chain_no_truncate();
END
$mig$;

-- Technical Spec §3.1: WebAuthn security keys as a second factor.
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  webauthn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  name VARCHAR(100) NOT NULL DEFAULT 'Security key',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, purpose)
);

-- ZYLAX Wave 1: commercial core (Catalog, Contacts, Distributors, Quotes, Orders).
CREATE SEQUENCE IF NOT EXISTS zx_quote_seq;
CREATE SEQUENCE IF NOT EXISTS zx_order_seq;

CREATE TABLE IF NOT EXISTS zx_products (
  product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  unit_price_eur NUMERIC(14,2) NOT NULL CHECK (unit_price_eur >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 21 CHECK (tax_rate BETWEEN 0 AND 100),
  stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  owner_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_zx_products_sku ON zx_products (UPPER(sku));

CREATE TABLE IF NOT EXISTS zx_contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  job_title VARCHAR(150),
  active BOOLEAN NOT NULL DEFAULT true,
  owner_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zx_contacts_org ON zx_contacts(org_id);

CREATE TABLE IF NOT EXISTS zx_distributors (
  distributor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES organizations(org_id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'DISTRIBUTOR' CHECK (kind IN ('DISTRIBUTOR', 'FRANCHISE')),
  territory VARCHAR(50) NOT NULL,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 40),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  owner_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zx_quotes (
  quote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(32) NOT NULL UNIQUE,
  customer_org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
  contact_id UUID REFERENCES zx_contacts(contact_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED')),
  valid_until DATE NOT NULL,
  notes TEXT,
  net_eur NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_eur NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_eur NUMERIC(14,2) NOT NULL DEFAULT 0,
  owner_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zx_quotes_customer ON zx_quotes(customer_org_id, status);

CREATE TABLE IF NOT EXISTS zx_quote_lines (
  line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES zx_quotes(quote_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES zx_products(product_id) ON DELETE RESTRICT,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_eur NUMERIC(14,2) NOT NULL,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL,
  net_eur NUMERIC(14,2) NOT NULL,
  tax_eur NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_id, product_id)
);

CREATE TABLE IF NOT EXISTS zx_orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(32) NOT NULL UNIQUE,
  quote_id UUID NOT NULL UNIQUE REFERENCES zx_quotes(quote_id) ON DELETE RESTRICT,
  customer_org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'CONFIRMED'
    CHECK (status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  net_eur NUMERIC(14,2) NOT NULL,
  tax_eur NUMERIC(14,2) NOT NULL,
  total_eur NUMERIC(14,2) NOT NULL,
  owner_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zx_orders_customer ON zx_orders(customer_org_id, status);

CREATE TABLE IF NOT EXISTS zx_order_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES zx_orders(order_id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zx_order_events_order ON zx_order_events(order_id, created_at);

-- ZYLAX: shared record engine for the operational, extranet and sector modules.
CREATE SEQUENCE IF NOT EXISTS zx_record_seq;
ALTER TABLE zx_products ADD COLUMN IF NOT EXISTS specifications TEXT;

CREATE TABLE IF NOT EXISTS zx_records (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no VARCHAR(40) NOT NULL UNIQUE,
  module VARCHAR(40) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sealed_data TEXT,
  owner_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  customer_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zx_records_entity ON zx_records(module, entity, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zx_records_customer ON zx_records(customer_org_id);
CREATE INDEX IF NOT EXISTS idx_zx_records_assigned ON zx_records(assigned_to);
CREATE INDEX IF NOT EXISTS idx_zx_records_creator ON zx_records(created_by);
CREATE INDEX IF NOT EXISTS idx_zx_records_data ON zx_records USING GIN (data);

CREATE TABLE IF NOT EXISTS zx_record_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES zx_records(record_id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('created', 'updated', 'status', 'comment', 'file')),
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  body TEXT,
  internal BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zx_record_events_record ON zx_record_events(record_id, created_at);

CREATE TABLE IF NOT EXISTS zx_record_files (
  file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES zx_records(record_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type VARCHAR(150),
  size_bytes BIGINT NOT NULL DEFAULT 0,
  internal BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zx_record_files_record ON zx_record_files(record_id);

-- ZYLAX POS and billing. Invoice numbers come from a locked counter so they stay consecutive.
CREATE TABLE IF NOT EXISTS zx_counters (
  name VARCHAR(40) PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS zx_invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(32) NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('POS', 'ORDER')),
  order_id UUID UNIQUE REFERENCES zx_orders(order_id) ON DELETE RESTRICT,
  customer_org_id UUID REFERENCES organizations(org_id) ON DELETE RESTRICT,
  customer_name VARCHAR(255),
  status TEXT NOT NULL CHECK (status IN ('ISSUED', 'PAID', 'REFUNDED')),
  payment_method TEXT CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER')),
  net_eur NUMERIC(14,2) NOT NULL,
  tax_eur NUMERIC(14,2) NOT NULL,
  total_eur NUMERIC(14,2) NOT NULL,
  owner_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zx_invoices_customer ON zx_invoices(customer_org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS zx_invoice_lines (
  line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES zx_invoices(invoice_id) ON DELETE CASCADE,
  product_id UUID REFERENCES zx_products(product_id) ON DELETE RESTRICT,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_eur NUMERIC(14,2) NOT NULL,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL,
  net_eur NUMERIC(14,2) NOT NULL,
  tax_eur NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
