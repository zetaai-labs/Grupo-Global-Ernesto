import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { getUser, hasRole, COMPLIANCE_ROLES } from '../../../../../api/auth'
import { downloadFromApi } from '../../../../../utils/download'
import { useT } from '../../../../../i18n'
import './Organizations.css'

const STEPS = [
  [1, 'Pre-registration'],
  [2, 'Legal documents'],
  [3, 'Automatic validation'],
  [4, 'AML / PEP screening'],
  [5, 'Approval & credentials'],
]
const DOC_LABELS = {
  INCORPORATION_CERTIFICATE: 'Incorporation certificate',
  LEGAL_REPRESENTATION: 'Proof of legal representation',
  DIRECTOR_ID: 'Director identity document',
  OPERATING_LICENSE: 'Operating licence',
  OTHER: 'Other',
}
const TYPE_LABELS = {
  PARENT: 'Parent entity',
  BUSINESS_UNIT: 'Business unit',
  CLIENT: 'Client',
  STRATEGIC_PARTNER: 'Strategic partner',
  DELEGATION_NODE: 'Delegation node',
  VENDOR: 'Vendor',
  INVESTOR: 'Investor',
}
const EMPTY_ORG = { legal_name: '', tax_id: '', pic_code: '', country: 'ESP', region_corridor: 'SPAIN_EU', org_type: 'CLIENT' }

function stepState(org, step) {
  if (org.verification_status === 'VERIFIED') return 'done'
  if (org.verification_status === 'REJECTED') return step < org.onboarding_stage ? 'done' : step === org.onboarding_stage ? 'failed' : 'todo'
  if (step < org.onboarding_stage) return 'done'
  if (step === org.onboarding_stage) return 'current'
  return 'todo'
}

