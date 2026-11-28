import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { useT, dateLocale } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import '../Commercial/Commercial.css'
import { roleLabel } from '../../../../../utils/roles'

const PROVIDERS = [['GOOGLE', 'Google Workspace'], ['MICROSOFT', 'Microsoft 365']]
const tone = { SUCCESS: 'zx-accepted', PLANNED: 'zx-sent', FAILED: 'zx-rejected' }

function Provisioning() {
  const t = useT()
  const [tab, setTab] = useState('staff')
  const [staff, setStaff] = useState([])
  const [jobs, setJobs] = useState([])
  const [connected, setConnected] = useState({ google: false, microsoft: false })
  const [dryRun, setDryRun] = useState(true)
  const [notice, setNotice] = useState('')
  const [secret, setSecret] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [people, history, status] = await Promise.all([api.get('/provisioning/staff'), api.get('/provisioning/jobs'), api.get('/provisioning/status')])
      setStaff(people.data.data)
      setJobs(history.data.data)
      setConnected(status.data.data)
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message || 'Could not load this page.'))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (person, provider, action) => {
    const label = PROVIDERS.find(([key]) => key === provider)[1]
    if (!dryRun && !window.confirm(t(action === 'CREATE' ? 'Create a {provider} account for {name}?' : 'Suspend the {provider} account of {name}?', { provider: label, name: person.name }))) return
    setBusy(true)
    setSecret(null)
    try {
      const response = await api.post(`/provisioning/users/${person.id}`, { provider, action, dry_run: dryRun })
      const { job, temporary_password: password } = response.data.data
      setNotice(dryRun ? t('Dry run recorded: {email}. Nothing was sent.', { email: job.target_email }) : t('Done: {email}.', { email: job.target_email }))
      if (password) setSecret({ email: job.target_email, password })
      await load()
    } catch (error) {
      setNotice(translateServer(error.response?.data?.message) || t('The action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  const has = (person, provider) => (person.accounts || []).some((item) => item.provider === provider && item.action === 'CREATE')

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('ADMINISTRATION')}</div>
          <h1>{t('Company accounts')}</h1>
          <p>{t('Create and suspend staff accounts in Google Workspace and Microsoft 365.')}</p>
        </div>
        <label className="zx-form-actions" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} /> {t('Dry run (record only, send nothing)')}
        </label>
      </div>

      <div className="feature-stats">
        {PROVIDERS.map(([key, label]) => (
          <div key={key} className="stat-card"><div className="stat-top"><span>{label}</span></div><strong>{t(connected[key.toLowerCase()] ? 'Connected' : 'Not connected')}</strong><small>{t('Settings on the Integrations page')}</small></div>
        ))}
      </div>

      {notice && <div className="cloud-notice zx-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label={t('Dismiss')}>✕</button></div>}
      {secret && (
        <div className="cloud-notice zx-notice" role="alert">
          <span>{t('Temporary password for {email}', { email: secret.email })}: <code className="zx-mono">{secret.password}</code> · {t('Shown only once. Hand it over in person; it must be changed at first sign-in.')}</span>
          <button type="button" onClick={() => setSecret(null)} aria-label={t('Dismiss')}>✕</button>
        </div>
      )}

      <div className="zx-tabs" role="tablist">
        {[['staff', 'Staff'], ['jobs', 'History']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{t(label)}</button>)}
      </div>

      <div className="zx-table-wrap zx-card">
        {tab === 'staff' ? (
          <table>
            <thead><tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Status')}</th><th>{t('Company accounts')}</th><th /></tr></thead>
            <tbody>
              {staff.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}<br /><small className="zx-mono">{person.email}</small></td><td>{t(roleLabel(person.role))}</td><td>{t(person.status)}</td>
                  <td>{(person.accounts || []).map((item) => <div key={`${item.provider}-${item.at}`} className="zx-mono">{item.provider === 'GOOGLE' ? t("Google") : t("Microsoft")} · {item.email} · {t(item.action === 'SUSPEND' ? 'Suspended' : 'Created')}</div>)}</td>
                  <td className="zx-form-actions">
                    {PROVIDERS.map(([key, label]) => (has(person, key)
                      ? <button key={key} type="button" disabled={busy} onClick={() => run(person, key, 'SUSPEND')}>{t('Suspend {provider}', { provider: label })}</button>
                      : <button key={key} type="button" disabled={busy || person.status !== 'active'} onClick={() => run(person, key, 'CREATE')}>{t('Create {provider}', { provider: label })}</button>))}
                  </td>
                </tr>
              ))}
              {!staff.length && <tr><td colSpan="5" className="zx-empty">{t('Nothing here yet.')}</td></tr>}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>{t('Date')}</th><th>{t('Person')}</th><th>{t('Provider')}</th><th>{t('Action')}</th><th>{t('Address')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.job_id}>
                  <td>{new Date(job.created_at).toLocaleString(dateLocale())}</td><td>{job.user_name || '—'}</td><td>{job.provider}</td>
                  <td>{t(job.action === 'CREATE' ? 'Create' : 'Suspend')}{job.dry_run ? ` · ${t('dry run')}` : ''}</td><td className="zx-mono">{job.target_email}</td>
                  <td><span className={`zx-pill ${tone[job.status] || ''}`}>{t(job.status)}</span>{job.result?.error ? <small> {translateServer(job.result.error)}</small> : null}</td>
                </tr>
              ))}
              {!jobs.length && <tr><td colSpan="6" className="zx-empty">{t('Nothing here yet.')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default Provisioning
