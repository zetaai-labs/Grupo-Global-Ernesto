import { z } from 'zod'
import { query } from '../config/database.js'
import { COMMERCIAL_MANAGE_ROLES } from '../config/roles.js'
import { writeAudit } from '../services/audit.js'
import { buildDocumentPdf, pdfLanguage } from '../services/document.service.js'
import { sendMail, smtpConfigured } from '../services/email.service.js'
import { orgPredicate } from '../services/scope.js'
import { httpError } from './rules.js'

/** PDF download and email of quotes and invoices. */

const isId = (value) => z.string().uuid().safeParse(value).success
const staffScope = (user) => (user.role === 'finance' ? null : user.org_scope ?? null)
const INVOICE_STAFF = ['admin', 'manager', 'finance', 'employee']
const INVOICE_SENDERS = ['admin', 'manager', 'finance']

async function seller() {
  const { rows } = await query(`SELECT legal_name, tax_id, country, billing_address FROM organizations WHERE org_type = 'PARENT' ORDER BY created_at LIMIT 1`)
  return { name: rows[0]?.legal_name, tax_id: rows[0]?.tax_id, country: rows[0]?.country, address: rows[0]?.billing_address || process.env.COMPANY_ADDRESS || null }
}

const QUOTE_SQL = `
  SELECT q.quote_id, q.quote_number, q.customer_org_id, q.valid_until::text AS valid_until, q.notes, q.net_eur, q.tax_eur, q.total_eur,
         q.created_at, q.created_by, q.status AS stored_status,
         CASE WHEN q.status = 'SENT' AND q.valid_until < CURRENT_DATE THEN 'EXPIRED' ELSE q.status END AS status,
         o.legal_name, o.tax_id, o.country, o.billing_address, c.full_name AS contact_name, c.email AS contact_email
  FROM zx_quotes q
  JOIN organizations o ON o.org_id = q.customer_org_id
  LEFT JOIN zx_contacts c ON c.contact_id = q.contact_id
`
const INVOICE_SQL = `
  SELECT i.*, o.legal_name, o.tax_id, o.country, o.billing_address, original.invoice_number AS corrects_number
  FROM zx_invoices i
  LEFT JOIN organizations o ON o.org_id = i.customer_org_id
  LEFT JOIN zx_invoices original ON original.invoice_id = i.corrects_invoice_id
`

async function staffQuote(req) {
  if (!isId(req.params.id)) throw httpError(400, 'Invalid id.')
  const { rows } = await query(`${QUOTE_SQL} WHERE q.quote_id = $1 AND ${orgPredicate('q.owner_org_id', '$2')}`, [req.params.id, staffScope(req.user)])
  if (!rows[0]) throw httpError(404, 'Quote not found.')
  return rows[0]
}

async function portalQuote(req) {
  if (!isId(req.params.id)) throw httpError(400, 'Invalid id.')
  const { rows } = await query(`${QUOTE_SQL} WHERE q.quote_id = $1 AND q.customer_org_id = $2 AND q.status <> 'DRAFT'`, [req.params.id, req.user.org_id])
  if (!rows[0]) throw httpError(404, 'Quote not found.')
  return rows[0]
}

async function staffInvoice(req) {
  if (!INVOICE_STAFF.includes(req.user.role)) throw httpError(403, 'No access to invoices.')
  if (!isId(req.params.id)) throw httpError(400, 'Invalid id.')
  const params = [req.params.id, staffScope(req.user)]
  let where = `i.invoice_id = $1 AND ${orgPredicate('i.owner_org_id', '$2')}`
  if (req.user.role === 'employee') {
    params.push(req.user.sub)
    where += ' AND i.created_by = $3'
  }
  const { rows } = await query(`${INVOICE_SQL} WHERE ${where}`, params)
  if (!rows[0]) throw httpError(404, 'Invoice not found.')
  return rows[0]
}

async function quotePdf(quote, lang) {
  const lines = (await query('SELECT sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur FROM zx_quote_lines WHERE quote_id = $1 ORDER BY name', [quote.quote_id])).rows
  return buildDocumentPdf({
    kind: 'QUOTE', number: quote.quote_number, status: quote.status, date: quote.created_at, valid_until: quote.valid_until,
    seller: await seller(), buyer: { name: quote.legal_name, tax_id: quote.tax_id, country: quote.country, address: quote.billing_address, contact: quote.contact_name },
    lines, net_eur: quote.net_eur, tax_eur: quote.tax_eur, total_eur: quote.total_eur, notes: quote.notes, lang,
  })
}

async function invoicePdf(invoice, lang) {
  const lines = (await query('SELECT sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur FROM zx_invoice_lines WHERE invoice_id = $1 ORDER BY name', [invoice.invoice_id])).rows
  const walkIn = invoice.customer_name || (pdfLanguage(lang) === 'es' ? 'Cliente de mostrador' : 'Walk-in customer')
  const buyer = invoice.buyer_snapshot || { name: invoice.legal_name || walkIn, tax_id: invoice.tax_id, country: invoice.country, address: invoice.billing_address }
  return buildDocumentPdf({
    kind: invoice.kind === 'CORRECTIVE' ? 'CORRECTIVE' : 'INVOICE', number: invoice.invoice_number, status: invoice.status, date: invoice.created_at, payment_method: invoice.payment_method,
    corrects_number: invoice.corrects_number, correction_reason: invoice.correction_reason,
    seller: invoice.seller_snapshot || await seller(), buyer: invoice.buyer_snapshot ? buyer : { ...buyer, name: buyer.name || walkIn },
    lines, net_eur: invoice.net_eur, tax_eur: invoice.tax_eur, total_eur: invoice.total_eur, lang,
  })
}

