import { query, withTransaction } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { orgPredicate } from '../services/scope.js'
import { cancelReaderAction, startTerminalPayment, terminalConfigured, terminalReaders } from '../integrations/payments/stripe.js'
import { httpError } from './rules.js'

/**
 * POS card terminals (Stripe Terminal). A cashier sends an issued POS invoice to a card reader;
 * Stripe confirms the payment by webhook and the invoice is marked paid there, never here.
 */

const TERMINAL_ROLES = ['admin', 'manager', 'employee', 'finance']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cashier(req) {
  if (!TERMINAL_ROLES.includes(req.user.role)) throw httpError(403, 'You cannot use the POS.')
  if (!terminalConfigured()) throw httpError(503, 'Card terminals are not configured yet.')
}

function readerFor(id) {
  const readers = terminalReaders()
  const reader = id ? readers.find((item) => item.id === id) : readers[0]
  if (!reader) throw httpError(400, 'Choose a card reader.')
  return reader
}

async function invoiceFor(req, db = { query }) {
  if (!UUID.test(req.params.id)) throw httpError(400, 'Invalid id.')
  const { rows } = await db.query(
    `SELECT * FROM zx_invoices WHERE invoice_id = $1 AND source = 'POS' AND ${orgPredicate('owner_org_id', '$2')}`,
    [req.params.id, req.user.org_scope ?? null],
  )
  if (!rows[0]) throw httpError(404, 'Invoice not found.')
  return rows[0]
}

export function listReaders(req, res) {
  if (!TERMINAL_ROLES.includes(req.user.role)) throw httpError(403, 'You cannot use the POS.')
  return res.json({ data: terminalConfigured() ? terminalReaders() : [], meta: { configured: terminalConfigured() } })
}

export async function startPayment(req, res) {
  cashier(req)
  const reader = readerFor(req.body?.reader_id)
  const invoice = await invoiceFor(req)
  if (invoice.kind !== 'STANDARD' || invoice.status !== 'ISSUED') throw httpError(409, 'Only issued invoices can be paid.')
  if (!(Number(invoice.total_eur) > 0)) throw httpError(409, 'This invoice has nothing to pay.')
  // One attempt per invoice and minute: a double tap does not charge twice.
  const idempotencyKey = `terminal-${invoice.invoice_id}-${Math.floor(Date.now() / 60000)}`
  const { paymentIntentId } = await startTerminalPayment({ invoice, readerId: reader.id, idempotencyKey })
  await query(
    `INSERT INTO payments (invoice_id, provider, provider_ref, status, amount_eur) VALUES ($1, 'STRIPE', $2, 'CREATED', $3)
     ON CONFLICT (provider, provider_ref) DO NOTHING`,
    [invoice.invoice_id, paymentIntentId, invoice.total_eur],
  )
  await writeAudit(req.user.sub, 'ZX_TERMINAL_PAYMENT_STARTED', 'zx_invoices', invoice.invoice_id, { reader: reader.label })
  return res.status(202).json({ data: { reader: reader.label, payment_intent: paymentIntentId }, message: 'Ask the customer to present their card.' })
}

/** The cashier screen polls this until the webhook has marked the invoice paid. */
export async function paymentStatus(req, res) {
  if (!TERMINAL_ROLES.includes(req.user.role)) throw httpError(403, 'You cannot use the POS.')
  const invoice = await invoiceFor(req)
  const last = await query(
    `SELECT status FROM payments WHERE invoice_id = $1 AND provider = 'STRIPE' ORDER BY created_at DESC LIMIT 1`,
    [invoice.invoice_id],
  )
  return res.json({ data: { invoice_status: invoice.status, payment_status: last.rows[0]?.status || null } })
}

export async function cancelPayment(req, res) {
  cashier(req)
  const reader = readerFor(req.body?.reader_id)
  const invoice = await invoiceFor(req)
  if (invoice.status === 'PAID') throw httpError(409, 'This invoice is already paid.')
  await cancelReaderAction(reader.id)
  await withTransaction(async (client) => {
    await client.query(`UPDATE payments SET status = 'FAILED', completed_at = now() WHERE invoice_id = $1 AND provider = 'STRIPE' AND status = 'CREATED'`, [invoice.invoice_id])
  })
  await writeAudit(req.user.sub, 'ZX_TERMINAL_PAYMENT_CANCELLED', 'zx_invoices', invoice.invoice_id)
  return res.json({ message: 'Card payment cancelled.' })
}
