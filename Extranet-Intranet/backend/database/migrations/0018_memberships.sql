-- Paid membership for new member companies (client meeting, 26 Nov 2026): a survey at registration,
-- 1-, 2- and 3-year plans paid by Stripe or PayPal, and the revenue split between the two partners.

-- Membership terms longer than a year.
ALTER TABLE billing_plans DROP CONSTRAINT IF EXISTS billing_plans_billing_interval_check;
ALTER TABLE billing_plans ADD CONSTRAINT billing_plans_billing_interval_check
  CHECK (billing_interval IN ('MONTH', 'YEAR', 'YEARS_2', 'YEARS_3'));

-- Membership plans are offered on the public registration form; service plans are not.
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'SERVICE';
ALTER TABLE billing_plans DROP CONSTRAINT IF EXISTS billing_plans_category_check;
ALTER TABLE billing_plans ADD CONSTRAINT billing_plans_category_check CHECK (category IN ('SERVICE', 'MEMBERSHIP'));

-- Starting prices agreed in the meeting (EUR, before VAT). Finance can change them on the Billing page.
INSERT INTO billing_plans (code, name, description, billing_interval, amount_eur, tax_rate, category)
VALUES
  ('MEMBERSHIP_1Y', 'Membership: 1 year', 'Grupo Global platform membership for one year.', 'YEAR', 15000, 21, 'MEMBERSHIP'),
  ('MEMBERSHIP_2Y', 'Membership: 2 years', 'Grupo Global platform membership for two years.', 'YEARS_2', 30000, 21, 'MEMBERSHIP'),
  ('MEMBERSHIP_3Y', 'Membership: 3 years', 'Grupo Global platform membership for three years.', 'YEARS_3', 45000, 21, 'MEMBERSHIP')
ON CONFLICT (code) DO NOTHING;

-- What the applicant chose and answered at registration.
ALTER TABLE kyc_applications ADD COLUMN IF NOT EXISTS membership_track TEXT NOT NULL DEFAULT 'MEMBER';
ALTER TABLE kyc_applications DROP CONSTRAINT IF EXISTS kyc_applications_membership_track_check;
ALTER TABLE kyc_applications ADD CONSTRAINT kyc_applications_membership_track_check
  CHECK (membership_track IN ('MEMBER', 'EXISTING_PARTNER'));
ALTER TABLE kyc_applications ADD COLUMN IF NOT EXISTS membership_plan_id UUID REFERENCES billing_plans(plan_id) ON DELETE SET NULL;
ALTER TABLE kyc_applications ADD COLUMN IF NOT EXISTS survey JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Each partner's share of every paid membership invoice (and the reversal if it is refunded).
-- The percentages are copied at the time, so later changes to the split never rewrite history.
CREATE TABLE IF NOT EXISTS membership_revenue_shares (
  share_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES zx_invoices(invoice_id) ON DELETE RESTRICT,
  org_id      UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  party       VARCHAR(120) NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('SALE', 'REFUND')),
  share_pct   NUMERIC(5,2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  net_eur     NUMERIC(14,2) NOT NULL,
  amount_eur  NUMERIC(14,2) NOT NULL,
  booked_at   TIMESTAMPTZ NOT NULL, -- when the invoice was paid (or refunded): the date that counts for each partner
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, party, kind)
);
CREATE INDEX IF NOT EXISTS idx_membership_shares_booked ON membership_revenue_shares (booked_at);
