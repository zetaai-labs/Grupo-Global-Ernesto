import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import { useT, dateLocale } from '../../../../../i18n'
import './Ethics.css'
import { translateServer } from '../../../../../i18n/serverMessages'
import { roleLabel } from '../../../../../utils/roles'

const TIER_LABELS = {
  TIER_1_BASIC: 'Tier 1 — Basic',
  TIER_2_EXECUTIVE: 'Tier 2 — Executive',
  TIER_3_CRITICAL_VAULT: 'Tier 3 — Critical / Vault',
}
const SANCTION_LABELS = { 1: 'Tier 1 — Formative warning', 2: 'Tier 2 — Temporary suspension', 3: 'Tier 3 — Permanent expulsion' }
const EMPTY = { user_id: '', tier: '1', suspension_days: '14', reason: '' }

function Ethics() {
  const t = useT()
  const user = getUser()
  const portal = useLocation().pathname.startsWith('/extranet') ? 'extranet' : 'intranet'
  const isOfficer = ['admin', 'hr'].includes(user?.role)
  const isSuperAdmin = user?.role === 'admin'

  const [mine, setMine] = useState(null)
  const [registerData, setRegisterData] = useState({ people: [], sanctions: [] })
  const [form, setForm] = useState(EMPTY)
  const [accepted, setAccepted] = useState(false)
  const [clearNotes, setClearNotes] = useState({})
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      setMine((await api.get('/governance/me')).data?.data)
      if (isOfficer) setRegisterData((await api.get('/governance/register')).data?.data || { people: [], sanctions: [] })
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load compliance data.')
    }
  }, [isOfficer])

  useEffect(() => {
    load()
  }, [load])

  const call = async (request) => {
    try {
      const response = await request()
      setNotice(response.data?.message || t('Saved.'))
      await load()
      return true
    } catch (error) {
      setNotice(error.response?.data?.message || 'The action could not be completed.')
      return false
    }
  }

  const issue = async (event) => {
    event.preventDefault()
    const tier = Number(form.tier)
    if (tier === 3 && !window.confirm(t('Permanently expel this user? Credentials are revoked and this cannot be undone.'))) return
    const ok = await call(() => api.post('/governance/sanctions', {
      user_id: Number(form.user_id),
      tier,
      reason: form.reason,
      suspension_days: tier === 2 ? Number(form.suspension_days) : undefined,
    }))
    if (ok) setForm(EMPTY)
  }

  const compliantCount = registerData.people.filter((person) => person.compliant).length
  const activeSanctions = registerData.sanctions.filter((sanction) => sanction.status === 'ACTIVE').length

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('GOVERNANCE')}</div>
          <h1>{t('Ethics & Compliance')}</h1>
          <p>{t('Platform access is conditioned on the corporate Code of Ethics, with a three-tier disciplinary regime.')}</p>
        </div>
      </div>

      {notice && <div className="cloud-notice eth-notice" role="status"><span>{translateServer(notice)}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss">✕</button></div>}

      <div className="eth-grid">
        <div className="feature-panel eth-code">
          <h3>{t('Code of Ethics')} <small className="mono">{mine?.code_version}</small></h3>
          <ul>
            <li>{t('Protect confidential information and share documents only through authorised channels.')}</li>
            <li>{t('Never attempt to access data, vaults or accounts outside your role.')}</li>
            <li>{t('Act with integrity with colleagues, partners, clients and investors across all delegations.')}</li>
            <li>{t('Report breaches and suspicious activity immediately to HR or the Compliance Office.')}</li>
          </ul>
          {mine?.acknowledged ? (
            <div className="eth-signed">
              <strong>✓ {t('Signed')} · {t(TIER_LABELS[mine.required_tier])}</strong>
              {mine.records.filter((record) => record.ethics_code_tier === mine.required_tier).map((record) => (
                <small key={record.record_id} className="mono">{new Date(record.audit_timestamp).toLocaleString(dateLocale())} · {record.employment_contract_ref}</small>
              ))}
            </div>
          ) : mine && (
            <div className="eth-sign">
              <label><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> {t('I have read and accept the Code of Ethics ({tier}).', { tier: t(TIER_LABELS[mine.required_tier]) })}</label>
              <button type="button" className="primary-action" disabled={!accepted} onClick={() => call(() => api.post('/governance/acknowledge', { accept: true }))}>{t('Sign the Code')}</button>
            </div>
          )}
        </div>

        <div className="feature-panel eth-regime">
          <h3>{t('Disciplinary regime')}</h3>
          <dl>
            <div><dt>{t('Tier 1 — Formative warning')}</dt><dd>{t('Minor non-compliance. Compliance course must be completed within 5 business days. Account stays active.')}</dd></div>
            <div><dt>{t('Tier 2 — Temporary suspension')}</dt><dd>{t('Repeat infractions or unauthorised sharing. Suspended 14–30 days; HR clearance required to return.')}</dd></div>
            <div><dt>{t('Tier 3 — Permanent expulsion')}</dt><dd>{t('Severe breaches, vault intrusion, IP theft. Credentials revoked, organisation isolated, legal action.')}</dd></div>
          </dl>
          {mine?.sanctions?.length > 0 && (
            <>
              <h3>{t('Your record')}</h3>
              <ul className="eth-list">
                {mine.sanctions.map((sanction) => (
                  <li key={sanction.sanction_id}><strong>{t(SANCTION_LABELS[sanction.tier])}</strong><span>{sanction.reason}</span>
                    <small>{sanction.status}{sanction.remediation_due ? ` · ${t('due')} ${sanction.remediation_due.slice(0, 10)}` : ''}</small>
                    {sanction.status === 'ACTIVE' && sanction.required_course && <Link to={`/${portal}/courses`}>{t('Complete required course')}: {sanction.required_course}</Link>}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {isOfficer && (
        <>
          <div className="feature-stats">
            <div className="stat-card"><div className="stat-top"><span>{t('Code signed')}</span><span className="stat-icon">✍</span></div><strong>{compliantCount}/{registerData.people.length}</strong><small>{t('People compliant')}</small></div>
            <div className="stat-card"><div className="stat-top"><span>{t('Active sanctions')}</span><span className="stat-icon">⚠</span></div><strong>{activeSanctions}</strong><small>{t('Awaiting remediation or clearance')}</small></div>
          </div>

          <form className="feature-panel eth-form" onSubmit={issue}>
            <h3>{t('Issue a sanction')}</h3>
            <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required aria-label={t('User')}>
              <option value="">{t('Choose user…')}</option>
              {registerData.people.filter((person) => person.role !== 'admin' && person.id !== user?.id && person.status !== 'expelled').map((person) => <option key={person.id} value={person.id}>{person.name} ({t(roleLabel(person.role))})</option>)}
            </select>
            <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} aria-label={t('Tier')}>
              <option value="1">{t(SANCTION_LABELS[1])}</option>
              <option value="2">{t(SANCTION_LABELS[2])}</option>
              {isSuperAdmin && <option value="3">{t(SANCTION_LABELS[3])}</option>}
            </select>
            {form.tier === '2' && (
              <label className="eth-days">{t('Suspension days (14–30)')}
                <input type="number" min="14" max="30" value={form.suspension_days} onChange={(e) => setForm({ ...form, suspension_days: e.target.value })} required />
              </label>
            )}
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={t('Reason (at least 10 characters)')} minLength={10} rows="2" required />
            <button type="submit" className="primary-action">{t('Record sanction')}</button>
          </form>

          <div className="feature-panel">
            <div className="panel-heading"><div><h3>{t('Sanctions register')}</h3></div></div>
            {registerData.sanctions.length ? (
              <ul className="eth-list">
                {registerData.sanctions.map((sanction) => (
                  <li key={sanction.sanction_id} className={`eth-sanction eth-t${sanction.tier}`}>
                    <strong>{sanction.user_name} · {t(SANCTION_LABELS[sanction.tier])}</strong>
                    <span>{sanction.reason}</span>
                    <small>
                      {sanction.status} · {t('issued by')} {sanction.issued_by_name} · {new Date(sanction.issued_at).toLocaleDateString(dateLocale())}
                      {sanction.suspended_until ? ` · ${t('until')} ${sanction.suspended_until.slice(0, 10)}` : ''}
                      {sanction.remediation_due ? ` · ${t('due')} ${sanction.remediation_due.slice(0, 10)}` : ''}
                      {sanction.cleared_by_name ? ` · ${t('cleared by')} ${sanction.cleared_by_name}` : ''}
                    </small>
                    {sanction.status === 'ACTIVE' && (
                      <div className="eth-clear">
                        <input value={clearNotes[sanction.sanction_id] || ''} onChange={(e) => setClearNotes({ ...clearNotes, [sanction.sanction_id]: e.target.value })} placeholder={t('Clearance notes')} aria-label={t('Clearance notes')} />
                        <button type="button" onClick={() => call(() => api.post(`/governance/sanctions/${sanction.sanction_id}/clear`, { notes: clearNotes[sanction.sanction_id] || '' }))}>{t('Clear')}</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="eth-muted">{t('No sanctions recorded.')}</p>}
          </div>

          <div className="feature-panel">
            <div className="panel-heading"><div><h3>{t('Compliance register')}</h3></div></div>
            <div className="eth-table-wrap">
              <table className="eth-table">
                <thead><tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Organisation')}</th><th>{t('Required')}</th><th>{t('Code')}</th><th>{t('Status')}</th></tr></thead>
                <tbody>
                  {registerData.people.map((person) => (
                    <tr key={person.id}>
                      <td>{person.name}</td><td>{person.role ? t(roleLabel(person.role)) : person.role_code}</td><td>{person.organization || '—'}</td>
                      <td>{t(TIER_LABELS[person.required_tier])}</td>
                      <td><span className={`eth-pill ${person.compliant ? 'ok' : 'warn'}`}>{person.compliant ? t('Signed') : t('Pending')}</span></td>
                      <td>{person.status}{person.active_sanctions ? ` · ${person.active_sanctions} ⚠` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

export default Ethics
