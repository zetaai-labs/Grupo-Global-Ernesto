import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../../../api/client'
import { clearSession } from '../../../../api/auth'
import { closeSharedSocket } from '../../../../api/socket'
import { dateLocale, useLanguage, useT } from '../../../../i18n'
import './Privacy.css'

/** Shows when the privacy policy was accepted, every past acceptance or withdrawal, and lets the person withdraw. */
function ConsentCard() {
  const t = useT()
  const language = useLanguage()
  const navigate = useNavigate()
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/auth/consent').then((response) => setHistory(response.data.data || [])).catch(() => setHistory([]))
  }, [])

  const withdraw = async () => {
    if (!window.confirm(t('Withdraw your acceptance? You will be signed out and cannot use the platform until you accept again.'))) return
    setBusy(true)
    try {
      await api.delete('/auth/consent', { data: { language } })
    } finally {
      clearSession()
      closeSharedSocket()
      navigate('/login?consent=withdrawn')
    }
  }

  const when = (value) => new Date(value).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="feature-panel consent-card">
      <h3 className="prv-title">{t('Privacy policy acceptance')}</h3>
      <p className="prv-muted">
        <Link to="/legal/privacy" target="_blank" rel="noopener">{t('Privacy policy')}</Link>
        {' · '}<Link to="/legal/terms" target="_blank" rel="noopener">{t('Terms of use')}</Link>
        {' · '}<Link to="/legal/cookies" target="_blank" rel="noopener">{t('Cookie policy')}</Link>
      </p>
      <ul>
        {history.map((row) => (
          <li key={`${row.created_at}-${row.action}`}>
            {t(row.action === 'ACCEPTED' ? 'Accepted version {version}' : 'Withdrawn (version {version})', { version: row.policy_version })} · {when(row.created_at)}
          </li>
        ))}
        {!history.length && <li className="prv-muted">{t('No record yet.')}</li>}
      </ul>
      <button type="button" className="consent-withdraw" onClick={withdraw} disabled={busy}>{t('Withdraw my acceptance')}</button>
    </div>
  )
}

export default ConsentCard
