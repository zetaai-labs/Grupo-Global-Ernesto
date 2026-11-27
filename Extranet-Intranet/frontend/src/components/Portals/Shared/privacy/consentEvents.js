// The API answers 403 CONSENT_REQUIRED until the privacy policy is accepted; this lets any screen open the
// acceptance dialog (api/client.js raises it, ConsentGate listens).
export const CONSENT_EVENT = 'gg:consent-required'

export function requireConsent() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CONSENT_EVENT))
}

export const COOKIE_NOTICE_KEY = 'gg_cookie_notice'
