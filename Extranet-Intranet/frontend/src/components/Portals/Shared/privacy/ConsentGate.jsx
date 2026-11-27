import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../../../api/client'
import { clearSession, updateStoredUser } from '../../../../api/auth'
import { closeSharedSocket } from '../../../../api/socket'
import { useLanguage, useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { useCurrentUser } from '../profile/avatarStore'
import { CONSENT_EVENT } from './consentEvents'
import './Privacy.css'

/**
 * Blocks the workspace until the current privacy policy is accepted (the server refuses everything else
 * meanwhile). Declining signs the person out: nobody uses the platform without accepting it.
 */
function ConsentGate() {
  const t = useT()
  const language = useLanguage()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const [needed, setNeeded] = useState(Boolean(user?.privacy?.required))
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // The stored user can be old (policy changed since sign-in): ask the server once.
  const refresh = useCallback(async () => {
    try {
      const response = await api.get('/auth/me')
      const fresh = response.data?.data
      if (fresh?.privacy) {
        updateStoredUser({ privacy: fresh.privacy })
        setNeeded(Boolean(fresh.privacy.required))
      }
    } catch {
      // Signed out or offline: the API interceptor deals with it.
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const open = () => setNeeded(true)
    window.addEventListener(CONSENT_EVENT, open)
    return () => window.removeEventListener(CONSENT_EVENT, open)
  }, [])

  if (!needed) return null

  const accept = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await api.post('/auth/consent', { accept: true, language })
      updateStoredUser({ privacy: response.data.data.privacy })
      // Screens that were refused while waiting load again with the acceptance in place.
      window.location.reload()
    } catch (err) {
      setError(translateServer(err.response?.data?.message) || t('Your acceptance could not be recorded. Try again.'))
      setBusy(false)
    }
  }

  const decline = () => {
    api.post('/auth/logout').catch(() => {})
    clearSession()
    closeSharedSocket()
    navigate('/login?consent=declined')
  }

  return (
    <div className="consent-overlay">
      <section className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <span className="consent-icon" aria-hidden="true">🛡</span>
        <h2 id="consent-title">{t('Privacy and data protection')}</h2>
        <p>{t('Before using the platform, please read and accept how Grupo Global processes your personal data, in line with the GDPR and Spanish data protection law.')}</p>
        <ul className="consent-docs">
          <li><Link to="/legal/privacy" target="_blank" rel="noopener">{t('Privacy policy')}</Link></li>
          <li><Link to="/legal/terms" target="_blank" rel="noopener">{t('Terms of use')}</Link></li>
          <li><Link to="/legal/cookies" target="_blank" rel="noopener">{t('Cookie policy')}</Link></li>
        </ul>
        <label className="consent-check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <span>{t('I have read and accept the privacy policy, the terms of use and the cookie policy.')}</span>
        </label>
        <small className="consent-note">{t('You can read, download or withdraw this at any time from Privacy (GDPR) in your profile menu. Withdrawing signs you out until you accept again.')}</small>
        {error && <p className="consent-error" role="alert">{error}</p>}
        <div className="consent-actions">
          <button type="button" className="consent-decline" onClick={decline} disabled={busy}>{t('Decline and sign out')}</button>
          <button type="button" className="consent-accept" onClick={accept} disabled={!checked || busy}>{busy ? t('Recording…') : t('Accept and continue')}</button>
        </div>
      </section>
    </div>
  )
}

export default ConsentGate
