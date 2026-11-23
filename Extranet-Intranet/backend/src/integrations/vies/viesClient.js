/**
 * EU VAT number check through the European Commission's VIES REST service. No API key is needed.
 * Off unless VIES_ENABLED=true, because turning it on sends VAT numbers to the Commission.
 * Only the outcome is kept: the name and address VIES returns are deliberately not stored.
 */

const BASE_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api'
const TIMEOUT_MS = 8000
/** VIES answers that mean the check itself worked. Anything else is an outage or a rejected request. */
const COMPLETED = new Set(['VALID', 'INVALID'])

const EU_COUNTRIES = {
  AUT: 'AT', BEL: 'BE', BGR: 'BG', HRV: 'HR', CYP: 'CY', CZE: 'CZ', DNK: 'DK', EST: 'EE', FIN: 'FI',
  FRA: 'FR', DEU: 'DE', GRC: 'EL', HUN: 'HU', IRL: 'IE', ITA: 'IT', LVA: 'LV', LTU: 'LT', LUX: 'LU',
  MLT: 'MT', NLD: 'NL', POL: 'PL', PRT: 'PT', ROU: 'RO', SVK: 'SK', SVN: 'SI', ESP: 'ES', SWE: 'SE',
}

export const viesEnabled = () => process.env.VIES_ENABLED === 'true'
const endpoint = () => `${BASE_URL}/${process.env.VIES_USE_TEST_SERVICE === 'true' ? 'check-vat-test-service' : 'check-vat-number'}`

export function viesCountry(country) {
  return EU_COUNTRIES[String(country || '').trim().toUpperCase()] || null
}

/** Removes spaces, punctuation and the country prefix (Greek numbers may use GR or EL). */
export function viesNumber(countryCode, taxId) {
  const value = String(taxId || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const prefixes = countryCode === 'EL' ? ['EL', 'GR'] : [countryCode]
  const prefix = prefixes.find((item) => value.startsWith(item))
  return prefix ? value.slice(prefix.length) : value
}

/** @returns {{ status: 'OFF'|'NOT_APPLICABLE'|'VALID'|'INVALID'|'UNAVAILABLE', country_code?: string, checked_at?: string }} */
export async function checkVat(country, taxId) {
  if (!viesEnabled()) return { status: 'OFF' }
  const countryCode = viesCountry(country)
  if (!countryCode) return { status: 'NOT_APPLICABLE' }
  const vatNumber = viesNumber(countryCode, taxId)
  const checkedAt = new Date().toISOString()
  if (!/^[A-Z0-9]{2,14}$/.test(vatNumber)) return { status: 'INVALID', country_code: countryCode, checked_at: checkedAt }

  try {
    const response = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ countryCode, vatNumber }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return { status: 'UNAVAILABLE', country_code: countryCode, checked_at: checkedAt }
    const body = await response.json()
    const failed = body?.actionSucceed === false || (body?.userError && !COMPLETED.has(body.userError))
    if (failed || typeof body?.valid !== 'boolean') return { status: 'UNAVAILABLE', country_code: countryCode, checked_at: checkedAt }
    return { status: body.valid ? 'VALID' : 'INVALID', country_code: countryCode, checked_at: checkedAt }
  } catch {
    return { status: 'UNAVAILABLE', country_code: countryCode, checked_at: checkedAt }
  }
}