function Organizations() {
  const t = useT()
  const user = getUser()
  const isCompliance = hasRole(user, COMPLIANCE_ROLES)
  const canRegister = hasRole(user, ['admin', 'tech_admin', ...COMPLIANCE_ROLES])
  const isSuperAdmin = user?.role === 'admin'

  const [orgs, setOrgs] = useState([])
  const [meta, setMeta] = useState({ corridors: [], types: [] })
  const [filters, setFilters] = useState({ status: '', type: '', corridor: '', q: '' })
  const [selected, setSelected] = useState(null)
  const [screening, setScreening] = useState({ sanctions: 'CLEAR', pep: 'CLEAR', adverse_media: 'CLEAR', notes: '' })
  const [decisionNotes, setDecisionNotes] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newOrg, setNewOrg] = useState(EMPTY_ORG)
  const [upload, setUpload] = useState({ doc_type: 'INCORPORATION_CERTIFICATE', file: null })
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
      const response = await api.get('/organizations', { params })
      setOrgs(response.data?.data || [])
      setMeta(response.data?.meta || { corridors: [], types: [] })
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load organisations.')
    }
  }, [filters])

  const open = useCallback(async (orgId) => {
    try {
      const response = await api.get(`/organizations/${orgId}`)
      setSelected(response.data?.data)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open this organisation.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refresh = async (message) => {
    if (message) setNotice(message)
    await load()
    if (selected) await open(selected.org_id)
  }

  const act = async (request, fallback) => {
    try {
      const response = await request()
      await refresh(response.data?.message || fallback)
      return response
    } catch (error) {
      setNotice(error.response?.data?.message || 'The action could not be completed.')
      return null
    }
  }

  const revalidate = () => act(() => api.post(`/organizations/${selected.org_id}/validate`), 'Validation re-run.')
  const submitScreening = (event) => {
    event.preventDefault()
    act(() => api.post(`/organizations/${selected.org_id}/screening`, screening), 'Screening recorded.')
  }
  const decide = async (decision) => {
    const response = await act(
      () => api.post(`/organizations/${selected.org_id}/decision`, { decision, notes: decisionNotes || undefined }),
      'Decision recorded.',
    )
    if (response?.data?.data?.set_password_link) {
      setNotice(`${response.data.message} Development mode (no SMTP): set-password link — ${response.data.data.set_password_link}`)
    }
    setDecisionNotes('')
  }
  const setStatus = (status) => act(() => api.patch(`/organizations/${selected.org_id}/status`, { status }), 'Status updated.')

  const uploadDocument = async (event) => {
    event.preventDefault()
    if (!upload.file) return setNotice('Choose a file to upload.')
    const data = new FormData()
    data.append('doc_type', upload.doc_type)
    data.append('file', upload.file)
    await act(() => api.post(`/organizations/${selected.org_id}/documents`, data, { headers: { 'Content-Type': 'multipart/form-data' } }), 'Document uploaded.')
    setUpload((current) => ({ ...current, file: null }))
    event.target.reset()
    return undefined
  }

  const createOrg = async (event) => {
    event.preventDefault()
    const response = await act(() => api.post('/organizations', { ...newOrg, pic_code: newOrg.pic_code || null }), 'Organisation registered.')
    if (response) {
      setShowCreate(false)
      setNewOrg(EMPTY_ORG)
      open(response.data.data.org_id)
    }
  }

  const counts = {
    total: orgs.length,
    pending: orgs.filter((org) => org.verification_status === 'PENDING').length,
    verified: orgs.filter((org) => org.verification_status === 'VERIFIED').length,
    suspended: orgs.filter((org) => ['SUSPENDED', 'REJECTED'].includes(org.verification_status)).length,
  }
  const autoCheck = selected?.checks?.find((check) => check.check_type === 'AUTO_VALIDATION')
  const pending = selected?.verification_status === 'PENDING'
  const latestNda = selected?.ndas?.[0]

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('COMPLIANCE')}</div>
          <h1>{t('Organizations & KYC')}</h1>
          <p>{t('Registry of business units, partners, clients, vendors and investors, with the 5-step KYC/KYB verification.')}</p>
        </div>
        <div className="org-heading-actions">
          <a className="org-link-button" href="/onboarding" target="_blank" rel="noreferrer">{t('Public registration form')} ↗</a>
          {canRegister && (
            <button type="button" className="primary-action" onClick={() => setShowCreate((value) => !value)}>
              ＋ {t('Register organisation')}
            </button>
          )}
        </div>
      </div>

      <div className="feature-stats">
        <div className="stat-card"><div className="stat-top"><span>{t('Organisations')}</span><span className="stat-icon">◈</span></div><strong>{counts.total}</strong><small>{t('In current view')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Pending KYC')}</span><span className="stat-icon">◷</span></div><strong>{counts.pending}</strong><small>{t('Awaiting verification')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Verified')}</span><span className="stat-icon">✓</span></div><strong>{counts.verified}</strong><small>{t('Active organisations')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Suspended / rejected')}</span><span className="stat-icon">✕</span></div><strong>{counts.suspended}</strong><small>{t('No platform access')}</small></div>
      </div>

      {notice && (
        <div className="cloud-notice org-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      {showCreate && (
        <form className="feature-panel org-create" onSubmit={createOrg}>
          <h3>{t('Register organisation')}</h3>
          <input value={newOrg.legal_name} onChange={(e) => setNewOrg({ ...newOrg, legal_name: e.target.value })} placeholder={t('Legal name')} required />
          <input value={newOrg.tax_id} onChange={(e) => setNewOrg({ ...newOrg, tax_id: e.target.value })} placeholder={t('Tax ID (NIF / VAT / PAN)')} required />
          <input value={newOrg.pic_code} onChange={(e) => setNewOrg({ ...newOrg, pic_code: e.target.value })} placeholder={t('EU PIC (optional, 9 digits)')} />
          <input value={newOrg.country} onChange={(e) => setNewOrg({ ...newOrg, country: e.target.value.toUpperCase() })} placeholder="ESP" maxLength={3} required aria-label={t('Country (ISO 3)')} />
          <select value={newOrg.org_type} onChange={(e) => setNewOrg({ ...newOrg, org_type: e.target.value })} aria-label={t('Type')}>
            {meta.types.map((type) => <option key={type} value={type}>{t(TYPE_LABELS[type] || type)}</option>)}
          </select>
          <select value={newOrg.region_corridor} onChange={(e) => setNewOrg({ ...newOrg, region_corridor: e.target.value })} aria-label={t('Corridor')}>
            {meta.corridors.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <div className="org-actions">
            <button type="submit" className="primary-action">{t('Register')}</button>
            <button type="button" onClick={() => setShowCreate(false)}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      <div className="org-layout">
        <div className="feature-panel org-list-panel">
          <div className="org-filters">
            <input type="search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder={t('Search name or tax ID')} aria-label={t('Search')} />
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label={t('Status')}>
              <option value="">{t('All statuses')}</option>
              {['PENDING', 'VERIFIED', 'SUSPENDED', 'REJECTED'].map((status) => <option key={status} value={status}>{t(status)}</option>)}
            </select>
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} aria-label={t('Type')}>
              <option value="">{t('All types')}</option>
              {meta.types.map((type) => <option key={type} value={type}>{t(TYPE_LABELS[type] || type)}</option>)}
            </select>
            <select value={filters.corridor} onChange={(e) => setFilters({ ...filters, corridor: e.target.value })} aria-label={t('Corridor')}>
              <option value="">{t('All corridors')}</option>
              {meta.corridors.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>

          {orgs.length ? (
            <div className="org-list">
              {orgs.map((org) => (
                <button type="button" key={org.org_id} className={`org-row ${selected?.org_id === org.org_id ? 'selected' : ''}`} onClick={() => open(org.org_id)}>
                  <span className="org-row-main">
                    <strong>{org.legal_name}</strong>
                    <span>{t(TYPE_LABELS[org.org_type] || org.org_type)} · {org.region_corridor} · {org.country}{org.parent_name ? ` · ${org.parent_name}` : ''}</span>
                  </span>
                  <span className="org-row-side">
                    <span className={`org-status org-status-${org.verification_status.toLowerCase()}`}>{t(org.verification_status)}</span>
                    {org.verification_status === 'PENDING' && (
                      <span className="org-stage" aria-label={t('Step {n} of 5', { n: org.onboarding_stage })}>
                        {STEPS.map(([step]) => <i key={step} className={step < org.onboarding_stage ? 'done' : step === org.onboarding_stage ? 'current' : ''} />)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="feature-empty-state"><div className="empty-icon">◈</div><h3>{t('No organisations found')}</h3><p>{t('Adjust the filters or register an organisation.')}</p></div>
          )}
        </div>

        <aside className="feature-panel org-detail">
          {!selected ? (
            <div className="feature-empty-state"><div className="empty-icon">◈</div><h3>{t('Select an organisation')}</h3><p>{t('See its verification progress, documents and members.')}</p></div>
          ) : (
            <div className="org-detail-body">
              <header>
                <h2>{selected.legal_name}</h2>
                <span className={`org-status org-status-${selected.verification_status.toLowerCase()}`}>{t(selected.verification_status)}</span>
              </header>
              <dl className="org-facts">
                <div><dt>{t('Type')}</dt><dd>{t(TYPE_LABELS[selected.org_type] || selected.org_type)}</dd></div>
                <div><dt>{t('Tax ID')}</dt><dd className="mono">{selected.tax_id}</dd></div>
                <div><dt>EU PIC</dt><dd className="mono">{selected.pic_code || '—'}</dd></div>
                <div><dt>{t('Country / corridor')}</dt><dd>{selected.country} · {selected.region_corridor}</dd></div>
                <div><dt>org_id</dt><dd className="mono org-id">{selected.org_id}</dd></div>
                {selected.parent_name && <div><dt>{t('Parent')}</dt><dd>{selected.parent_name}</dd></div>}
              </dl>

              <ol className="kyc-steps">
                {STEPS.map(([step, label]) => (
                  <li key={step} className={`kyc-step kyc-${stepState(selected, step)}`}>
                    <span className="kyc-dot">{stepState(selected, step) === 'done' ? '✓' : stepState(selected, step) === 'failed' ? '✕' : step}</span>
                    <span>{t(label)}</span>
                  </li>
                ))}
              </ol>

              {selected.application && (
                <section>
                  <h3>{t('Applicant contact')}</h3>
                  <p>{selected.application.contact_name} · {selected.application.contact_email}{selected.application.contact_phone ? ` · ${selected.application.contact_phone}` : ''}</p>
                  {selected.application.decision_notes && <p className="org-muted">{t('Decision notes')}: {selected.application.decision_notes}</p>}
                </section>
              )}

              <section>
                <h3>{t('Legal documents')}</h3>
                {selected.documents.length ? (
                  <ul className="org-docs">
                    {selected.documents.map((doc) => (
                      <li key={doc.document_id}>
                        <span><strong>{t(DOC_LABELS[doc.doc_type] || doc.doc_type)}</strong><small>{doc.original_name}</small></span>
                        {isCompliance && (
                          <button type="button" onClick={() => downloadFromApi(`/organizations/${selected.org_id}/documents/${doc.document_id}/download`, doc.original_name).catch(() => setNotice('Could not download this document.'))}>
                            {t('Download')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <p className="org-muted">{t('No documents uploaded yet.')}</p>}
                {isCompliance && pending && (
                  <form className="org-upload" onSubmit={uploadDocument}>
                    <select value={upload.doc_type} onChange={(e) => setUpload({ ...upload, doc_type: e.target.value })} aria-label={t('Document type')}>
                      {Object.entries(DOC_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
                    </select>
                    <input type="file" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] || null })} aria-label={t('File')} />
                    <button type="submit">{t('Upload')}</button>
                  </form>
                )}
              </section>

              <section>
                <h3>{t('Automatic validation')}</h3>
                {autoCheck ? (
                  <div className={`org-check org-check-${autoCheck.result.toLowerCase()}`}>
                    <strong>{autoCheck.result === 'PASS' ? t('Passed') : t('Issues found')}</strong>
                    <span>{t('Tax ID')}: {autoCheck.details?.tax_id?.rule}</span>
                    {(autoCheck.details?.issues || []).map((issue) => <span key={issue}>• {issue}</span>)}
                    {(autoCheck.details?.warnings || []).map((warning) => <span key={warning}>⚠ {t(warning)}</span>)}
                    <small>{t('Registry lookup')}: {t(autoCheck.details?.registry_lookup)}</small>
                  </div>
                ) : <p className="org-muted">{t('Not run yet.')}</p>}
                {isCompliance && pending && <button type="button" className="org-secondary" onClick={revalidate}>{t('Run validation')}</button>}
              </section>

              <section>
                <h3>{t('AML / sanctions / PEP screening')}</h3>
                {selected.screening.length > 0 && (
                  <ul className="org-screening">
                    {selected.screening.map((check) => (
                      <li key={check.check_type}><span>{t(check.check_type)}</span><span className={`org-check-pill ${check.result === 'CLEAR' ? 'ok' : 'bad'}`}>{t(check.result)}</span></li>
                    ))}
                  </ul>
                )}
                {isCompliance && pending && selected.onboarding_stage >= 4 && (
                  <form className="org-screening-form" onSubmit={submitScreening}>
                    {[['sanctions', 'Sanctions lists'], ['pep', 'Politically exposed persons'], ['adverse_media', 'Adverse media']].map(([field, label]) => (
                      <fieldset key={field}>
                        <legend>{t(label)}</legend>
                        {['CLEAR', 'HIT'].map((value) => (
                          <label key={value}>
                            <input type="radio" name={field} value={value} checked={screening[field] === value} onChange={() => setScreening({ ...screening, [field]: value })} />
                            {t(value)}
                          </label>
                        ))}
                      </fieldset>
                    ))}
                    <textarea value={screening.notes} onChange={(e) => setScreening({ ...screening, notes: e.target.value })} placeholder={t('Screening notes (sources checked, references)')} rows="2" />
                    <button type="submit">{t('Record screening')}</button>
                  </form>
                )}
                {pending && selected.onboarding_stage < 4 && <p className="org-muted">{t('Available once automatic validation passes.')}</p>}
              </section>

              {isCompliance && pending && (
                <section>
                  <h3>{t('Decision')}</h3>
                  <textarea value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} placeholder={t('Decision notes (optional)')} rows="2" />
                  <div className="org-actions">
                    <button type="button" className="primary-action" disabled={selected.onboarding_stage < 5} onClick={() => decide('APPROVE')}>
                      ✓ {t('Approve & issue credentials')}
                    </button>
                    <button type="button" className="org-danger" onClick={() => decide('REJECT')}>✕ {t('Reject')}</button>
                  </div>
                  {selected.onboarding_stage < 5 && <p className="org-muted">{t('Approval unlocks when all screening checks are CLEAR.')}</p>}
                </section>
              )}

              {latestNda && (
                <section>
                  <h3>{t('Confidentiality agreement (NDA)')}</h3>
                  <p className="mono org-hash">{latestNda.nda_version} · SHA-256 {latestNda.document_hash}</p>
                  <p>{latestNda.accepted_at ? `${t('Accepted by')} ${latestNda.accepted_by} · ${new Date(latestNda.accepted_at).toLocaleString()}` : t('Issued — awaiting acceptance by the organisation.')}</p>
                </section>
              )}

              <section>
                <h3>{t('Members')} ({selected.members.length})</h3>
                {selected.members.length ? (
                  <ul className="org-members">
                    {selected.members.map((member) => (
                      <li key={member.id}><span>{member.name}<small>{member.email}</small></span><span className="mono">{member.role_code}</span></li>
                    ))}
                  </ul>
                ) : <p className="org-muted">{t('No user accounts yet.')}</p>}
              </section>

              {isSuperAdmin && ['VERIFIED', 'SUSPENDED'].includes(selected.verification_status) && selected.org_type !== 'PARENT' && (
                <div className="org-actions">
                  {selected.verification_status === 'VERIFIED'
                    ? <button type="button" className="org-danger" onClick={() => setStatus('SUSPENDED')}>{t('Suspend organisation')}</button>
                    : <button type="button" onClick={() => setStatus('VERIFIED')}>{t('Reinstate organisation')}</button>}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

export default Organizations
