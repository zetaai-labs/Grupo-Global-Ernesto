import { useState } from 'react'
import { useT } from '../../../../i18n'
import { COOKIE_NOTICE_KEY } from './consentEvents'
import './Privacy.css'

function readChoice() {
  try {
    return window.localStorage.getItem(COOKIE_NOTICE_KEY)
  } catch {
    return null
  }
}

/**
 * The platform sets only essential cookies and storage (sign-in, language, theme, offline app), so the
 * notice informs rather than asks; there is nothing optional to switch off.
 * Rendered next to the router (on every page), so it uses a plain link.
 */
function CookieNotice() {
  const t = useT()
  const [seen, setSeen] = useState(() => Boolean(readChoice()) || window.location.pathname.startsWith('/legal/'))
  if (seen) return null

  const close = () => {
    try {
      window.localStorage.setItem(COOKIE_NOTICE_KEY, new Date().toISOString())
    } catch {
      // Private mode: the notice simply shows again next time.
    }
    setSeen(true)
  }

  return (
    <aside className="cookie-notice" role="region" aria-label={t('Cookies')}>
      <p>
        <strong>{t('Cookies')}</strong>{' '}
        {t('We use only the essential cookies and storage the platform needs to work: keeping you signed in, your language and theme. No advertising or tracking.')}{' '}
        <a href="/legal/cookies">{t('Cookie policy')}</a>
      </p>
      <button type="button" onClick={close}>{t('Understood')}</button>
    </aside>
  )
}

export default CookieNotice
