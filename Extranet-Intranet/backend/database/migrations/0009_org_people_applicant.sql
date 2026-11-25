-- Applicants can declare their own directors, representatives and beneficial owners during onboarding.
-- added_by_applicant marks those rows; erased_at records GDPR erasure (the row is kept, anonymised,
-- so the KYC file still shows that a person was declared).
ALTER TABLE org_people ADD COLUMN IF NOT EXISTS added_by_applicant BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE org_people ADD COLUMN IF NOT EXISTS erased_at TIMESTAMPTZ;
