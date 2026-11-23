-- Invoice compliance: billing addresses, frozen party details and corrective invoices.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_address TEXT;

ALTER TABLE zx_invoices ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE zx_invoices DROP CONSTRAINT IF EXISTS zx_invoices_kind_check;
ALTER TABLE zx_invoices ADD CONSTRAINT zx_invoices_kind_check CHECK (kind IN ('STANDARD', 'CORRECTIVE'));
ALTER TABLE zx_invoices ADD COLUMN IF NOT EXISTS corrects_invoice_id UUID REFERENCES zx_invoices(invoice_id) ON DELETE RESTRICT;
ALTER TABLE zx_invoices ADD COLUMN IF NOT EXISTS correction_reason TEXT;
ALTER TABLE zx_invoices ADD COLUMN IF NOT EXISTS seller_snapshot JSONB;
ALTER TABLE zx_invoices ADD COLUMN IF NOT EXISTS buyer_snapshot JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS uq_zx_invoices_corrects ON zx_invoices(corrects_invoice_id) WHERE corrects_invoice_id IS NOT NULL;

-- Corrective invoices carry negative quantities.
ALTER TABLE zx_invoice_lines DROP CONSTRAINT IF EXISTS zx_invoice_lines_qty_check;
ALTER TABLE zx_invoice_lines ADD CONSTRAINT zx_invoice_lines_qty_check CHECK (qty <> 0);
