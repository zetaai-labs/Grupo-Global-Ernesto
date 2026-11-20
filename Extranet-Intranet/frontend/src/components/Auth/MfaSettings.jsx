import { useState } from 'react'
import api from '../../api/client'
import './ResetPassword.css'
import { useT } from '../../i18n'

function MfaSettings() {
  const t = useT()
  const [secret, setSecret] = useState('')
  const [uri, setUri] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')

  const setup = async () => {
    try {
      const response = await api.post('/auth/mfa/setup')
      setSecret(response.data?.data?.secret || '')
      setUri(response.data?.data?.uri || '')
      setNotice('Scan the URI in your authenticator, then enter a code to enable.')
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not start MFA setup.')
    }
  }

  const submit = async (path) => {
    try {
      const response = await api.post(path, { code })
      setNotice(response.data?.message || 'MFA updated.')
      if (path.includes('disable')) {
        setSecret('')
        setUri('')
      }
      setCode('')
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not update MFA.')
    }
  }

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('ADMINISTRATION')}</div>
          <h1>{t('Security')}</h1>
          <p>{t('Protect your account with time-based one-time passwords.')}</p>
        </div>
      </div>

      {notice && <div className="cloud-notice">{notice}</div>}

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>Multi-factor authentication</h3><p>Use any TOTP authenticator app.</p></div></div>
        <div className="reset-card" style={{ boxShadow: 'none', maxWidth: '100%' }}>
          {!secret && <button type="button" className="primary-action" onClick={setup}>Set up MFA</button>}
          {secret && (
            <>
              <p><strong>Secret:</strong> {secret}</p>
              <p style={{ wordBreak: 'break-all' }}><strong>Setup URI:</strong> {uri}</p>
            </>
          )}
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" maxLength={6} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="primary-action" onClick={() => submit('/auth/mfa/enable')}>Enable MFA</button>
            <button type="button" className="secondary-action" onClick={() => submit('/auth/mfa/disable')}>Disable MFA</button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default MfaSettings
