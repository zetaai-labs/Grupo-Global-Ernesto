-- Directors, legal representatives and beneficial owners of an organisation (KYB, AML screening of people).
CREATE TABLE IF NOT EXISTS org_people (
  person_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  full_name VARCHAR(200) NOT NULL,
  person_role TEXT NOT NULL CHECK (person_role IN ('DIRECTOR', 'REPRESENTATIVE', 'BENEFICIAL_OWNER')),
  ownership_pct NUMERIC(5,2) CHECK (ownership_pct BETWEEN 0 AND 100),
  nationality CHAR(3),
  birth_year SMALLINT CHECK (birth_year BETWEEN 1900 AND 2100),
  last_screening JSONB,
  screened_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_people_org ON org_people(org_id);
