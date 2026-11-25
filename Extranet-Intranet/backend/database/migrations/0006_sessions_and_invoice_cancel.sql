-- Raising session_version ends every session of that user (password change or reset, suspension, "sign out everywhere").
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- Issued but unpaid invoices can be cancelled; a corrective invoice records the cancellation.
ALTER TABLE zx_invoices DROP CONSTRAINT IF EXISTS zx_invoices_status_check;
ALTER TABLE zx_invoices ADD CONSTRAINT zx_invoices_status_check CHECK (status IN ('ISSUED', 'PAID', 'REFUNDED', 'CANCELLED'));
ALTER TABLE zx_invoices ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
