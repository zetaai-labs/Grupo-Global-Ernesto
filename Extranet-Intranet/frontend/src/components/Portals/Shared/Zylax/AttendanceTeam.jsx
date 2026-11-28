import { useEffect, useMemo, useState } from 'react'
import api from '../../../../api/client'
import { getUser } from '../../../../api/auth'
import { dateLocale, useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { downloadFromApi } from '../../../../utils/download'
import { duration } from '../clock/clockStore'
import './AttendanceTeam.css'
import { roleLabel } from '../../../../utils/roles'

const LEADS = ['admin', 'hr', 'manager']
const HR = ['admin', 'hr']
const STATES = { IN: ['Working', 'at-in'], BREAK: ['On a break', 'at-break'], LEAVE: ['On leave', 'at-leave'], DONE: ['Finished for today', 'at-done'], OUT: ['Not clocked in', 'at-out'] }
const URL_BASE = '/zylax/hub/attendance'

const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
/** ISO time -> value for <input type="datetime-local"> in the browser's time zone. */
const toLocalInput = (iso) => {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/** HR/managers: who is in now, monthly hours, exports and corrections. Everyone: their own month. */
function AttendanceTeam() {
  const t = useT()
  const role = getUser()?.role
  const lead = LEADS.includes(role)
  const [team, setTeam] = useState(null)
  const [month, setMonth] = useState(thisMonth)
  const [person, setPerson] = useState(lead ? '' : 'me')
  const [report, setReport] = useState(null)
  const [fixing, setFixing] = useState(null)
  const [message, setMessage] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  // Bumped after a correction so both lists reload.
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!lead) return undefined
    const load = () => api.get(`${URL_BASE}/team`).then((response) => setTeam(response.data.data)).catch(() => setTeam([]))
    load()
    const timer = setInterval(load, 60000)
    return () => clearInterval(timer)
  }, [lead, refresh])

  useEffect(() => {
    let alive = true
    api.get(`${URL_BASE}/report`, { params: { month, ...(person ? { user: person } : {}) } })
      .then((response) => { if (alive) setReport(response.data.data) })
      .catch((error) => { if (alive) { setReport(null); setMessage(translateServer(error.response?.data?.message) || 'The action could not be completed.') } })
    return () => { alive = false }
  }, [month, person, refresh])

  const counts = useMemo(() => (team || []).reduce((acc, row) => ({ ...acc, [row.state]: (acc[row.state] || 0) + 1 }), {}), [team])
  // Working people first, then breaks, leave, finished, not in; filtered by the chips and the search box.
  const visible = useMemo(() => {
    const order = { IN: 0, BREAK: 1, LEAVE: 2, DONE: 3, OUT: 4 }
    const needle = search.trim().toLowerCase()
    return (team || [])
      .filter((row) => (!stateFilter || row.state === stateFilter) && (!needle || row.name.toLowerCase().includes(needle)))
      .sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name))
  }, [team, stateFilter, search])
  const shown = showAll ? visible : visible.slice(0, 50)
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }) : '—')
  const day = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })

  const download = (format) => {
    const params = new URLSearchParams({ month, format, ...(person ? { user: person } : {}) })
    downloadFromApi(`${URL_BASE}/report?${params}`, `attendance-${month}.${format}`).catch(() => setMessage(t('The action could not be completed.')))
  }

  const saveFix = async (event) => {
    event.preventDefault()
    try {
      await api.post(`${URL_BASE}/entries/${fixing.record_id}/correct`, {
        clock_in: new Date(fixing.clock_in).toISOString(),
        clock_out: new Date(fixing.clock_out).toISOString(),
        reason: fixing.reason,
      })
      setFixing(null)
      setMessage(t('Attendance entry corrected.'))
      setRefresh((value) => value + 1)
    } catch (error) {
      setMessage(translateServer(error.response?.data?.message) || t('The action could not be completed.'))
    }
  }
  const startFix = (entry) => setFixing({
    record_id: entry.record_id,
    clock_in: toLocalInput(entry.clock_in),
    // A forgotten clock-out starts as an 8-hour shift; HR adjusts it (the server refuses future times).
    clock_out: toLocalInput(entry.clock_out || new Date(new Date(entry.clock_in).getTime() + 8 * 3600000).toISOString()),
    reason: '',
  })

  return (
    <div className="at-wrap">
      {lead && team && (
        <section className="zh-panel at-now" aria-label={t('Who is working now')}>
          <header>
            <h3>{t('Who is working now')}</h3>
            <div className="at-counts" role="group" aria-label={t('Filter by status')}>
              {['IN', 'BREAK', 'LEAVE', 'DONE', 'OUT'].map((key) => (
                <button key={key} type="button" aria-pressed={stateFilter === key} className={`at-pill ${STATES[key][1]} ${stateFilter === key ? 'at-pill-on' : ''}`} onClick={() => setStateFilter(stateFilter === key ? '' : key)}>
                  {t(STATES[key][0])}: {counts[key] || 0}
                </button>
              ))}
              {team.length > 8 && <input type="search" className="at-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search people')} aria-label={t('Search people')} />}
            </div>
          </header>
          {!team.length && <p className="at-empty">{t(role === 'manager' ? 'Nobody reports to you yet. HR sets “Reports to” in Employee profiles.' : 'No staff found.')}</p>}
          {team.length > 0 && (
            <div className="at-table">
              <table>
                <thead><tr><th>{t('Employee')}</th><th>{t('Status')}</th><th>{t('First in')}</th><th>{t('Today')}</th><th /></tr></thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.name}</strong><small>{t(roleLabel(row.role))}</small></td>
                      <td>
                        <span className={`at-pill ${STATES[row.state][1]}`}>{t(STATES[row.state][0])}</span>
                        {row.late && <span className="at-flag">{t('Late')}</span>}
                        {row.long_shift && <span className="at-flag at-flag-bad">{t('Open > 14 h')}</span>}
                      </td>
                      <td>{time(row.first_in)}</td>
                      <td>{row.today_seconds ? duration(t, row.today_seconds) : '—'}</td>
                      <td><button type="button" className="at-link" onClick={() => setPerson(String(row.id))}>{t('Month')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length > shown.length && <button type="button" className="at-link at-more" onClick={() => setShowAll(true)}>{t('Show all ({count})', { count: visible.length })}</button>}
              {!visible.length && <p className="at-empty">{t('Nobody matches this filter.')}</p>}
            </div>
          )}
        </section>
      )}

      <section className="zh-panel at-month" aria-label={t('Monthly working-time record')}>
        <header>
          <h3>{t('Monthly working-time record')}</h3>
          <div className="at-controls">
            <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} aria-label={t('Month')} />
            {lead && (
              <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label={t('Employee')}>
                <option value="">{t(role === 'manager' ? 'My team' : 'Everyone')}</option>
                <option value="me">{t('Only me')}</option>
                {(team || []).map((row) => <option key={row.id} value={String(row.id)}>{row.name}</option>)}
              </select>
            )}
            <button type="button" onClick={() => download('xlsx')}>⇩ {t('Excel')}</button>
            <button type="button" onClick={() => download('csv')}>⇩ CSV</button>
          </div>
        </header>
        <p className="at-note">{t('Spanish law requires a daily record of start and end times, kept for 4 years. Times are Madrid time.')}</p>
        {message && <p className="at-message" role="status">{t(message)}</p>}

        {report && report.totals.length > 0 && (
          <div className="at-totals">
            {report.totals.filter((row) => row.days_worked).slice(0, 12).map((row) => (
              <div key={row.user_id}><span>{row.name}</span><b>{duration(t, row.worked_seconds)}</b><small>{t('{count} day(s)', { count: row.days_worked })}{row.late_days ? ` · ${t('{count} late', { count: row.late_days })}` : ''}</small></div>
            ))}
          </div>
        )}
        {report && !report.days.length && <p className="at-empty">{t('No attendance recorded in this month.')}</p>}
        {report && report.days.length > 0 && (
          <div className="at-table">
            <table>
              <thead><tr>{(lead && person !== 'me') && <th>{t('Employee')}</th>}<th>{t('Date')}</th><th>{t('First in')}</th><th>{t('Last out')}</th><th>{t('Worked')}</th><th>{t('Breaks')}</th><th /></tr></thead>
              <tbody>
                {report.days.map((row) => (
                  <tr key={`${row.user_id}-${row.date}`} className={row.open ? 'at-row-open' : ''}>
                    {(lead && person !== 'me') && <td>{row.name}</td>}
                    <td>{day(row.date)}</td>
                    <td>{time(row.first_in)}{row.late && <span className="at-flag">{t('Late')}</span>}</td>
                    <td>{row.open ? <span className="at-flag at-flag-bad">{t('Still open')}</span> : time(row.last_out)}</td>
                    <td>{duration(t, row.worked_seconds)}</td>
                    <td>{row.break_seconds >= 60 ? duration(t, row.break_seconds) : '—'}</td>
                    <td>
                      {row.corrected && <span className="at-flag" title={row.entries.flatMap((entry) => entry.corrections).map((item) => `${item.by_name}: ${item.reason}`).join('\n')}>{t('Corrected')}</span>}
                      {HR.includes(role) && row.user_id !== getUser()?.id && row.entries.map((entry) => (
                        <button key={entry.record_id} type="button" className="at-link" onClick={() => startFix(entry)}>{t('Correct')}</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {fixing && (
        <div className="at-overlay" role="presentation" onClick={() => setFixing(null)}>
          <form className="at-dialog" role="dialog" aria-modal="true" aria-label={t('Correct attendance entry')} onSubmit={saveFix} onClick={(event) => event.stopPropagation()}>
            <h3>{t('Correct attendance entry')}</h3>
            <label>{t('Clock in')}<input type="datetime-local" required value={fixing.clock_in} onChange={(e) => setFixing({ ...fixing, clock_in: e.target.value })} /></label>
            <label>{t('Clock out')}<input type="datetime-local" required value={fixing.clock_out} onChange={(e) => setFixing({ ...fixing, clock_out: e.target.value })} /></label>
            <label>{t('Reason (kept with the record)')}<textarea required minLength={5} maxLength={500} rows="3" value={fixing.reason} onChange={(e) => setFixing({ ...fixing, reason: e.target.value })} /></label>
            <div className="at-dialog-actions">
              <button type="button" onClick={() => setFixing(null)}>{t('Cancel')}</button>
              <button type="submit" className="primary-action">{t('Save correction')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default AttendanceTeam
