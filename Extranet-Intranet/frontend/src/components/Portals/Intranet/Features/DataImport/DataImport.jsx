import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import { useT, dateLocale } from '../../../../../i18n'
import './DataImport.css'
import { translateServer } from '../../../../../i18n/serverMessages'

const REVIEW_FILTERS = ['', 'VALID', 'WARNING', 'INVALID', 'DUPLICATE']
const message = (error, fallback) => error.response?.data?.message || fallback

function DataImport() {
  const t = useT()
  const role = getUser()?.role
  const canImport = ['admin', 'tech_admin'].includes(role)
  const canPromote = ['admin', 'manager'].includes(role)
  const [notice, setNotice] = useState('')
  const [batches, setBatches] = useState([])
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [active, setActive] = useState(null)
  const [filter, setFilter] = useState('')
  const [rows, setRows] = useState([])
  const [rowPage, setRowPage] = useState(1)
  const [directory, setDirectory] = useState({ data: [], total: 0, page: 1, page_size: 50 })
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')

  const loadBatches = useCallback(async () => {
    if (!canImport) return
    try {
      const response = await api.get('/imports')
      setBatches(response.data?.data || [])
    } catch (error) {
      setNotice(message(error, 'Could not load imports.'))
    }
  }, [canImport])

  const loadDirectory = useCallback(async (page = 1, q = term) => {
    try {
      const response = await api.get('/imports/directory', { params: { page, q: q || undefined } })
      setDirectory(response.data)
    } catch (error) {
      setNotice(message(error, 'Could not load the directory.'))
    }
  }, [term])

  useEffect(() => {
    loadBatches()
    loadDirectory(1, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const batchId = active?.batch_id
  const batchStatus = active?.status

  useEffect(() => {
    if (batchStatus !== 'PARSING') return undefined
    const timer = setInterval(async () => {
      try {
        const response = await api.get(`/imports/${batchId}`)
        setActive(response.data.data)
        if (response.data.data.status !== 'PARSING') loadBatches()
      } catch (error) {
        setNotice(message(error, 'Could not check the import.'))
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [batchId, batchStatus, loadBatches])

  useEffect(() => {
    if (batchStatus !== 'READY') return
    api.get(`/imports/${batchId}/rows`, { params: { status: filter || undefined, page: rowPage } })
      .then((response) => setRows(response.data?.data || []))
      .catch((error) => setNotice(message(error, 'Could not load the rows.')))
  }, [batchId, batchStatus, filter, rowPage])

  const uploadFile = async (event) => {
    event.preventDefault()
    if (!file) return
    setUploading(true)
    setNotice('')
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await api.post('/imports/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setActive(response.data.data)
      setFilter('')
      setRowPage(1)
      setRows([])
      setFile(null)
      event.target.reset()
      await loadBatches()
    } catch (error) {
      setNotice(message(error, 'Could not upload the file.'))
    } finally {
      setUploading(false)
    }
  }

  const finish = async (action) => {
    if (action === 'confirm' && !window.confirm(t('Add the valid rows to the business directory? Staged rows will then be removed.'))) return
    try {
      const response = await api.post(`/imports/${batchId}/${action}`)
      setNotice(response.data?.message || '')
      setActive(null)
      setRows([])
      await Promise.all([loadBatches(), loadDirectory(1)])
    } catch (error) {
      setNotice(message(error, 'Could not complete this action.'))
    }
  }

  const promote = async (entry) => {
    const spanish = entry.source_type === 'ASSOCIATIONS'
    const body = {}
    if (!spanish) {
      body.country = window.prompt(t('Country code (3 letters, for example MEX)'))?.trim()
      body.region_corridor = window.prompt(t('Corridor: SPAIN_EU, INDIA, UAE_DUBAI, LATAM, USA_CAN or MOROCCO'))?.trim().toUpperCase()
      if (!body.country || !body.region_corridor) return
    }
    try {
      const response = await api.post(`/imports/directory/${entry.directory_id}/promote`, body)
      setNotice(response.data?.message || '')
      await loadDirectory(directory.page)
    } catch (error) {
      setNotice(message(error, 'Could not add this entry to the CRM.'))
    }
  }

  const applySearch = (event) => {
    event.preventDefault()
    setTerm(search)
    loadDirectory(1, search)
  }

  const lastPage = Math.max(1, Math.ceil(directory.total / directory.page_size))

  return (
    <section className="feature-page data-import">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('BUSINESS')}</div>
          <h1>{t('Business Directory')}</h1>
          <p>{t('Confidential association and business records. A directory entry has no login and is not a verified organization.')}</p>
        </div>
      </div>

      {notice && <div className="cloud-notice" role="status">{translateServer(notice)}</div>}

      {canImport && (
        <div className="feature-panel">
          <div className="panel-heading">
            <div>
              <h3>{t('Import a spreadsheet')}</h3>
              <p>{t('Upload .xlsx or .csv, up to 150 MB. Nothing reaches the directory until you confirm.')}</p>
            </div>
          </div>
          <form className="import-upload" onSubmit={uploadFile}>
            <input type="file" accept=".xlsx,.csv" aria-label={t('Spreadsheet file')} onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <button type="submit" className="primary-action" disabled={!file || uploading}>{uploading ? t('Uploading…') : t('Upload and review')}</button>
          </form>

          {active?.status === 'PARSING' && <p className="import-progress" role="status">{t('Reading and validating the file…')}</p>}
          {active?.status === 'FAILED' && <div className="cloud-notice" role="alert">{t(active.error || 'The import failed.')}</div>}

          {active?.status === 'READY' && (
            <div className="import-review">
              <h4>{active.file_name}</h4>
              <div className="import-counts">
                {[['Rows', active.total_rows], ['Valid', active.valid_rows], ['Warnings', active.warning_rows], ['Invalid', active.invalid_rows], ['Duplicates', active.duplicate_rows]].map(([label, value]) => (
                  <div key={label}><span>{t(label)}</span><strong>{Number(value).toLocaleString(dateLocale())}</strong></div>
                ))}
              </div>
              {active.unmapped_columns?.length > 0 && (
                <p className="import-unmapped">{t('Columns not imported')}: {active.unmapped_columns.join(', ')}</p>
              )}
              <div className="import-actions">
                <select value={filter} aria-label={t('Filter rows')} onChange={(event) => { setFilter(event.target.value); setRowPage(1) }}>
                  {REVIEW_FILTERS.map((value) => <option key={value} value={value}>{t(value || 'All rows')}</option>)}
                </select>
                <button type="button" onClick={() => setRowPage((page) => Math.max(1, page - 1))} disabled={rowPage === 1}>{t('Previous')}</button>
                <span>{t('Page')} {rowPage}</span>
                <button type="button" onClick={() => setRowPage((page) => page + 1)} disabled={rows.length < 50}>{t('Next')}</button>
                <span className="import-spacer" />
                <button type="button" onClick={() => finish('cancel')}>{t('Cancel import')}</button>
                <button type="button" className="primary-action" disabled={!(active.valid_rows + active.warning_rows)} onClick={() => finish('confirm')}>
                  {t('Import')} {(active.valid_rows + active.warning_rows).toLocaleString(dateLocale())} {t('rows')}
                </button>
              </div>
              <div className="import-table-wrap">
                <table className="import-table">
                  <thead><tr><th>{t('Sheet')}</th><th>{t('Row')}</th><th>{t('Status')}</th><th>{t('Name')}</th><th>{t('Tax ID')}</th><th>{t('Locality')}</th><th>{t('Issues')}</th></tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.staging_id}>
                        <td>{row.sheet}</td><td>{row.row_no}</td>
                        <td><span className={`import-status is-${row.validation_status.toLowerCase()}`}>{t(row.validation_status)}</span></td>
                        <td>{row.normalized.name || '—'}</td><td>{row.normalized.tax_identifier || '—'}</td><td>{row.normalized.locality || '—'}</td>
                        <td>{row.issues.map((issue) => t(issue)).join(' ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {batches.length > 0 && (
            <div className="import-history">
              <h4>{t('Recent imports')}</h4>
              {batches.slice(0, 8).map((batch) => (
                <button type="button" key={batch.batch_id} disabled={batch.status !== 'READY'} onClick={() => { setActive(batch); setFilter(''); setRowPage(1) }}>
                  <span>{batch.file_name}</span>
                  <em>{t(batch.status)} · {Number(batch.status === 'IMPORTED' ? batch.imported_rows : batch.total_rows).toLocaleString(dateLocale())} {t('rows')}</em>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="feature-panel">
        <div className="panel-heading">
          <div>
            <h3>{t('Directory')}</h3>
            <p>{directory.total.toLocaleString(dateLocale())} {t('records')}</p>
          </div>
        </div>
        <form className="import-search" onSubmit={applySearch}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search by name, tax ID or locality')} aria-label={t('Search the directory')} />
          <button type="submit">{t('Search')}</button>
        </form>
        <div className="import-table-wrap">
          <table className="import-table">
            <thead><tr><th>{t('Name')}</th><th>{t('Tax ID')}</th><th>{t('Location')}</th><th>{t('Contact')}</th><th>{t('Website')}</th><th /></tr></thead>
            <tbody>
              {directory.data.map((entry) => (
                <tr key={entry.directory_id}>
                  <td><strong>{entry.name}</strong>{entry.activity ? <small>{entry.activity}</small> : null}</td>
                  <td>{entry.tax_identifier || '—'}</td>
                  <td>{[entry.locality, entry.province].filter(Boolean).join(', ') || '—'}</td>
                  <td>{entry.contacts[0] ? [entry.contacts[0].contact_name, entry.contacts[0].email, entry.contacts[0].phone].filter(Boolean).join(' · ') : '—'}</td>
                  <td>{entry.website ? <a href={entry.website} target="_blank" rel="noopener noreferrer">{t('Open')}</a> : '—'}</td>
                  <td>
                    {entry.promoted_org_id
                      ? <span className="import-status is-valid">{t('In CRM')}</span>
                      : canPromote && <button type="button" disabled={!entry.tax_identifier} title={entry.tax_identifier ? undefined : t('A tax ID is required')} onClick={() => promote(entry)}>{t('Add to CRM')}</button>}
                  </td>
                </tr>
              ))}
              {!directory.data.length && <tr><td colSpan="6">{t('No records yet.')}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="import-actions">
          <button type="button" disabled={directory.page <= 1} onClick={() => loadDirectory(directory.page - 1)}>{t('Previous')}</button>
          <span>{t('Page')} {directory.page} / {lastPage}</span>
          <button type="button" disabled={directory.page >= lastPage} onClick={() => loadDirectory(directory.page + 1)}>{t('Next')}</button>
        </div>
      </div>
    </section>
  )
}

export default DataImport
