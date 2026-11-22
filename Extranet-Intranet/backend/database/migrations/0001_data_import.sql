-- Spreadsheet import: uploads are reviewed in staging before reaching the business directory.
-- A directory entry is not a user account or a KYC organization until staff promote it.

CREATE TABLE import_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  source_type TEXT CHECK (source_type IN ('ASSOCIATIONS', 'BUSINESS_DIRECTORY')),
  status TEXT NOT NULL DEFAULT 'PARSING' CHECK (status IN ('PARSING', 'READY', 'IMPORTED', 'CANCELED', 'FAILED')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  warning_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  unmapped_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);
CREATE INDEX idx_import_batches_created ON import_batches (created_at DESC);

CREATE TABLE import_staging (
  staging_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  sheet VARCHAR(128) NOT NULL,
  row_no INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  normalized JSONB NOT NULL,
  dedupe_key CHAR(64),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('VALID', 'WARNING', 'INVALID', 'DUPLICATE')),
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_staging_review ON import_staging (batch_id, validation_status, sheet, row_no);
CREATE INDEX idx_import_staging_key ON import_staging (batch_id, dedupe_key);

CREATE TABLE directory_organizations (
  directory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('ASSOCIATIONS', 'BUSINESS_DIRECTORY')),
  source_file VARCHAR(255) NOT NULL,
  dedupe_key CHAR(64) NOT NULL UNIQUE,
  registration_number VARCHAR(100),
  name VARCHAR(500) NOT NULL,
  commercial_name VARCHAR(500),
  tax_identifier VARCHAR(64),
  activity VARCHAR(500),
  registered_at DATE,
  constituted_at DATE,
  seat VARCHAR(255),
  address VARCHAR(500),
  postal_code VARCHAR(20),
  province VARCHAR(120),
  locality VARCHAR(160),
  website VARCHAR(500),
  batch_id UUID REFERENCES import_batches(batch_id) ON DELETE SET NULL,
  promoted_org_id UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_directory_name ON directory_organizations (LOWER(name) text_pattern_ops);
CREATE INDEX idx_directory_tax ON directory_organizations (UPPER(tax_identifier));
CREATE INDEX idx_directory_place ON directory_organizations (province, locality);

CREATE TABLE directory_contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directory_id UUID NOT NULL REFERENCES directory_organizations(directory_id) ON DELETE CASCADE,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(60),
  designation VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_directory_contacts_org ON directory_contacts (directory_id);
CREATE INDEX idx_directory_contacts_email ON directory_contacts (LOWER(email));