function sendPdf(res, buffer, number) {
  const safe = String(number).replace(/[^A-Za-z0-9-]/g, '_')
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${safe}.pdf"`,
    'Content-Length': String(buffer.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  return res.send(buffer)
}

export async function downloadQuote(req, res) {
  const quote = await staffQuote(req)
  const pdf = await quotePdf(quote, pdfLanguage(req.query.lang))
  await writeAudit(req.user.sub, 'ZX_QUOTE_PDF', 'zx_quotes', quote.quote_id)
  return sendPdf(res, pdf, quote.quote_number)
}

export async function portalDownloadQuote(req, res) {
  const quote = await portalQuote(req)
  const pdf = await quotePdf(quote, pdfLanguage(req.query.lang))
  await writeAudit(req.user.sub, 'ZX_QUOTE_PDF', 'zx_quotes', quote.quote_id)
  return sendPdf(res, pdf, quote.quote_number)
}

export async function downloadInvoice(req, res) {
  const invoice = await staffInvoice(req)
  const pdf = await invoicePdf(invoice, pdfLanguage(req.query.lang))
  await writeAudit(req.user.sub, 'ZX_INVOICE_PDF', 'zx_invoices', invoice.invoice_id)
  return sendPdf(res, pdf, invoice.invoice_number)
}

export async function portalDownloadInvoice(req, res) {
  if (!['client', 'partner'].includes(req.user.role)) throw httpError(403, 'No access to invoices.')
  if (!isId(req.params.id) || !req.user.org_id) throw httpError(404, 'Invoice not found.')
  const { rows } = await query(`${INVOICE_SQL} WHERE i.invoice_id = $1 AND i.customer_org_id = $2`, [req.params.id, req.user.org_id])
  if (!rows[0]) throw httpError(404, 'Invoice not found.')
  const pdf = await invoicePdf(rows[0], pdfLanguage(req.query.lang))
  await writeAudit(req.user.sub, 'ZX_INVOICE_PDF', 'zx_invoices', rows[0].invoice_id)
  return sendPdf(res, pdf, rows[0].invoice_number)
}

async function customerEmails(orgId) {
  const { rows } = await query(
    `SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.org_id = $1 AND u.status = 'active' AND r.name IN ('client', 'partner')`,
    [orgId],
  )
  return rows.map((row) => row.email)
}

const SUBJECTS = {
  es: { QUOTE: (n) => `Presupuesto ${n}`, INVOICE: (n) => `Factura ${n}`, CORRECTIVE: (n) => `Factura rectificativa ${n}`, body: (n) => `Adjuntamos el documento ${n}.\n\nUn saludo,\nGrupo Global` },
  en: { QUOTE: (n) => `Quote ${n}`, INVOICE: (n) => `Invoice ${n}`, CORRECTIVE: (n) => `Corrective invoice ${n}`, body: (n) => `Please find attached document ${n}.\n\nKind regards,\nGrupo Global` },
}

async function deliver(kind, number, recipients, pdf, lang) {
  if (!smtpConfigured()) throw httpError(503, 'Email is not configured yet (SMTP).')
  if (!recipients.length) throw httpError(409, 'This customer has no email address.')
  const text = SUBJECTS[lang]
  try {
    await sendMail({
      to: recipients.join(', '), subject: text[kind](number), text: text.body(number),
      attachments: [{ filename: `${number}.pdf`, content: pdf, contentType: 'application/pdf' }],
    })
  } catch {
    throw httpError(502, 'The email could not be sent.')
  }
}

export async function emailQuote(req, res) {
  const quote = await staffQuote(req)
  if (!COMMERCIAL_MANAGE_ROLES.includes(req.user.role) && quote.created_by !== req.user.sub) throw httpError(403, 'You can only send your own quotes.')
  if (quote.stored_status === 'DRAFT') throw httpError(409, 'Send the quote before emailing it.')
  if (!smtpConfigured()) throw httpError(503, 'Email is not configured yet (SMTP).')
  const lang = pdfLanguage(req.body?.lang)
  const recipients = quote.contact_email ? [quote.contact_email] : await customerEmails(quote.customer_org_id)
  await deliver('QUOTE', quote.quote_number, recipients, await quotePdf(quote, lang), lang)
  await writeAudit(req.user.sub, 'ZX_QUOTE_EMAILED', 'zx_quotes', quote.quote_id, { recipients: recipients.length })
  return res.json({ message: 'Email sent.' })
}

export async function emailInvoice(req, res) {
  if (!INVOICE_SENDERS.includes(req.user.role)) throw httpError(403, 'You cannot send invoices.')
  const invoice = await staffInvoice(req)
  if (!invoice.customer_org_id) throw httpError(409, 'This customer has no email address.')
  if (!smtpConfigured()) throw httpError(503, 'Email is not configured yet (SMTP).')
  const lang = pdfLanguage(req.body?.lang)
  const recipients = await customerEmails(invoice.customer_org_id)
  await deliver(invoice.kind === 'CORRECTIVE' ? 'CORRECTIVE' : 'INVOICE', invoice.invoice_number, recipients, await invoicePdf(invoice, lang), lang)
  await writeAudit(req.user.sub, 'ZX_INVOICE_EMAILED', 'zx_invoices', invoice.invoice_id, { recipients: recipients.length })
  return res.json({ message: 'Email sent.' })
}
