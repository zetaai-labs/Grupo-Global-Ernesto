import { useEffect, useState } from 'react'
import api from '../../../../api/client'
import { useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { getUser } from '../../../../api/auth'

const PROVIDERS = [['GOOGLE', 'Google Workspace', 'google'], ['MICROSOFT', 'Microsoft 365', 'microsoft']]

/** Onboarding plan: create the new employee's company account (Google Workspace / Microsoft 365). */
function OnboardingAccounts({ planId, onDone }) {
  const t = useT()
  const role = getUser()?.role
  const allowed = ['admin', 'hr', 'tech_admin'].includes(role)
  const [connected, setConnected] = useState({})
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (!allowed) return
    api.get('/zylax/hub/onboarding/accounts').then((response) => setConnected(response.data?.data || {})).catch(() => {})
  }, [allowed])

  if (!allowed) return null

  const create = async (provider, dryRun) => {
    setBusy(provider)
    setMessage('')
    setPassword(null)
    try {
      const response = await api.post(`/zylax/hub/onboarding/plans/${planId}/accounts`, { provider, dry_run: dryRun })
      setMessage(response.data?.message)
      if (response.data?.data?.temporary_password) setPassword({ email: response.data.data.job.target_email, value: response.data.data.temporary_password })
      onDone?.()
    } catch (error) {
      setMessage(error.response?.data?.message || 'The action could not be completed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="zx-fleet">
      <div className="zx-fleet-head"><strong>{t('Company accounts')}</strong></div>
      <small className="zx-fleet-note">{t('Creates the new employee’s company email account and ticks off the access task.')}</small>
      <div className="zx-form-actions">
        {PROVIDERS.map(([code, label, key]) => (
          <button key={code} type="button" className={connected[key] ? 'primary-action' : ''} disabled={Boolean(busy)} onClick={() => create(code, !connected[key])}>
            {busy === code ? t('Working…') : connected[key] ? t('Create {provider} account', { provider: label }) : t('{provider}: dry run (not connected yet)', { provider: label })}
          </button>
        ))}
      </div>
      {message && <p className="zx-fleet-message" role="status">{translateServer(message)}</p>}
      {password && (
        <p className="zx-fleet-message">
          <strong>{t('Temporary password for {email}', { email: password.email })}:</strong> <code className="zx-mono">{password.value}</code>
          <br /><small className="zx-fleet-note">{t('Shown only once. Hand it over in person; it must be changed at first sign-in.')}</small>
        </p>
      )}
    </section>
  )
}

export default OnboardingAccounts
