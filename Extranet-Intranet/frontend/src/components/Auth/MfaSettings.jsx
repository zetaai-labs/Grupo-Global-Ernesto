import { useCallback, useEffect, useState } from 'react'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { saveSession } from '../../api/auth'
import './ResetPassword.css'
import ChangePassword from './ChangePassword'
import QRCode from 'qrcode'
import { useT, dateLocale } from '../../i18n'

function MfaSettings() {
  const t = useT()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setupRequired = searchParams.get('required') === '1'
  const [secret, setSecret] = useState('')
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState({ credentials: [], mfa_enabled: false, totp_enabled: false })
  const [keyName, setKeyName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const supportsKeys = browserSupportsWebAuthn()

  const load = useCallback(async () => {
    try {
      const response = await api.get('/auth/mfa/webauthn/credentials')
      setStatus(response.data.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load your security settings.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /** A session limited to MFA setup is replaced by a full one as soon as MFA is active. */
  const finishSetup = (data) => {
    if (!data?.token) return
    saveSession(data.token, data.user, Boolean(window.localStorage.getItem('gg_token')))
    const portal = window.location.pathname.startsWith('/extranet') ? 'extranet' : 'intranet'
    if (setupRequired) navigate(`/${portal}/overview`, { replace: true })
  }

  const setup = async () => {
    try {
      const response = await api.post('/auth/mfa/setup')
      setSecret(response.data?.data?.secret || '')
      const setupUri = response.data?.data?.uri || ''
      // Drawn in the browser: the secret never leaves this page.
      setQr(setupUri ? await QRCode.toDataURL(setupUri, { margin: 1, width: 200 }) : '')
      setNotice('')
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not start MFA setup.')
    }
  }

  const submit = async (path) => {
    try {
      const response = await api.post(path, { code })
      setNotice(response.data?.message || 'MFA updated.')
      setSecret('')
      setCode('')
      await load()
      if (path.includes('enable')) finishSetup(response.data?.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not update MFA.')
    }
  }

  const addKey = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const options = await api.post('/auth/mfa/webauthn/register/options', { password })
      const attestation = await startRegistration({ optionsJSON: options.data.data })
      const response = await api.post('/auth/mfa/webauthn/register/verify', { name: keyName, response: attestation })
      setNotice(response.data?.message || 'Security key added.')
      setKeyName('')
      setPassword('')
      setSecret('')
      await load()
      finishSetup(response.data?.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'The security key was not added.')
    } finally {
      setBusy(false)
    }
  }

  const removeKey = async (key) => {
    if (!password) {
      setNotice('Enter your password to remove a security key.')
      return
    }
    if (!window.confirm(`${t('Remove this security key?')} ${key.name}`)) return
    try {
      const response = await api.delete(`/auth/mfa/webauthn/credentials/${key.webauthn_id}`, { data: { password } })
      setNotice(response.data?.message || 'Security key removed.')
      setPassword('')
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not remove this security key.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('ADMINISTRATION')}</div>
          <h1>{t('Security')}</h1>
          <p>{t('Protect your account with an authenticator app or a hardware security key.')}</p>
        </div>
      </div>

      {setupRequired && <div className="cloud-notice" role="alert">{t('Your role requires multi-factor authentication. Set up a method to continue.')}</div>}
      {notice && <div className="cloud-notice" role="status">{t(notice)}</div>}

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>{t('Authenticator app')}</h3><p>{status.totp_enabled ? t('Active on this account.') : t('Use Google Authenticator, Microsoft Authenticator or any similar app on your phone.')}</p></div></div>
        <div className="reset-card" style={{ boxShadow: 'none', maxWidth: '100%' }}>
          {!status.mfa_enabled && !secret && <button type="button" className="primary-action" onClick={setup}>{t('Set up with QR code')}</button>}
          {status.mfa_enabled && !status.totp_enabled && <p>{t('Remove your security keys before switching to an authenticator app.')}</p>}
          {secret && (
            <div className="mfa-qr-setup">
              {qr && <img src={qr} alt={t('QR code for your authenticator app')} width={200} height={200} />}
              <ol>
                <li>{t('Install Google Authenticator or Microsoft Authenticator on your phone.')}</li>
                <li>{t('In the app, tap + and scan this QR code.')}</li>
                <li>{t('Type the 6-digit code the app shows, then press Enable.')}</li>
              </ol>
              <details>
                <summary>{t('Cannot scan? Enter the key by hand')}</summary>
                <code style={{ wordBreak: 'break-all' }}>{secret}</code>
              </details>
            </div>
          )}
          {(secret || status.totp_enabled) && (
            <>
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder={t('6-digit code')} maxLength={6} inputMode="numeric" autoComplete="one-time-code" aria-label={t('6-digit code')} />
              <div style={{ display: 'flex', gap: 8 }}>
                {secret && <button type="button" className="primary-action" disabled={code.length !== 6} onClick={() => submit('/auth/mfa/enable')}>{t('Enable')}</button>}
                {status.totp_enabled && <button type="button" className="secondary-action" onClick={() => submit('/auth/mfa/disable')}>{t('Disable MFA')}</button>}
              </div>
            </>
          )}
        </div>
      </div>

      <details className="feature-panel mfa-keys" open={status.credentials.length > 0}>
        <summary className="panel-heading"><div><h3>{t('Security keys (optional)')}</h3><p>{t('Use a FIDO2 key, or your device’s fingerprint or face sign-in. Register two keys in case you lose one.')}</p></div></summary>
        <div className="reset-card" style={{ boxShadow: 'none', maxWidth: '100%' }}>
          {status.credentials.map((key) => (
            <div key={key.webauthn_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span>
                <strong>{key.name}</strong>
                <br />
                <small>{key.last_used_at ? `${t('Last used')}: ${new Date(key.last_used_at).toLocaleString(dateLocale())}` : t('Not used yet')}</small>
              </span>
              <button type="button" className="secondary-action" onClick={() => removeKey(key)}>{t('Remove')}</button>
            </div>
          ))}
          {supportsKeys ? (
            <form onSubmit={addKey} style={{ display: 'grid', gap: 8 }}>
              <input value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder={t('Key name, for example Office YubiKey')} maxLength={100} aria-label={t('Security key name')} />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('Your current password')} autoComplete="current-password" aria-label={t('Your current password')} />
              <button type="submit" className="primary-action" disabled={busy || !password}>{busy ? t('Waiting for your key…') : t('Add security key')}</button>
            </form>
          ) : <p>{t('This browser does not support security keys.')}</p>}
        </div>
      </details>

      {!setupRequired && <ChangePassword />}
    </section>
  )
}

export default MfaSettings
