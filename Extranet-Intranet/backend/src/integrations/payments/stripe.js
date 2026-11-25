import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Stripe Checkout for one-off invoice payments, through Stripe's REST API.
 * Off until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.
 */

const API = 'https://api.stripe.com/v1'
const TIMEOUT_MS = 15000
const SIGNATURE_TOLERANCE_SECONDS = 300

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim())

/** Flattens nested objects into Stripe's form encoding: line_items[0][price_data][currency]=eur. */
export function formEncode(value, prefix = '', params = new URLSearchParams()) {
  if (value === undefined || value === null) return params
  if (typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) formEncode(inner, prefix ? `${prefix}[${key}]` : key, params)
  } else {
    params.append(prefix, String(value))
  }
  return params
}

/** Creates a hosted Checkout page for an exact amount. Returns { id, url }. */
export async function createCheckoutSession({ invoice, successUrl, cancelUrl, idempotencyKey }) {
  const cents = Math.round(Number(invoice.total_eur) * 100)
  const body = formEncode({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: invoice.invoice_id,
    metadata: { invoice_id: invoice.invoice_id, invoice_number: invoice.invoice_number },
    payment_intent_data: { metadata: { invoice_id: invoice.invoice_id, invoice_number: invoice.invoice_number } },
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: cents, product_data: { name: `Invoice ${invoice.invoice_number}` } } }],
  })
  const response = await fetch(`${API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY.trim()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || typeof json.url !== 'string' || typeof json.id !== 'string') {
    throw Object.assign(new Error('The card payment page could not be opened. Try again later.'), { status: 502 })
  }
  return { id: json.id, url: json.url }
}

/** Verifies the Stripe-Signature header against the raw request body. Returns the parsed event or null. */
export function verifyWebhook(rawBody, header, now = Date.now()) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret || !rawBody || !header) return null
  const parts = String(header).split(',').map((part) => part.trim().split('='))
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1])
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!Number.isFinite(timestamp) || !signatures.length) return null
  if (Math.abs(now / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return null
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest()
  const valid = signatures.some((signature) => {
    const given = Buffer.from(signature, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!valid) return null
  try {
    return JSON.parse(rawBody)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- Stripe Terminal (POS card readers)
// Server-driven integration: the server sends the payment to a registered reader; the reader
// takes the card; the result arrives by webhook (payment_intent.succeeded / payment_failed).

/** Readers from STRIPE_TERMINAL_READERS: "tmr_abc:Front desk,tmr_def:Warehouse". */
export function terminalReaders() {
  return String(process.env.STRIPE_TERMINAL_READERS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, ...label] = entry.split(':')
      return { id: id.trim(), label: label.join(':').trim() || id.trim() }
    })
    .filter((reader) => /^tmr_[A-Za-z0-9]+$/.test(reader.id))
}

export const terminalConfigured = () => stripeConfigured() && terminalReaders().length > 0

async function stripePost(path, body, idempotencyKey) {
  const headers = { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY.trim()}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const response = await fetch(`${API}${path}`, { method: 'POST', headers, body: formEncode(body || {}), signal: AbortSignal.timeout(TIMEOUT_MS) })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = json?.error?.code
    const message = code === 'terminal_reader_offline' ? 'The card reader is offline.'
      : code === 'terminal_reader_busy' ? 'The card reader is busy with another payment.'
        : 'The card reader could not start the payment.'
    throw Object.assign(new Error(message), { status: 502 })
  }
  return json
}

/** Creates a card-present PaymentIntent for the invoice and sends it to the reader. */
export async function startTerminalPayment({ invoice, readerId, idempotencyKey }) {
  const intent = await stripePost('/payment_intents', {
    amount: Math.round(Number(invoice.total_eur) * 100),
    currency: 'eur',
    payment_method_types: ['card_present'],
    capture_method: 'automatic',
    description: `Invoice ${invoice.invoice_number}`,
    metadata: { invoice_id: invoice.invoice_id, invoice_number: invoice.invoice_number, channel: 'terminal' },
  }, idempotencyKey)
  if (typeof intent.id !== 'string') throw Object.assign(new Error('The card reader could not start the payment.'), { status: 502 })
  await stripePost(`/terminal/readers/${encodeURIComponent(readerId)}/process_payment_intent`, { payment_intent: intent.id })
  return { paymentIntentId: intent.id }
}

/** Stops whatever the reader is doing (the customer has not paid yet). */
export async function cancelReaderAction(readerId) {
  await stripePost(`/terminal/readers/${encodeURIComponent(readerId)}/cancel_action`, {})
}
