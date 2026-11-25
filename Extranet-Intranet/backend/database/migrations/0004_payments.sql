-- Online payments (Stripe, PayPal) and subscription billing (Technical Spec §2: CRM & Finance).

CREATE TABLE IF NOT EXISTS billing_plans (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('MONTH', 'YEAR')),
  amount_eur NUMERIC(14,2) NOT NULL CHECK (amount_eur >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 21 CHECK (tax_rate BETWEEN 0 AND 100),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES billing_plans(plan_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELED')),
  current_period_start DATE NOT NULL,
  current_period_end DATE NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (current_period_end > current_period_start)
);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_org ON billing_subscriptions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_due ON billing_subscriptions(current_period_end) WHERE status <> 'CANCELED';
-- One live subscription per company and plan.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_subscriptions_live ON billing_subscriptions(org_id, plan_id) WHERE status <> 'CANCELED';

ALTER TABLE zx_invoices ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES billing_subscriptions(subscription_id) ON DELETE RESTRICT;
ALTER TABLE zx_invoices ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE zx_invoices ADD COLUMN IF NOT EXISTS due_date DATE;
-- A subscription is invoiced once per period.
CREATE UNIQUE INDEX IF NOT EXISTS uq_zx_invoices_subscription_period ON zx_invoices(subscription_id, period_start)
  WHERE subscription_id IS NOT NULL AND kind = 'STANDARD';

ALTER TABLE zx_invoices DROP CONSTRAINT IF EXISTS zx_invoices_source_check;
ALTER TABLE zx_invoices ADD CONSTRAINT zx_invoices_source_check CHECK (source IN ('POS', 'ORDER', 'SUBSCRIPTION'));
ALTER TABLE zx_invoices DROP CONSTRAINT IF EXISTS zx_invoices_payment_method_check;
ALTER TABLE zx_invoices ADD CONSTRAINT zx_invoices_payment_method_check CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER', 'PAYPAL'));

CREATE TABLE IF NOT EXISTS payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES zx_invoices(invoice_id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('STRIPE', 'PAYPAL')),
  provider_ref VARCHAR(255) NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'COMPLETED', 'FAILED', 'DUPLICATE')),
  amount_eur NUMERIC(14,2) NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_ref)
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- Webhook deliveries already processed, so a repeated event is never applied twice.
CREATE TABLE IF NOT EXISTS payment_events (
  event_row_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
