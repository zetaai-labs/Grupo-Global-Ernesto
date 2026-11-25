import { useEffect, useState } from 'react'
import api from '../../../../api/client'
import { useT, dateLocale } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { formatValue, humanize } from './zylaxFormat'

/** Report for one ZYLAX list: records by status and the last 12 months (with the module total when it has one). */
function ZylaxReport({ path }) {
  const t = useT()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.get(`${path}/report`)
      .then((response) => { if (!cancelled) setReport(response.data?.data) })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || 'Could not load the report.') })
    return () => { cancelled = true }
  }, [path])

  if (error) return <div className="cloud-notice">{translateServer(error)}</div>
  if (!report) return <div className="zx-report">{t('Loading…')}</div>

  const maxStatus = Math.max(1, ...report.by_status.map((row) => row.count))
  const metric = report.amount_field ? 'amount' : 'count'
  const maxMonth = Math.max(1, ...report.by_month.map((row) => Math.abs(row[metric])))
  const monthName = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString(dateLocale(), { month: 'short', year: '2-digit' })

  return (
    <section className="zx-report" aria-label={t('Report')}>
      <div className="zx-report-block">
        <h4>{t('By status')} <small>{t('{count} records', { count: report.total })}</small></h4>
        {report.by_status.length === 0 && <p className="zx-report-empty">{t('Nothing here yet.')}</p>}
        {report.by_status.map((row) => (
          <div key={row.status} className="zx-report-row">
            <span>{t(humanize(row.status))}</span>
            <div className="zx-report-bar"><i style={{ width: `${(row.count / maxStatus) * 100}%` }} /></div>
            <strong>{row.count}</strong>
          </div>
        ))}
      </div>
      <div className="zx-report-block">
        <h4>{report.amount_field ? t('Total per month (EUR)') : t('New records per month')}</h4>
        <div className="zx-report-months">
          {report.by_month.map((row) => (
            <div key={row.month} className="zx-report-month" title={`${monthName(row.month)}: ${metric === 'amount' ? formatValue({ type: 'money' }, row.amount) : row.count}`}>
              <div className="zx-report-column"><i style={{ height: `${(Math.abs(row[metric]) / maxMonth) * 100}%` }} /></div>
              <small>{monthName(row.month)}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ZylaxReport
