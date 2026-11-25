import { useEffect, useRef } from 'react'
import { useT } from '../../i18n'

/**
 * One-click sign-in with the seeded demo accounts. Loaded only in development or when
 * VITE_DEMO_LOGIN=true, so a normal production build does not contain this file.
 * Direct link: /login?as=<key>, for example /login?as=finance.
 */
const PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'Demo@12345'
const DEMO_ACCOUNTS = [
  ['admin', 'Super Admin', 'Intranet'],
  ['techadmin', 'Tech Admin', 'Intranet'],
  ['hr', 'HR', 'Intranet'],
  ['finance', 'Finance', 'Intranet'],
  ['manager', 'Manager', 'Intranet'],
  ['employee', 'Employee', 'Intranet'],
  ['partner', 'Partner', 'Extranet'],
  ['customer', 'Customer', 'Extranet'],
  ['supplier', 'Supplier', 'Extranet'],
  ['investor', 'Investor', 'Extranet'],
]

function DemoLogins({ onPick, disabled, requested }) {
  const t = useT()
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !requested) return
    if (DEMO_ACCOUNTS.some(([key]) => key === requested)) {
      started.current = true
      onPick(`${requested}@gmail.com`, PASSWORD)
    }
  }, [requested, onPick])

  return (
    <div className="login-demo" aria-label={t('Demo accounts')}>
      <p>{t('Demo accounts: one click to sign in')}</p>
      <div>
        {DEMO_ACCOUNTS.map(([key, label, portal]) => (
          <button key={key} type="button" disabled={disabled} onClick={() => onPick(`${key}@gmail.com`, PASSWORD)} title={`${key}@gmail.com`}>
            <strong>{t(label)}</strong>
            <small>{t(portal)}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

export default DemoLogins
