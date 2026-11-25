/**
 * PayPal Checkout (Orders v2) for one-off invoice payments.
 * Off until PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID are set.
 * PAYPAL_ENV=live uses real money; anything else uses the sandbox.
 */

const TIMEOUT_MS = 15000
let cachedToken = null

export const paypalConfigured = () => Boolean(
  process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim() && process.env.PAYPAL_WEBHOOK_ID?.trim(),
)
const base = () => (process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')

export function resetPaypalToken() {
  cachedToken = null
}

const failure = (message = 'PayPal could not be reached. Try again later.') => Object.assign(new Error(message), { status: 502 })

async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID.trim()}:${process.env.PAYPAL_CLIENT_SECRET.trim()}`).toString('base64')
  const response = await fetch(`${base()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json.access_token) throw failure()
  cachedToken = { value: json.access_token, expires: Date.now() + Number(json.expires_in || 300) * 1000 }
  return cachedToken.value
}

async function call(path, { method = 'POST', body, requestId } = {}) {
  const response = await fetch(`${base()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const json = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, json }
}

/** Creates an order for the exact invoice total. Returns { id, url } where url is PayPal's approval page. */
export async function createOrder({ invoice, returnUrl, cancelUrl, requestId }) {
  const { ok, json } = await call('/v2/checkout/orders', {
    requestId,
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: invoice.invoice_id,
        custom_id: invoice.invoice_id,
        invoice_id: invoice.invoice_number,
        description: `Invoice ${invoice.invoice_number}`,
        amount: { currency_code: 'EUR', value: Number(invoice.total_eur).toFixed(2) },
      }],
      application_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' },
    },
  })
  const approve = (json.links || []).find((link) => link.rel === 'approve' || link.rel === 'payer-action')
  if (!ok || !json.id || !approve?.href) throw failure()
  return { id: json.id, url: approve.href }
}

/** Captures an approved order. Returns { completed, invoiceId, amount, currency, captureId }. */
export async function captureOrder(orderId, requestId) {
  let { ok, json } = await call(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { requestId })
  if (!ok && json?.details?.some?.((detail) => detail.issue === 'ORDER_ALREADY_CAPTURED')) {
    ({ ok, json } = await call(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' }))
  }
  if (!ok) throw failure('The PayPal payment was not completed.')
  const unit = json.purchase_units?.[0]
  const capture = unit?.payments?.captures?.[0]
  return {
    completed: json.status === 'COMPLETED' && capture?.status === 'COMPLETED',
    invoiceId: unit?.custom_id || unit?.reference_id || null,
    amount: capture?.amount?.value ?? unit?.amount?.value ?? null,
    currency: capture?.amount?.currency_code ?? unit?.amount?.currency_code ?? null,
    captureId: capture?.id || null,
  }
}

/** Asks PayPal to confirm a webhook delivery is genuine. */
export async function verifyWebhook(headers, event) {
  const get = (name) => headers[name] || headers[name.toLowerCase()]
  const fields = {
    auth_algo: get('paypal-auth-algo'),
    cert_url: get('paypal-cert-url'),
    transmission_id: get('paypal-transmission-id'),
    transmission_sig: get('paypal-transmission-sig'),
    transmission_time: get('paypal-transmission-time'),
  }
  if (Object.values(fields).some((value) => !value)) return false
  try {
    const { ok, json } = await call('/v1/notifications/verify-webhook-signature', {
      body: { ...fields, webhook_id: process.env.PAYPAL_WEBHOOK_ID.trim(), webhook_event: event },
    })
    return ok && json.verification_status === 'SUCCESS'
  } catch {
    return false
  }
}
