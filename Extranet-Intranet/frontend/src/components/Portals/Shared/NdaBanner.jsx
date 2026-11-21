import { useCallback, useEffect, useState } from 'react'
import api from '../../../api/client'
import { useT } from '../../../i18n'
import './NdaBanner.css'

/**
 * Shows the organisation's confidentiality agreement until it is accepted
 * (Schema Document §2.4 step 5: signed NDA issued on approval).
 */
function NdaBanner() {
  const t = useT()
  const [org, setOrg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await api.get('/organizations/me')
      setOrg(response.data?.data || null)
    } catch {
      setOrg(null)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const nda = org?.nda
  if (!nda || nda.accepted_at) return null

  const accept = async () => {
    setBusy(true)
    setError('')
    try {
      await api.post('/organizations/me/nda/accept')
      await load()
    } catch (err) {
      setError(err.response?.data?.message || t('Could not record your acceptance.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="nda-banner" role="region" aria-label={t('Confidentiality agreement (NDA)')}>
      <div>
        <strong>{t('Confidentiality agreement (NDA)')}</strong>
        <p>
          {t('{org} has been verified. Before working with shared information, accept the Grupo Global confidentiality agreement on behalf of your organisation.', { org: org.legal_name })}
        </p>
        <small className="nda-hash">{nda.nda_version} · SHA-256 {nda.document_hash}</small>
        {error && <small className="nda-error">{error}</small>}
      </div>
      <button type="button" onClick={accept} disabled={busy}>
        {busy ? t('Recording…') : t('I accept the NDA')}
      </button>
    </section>
  )
}

export default NdaBanner
