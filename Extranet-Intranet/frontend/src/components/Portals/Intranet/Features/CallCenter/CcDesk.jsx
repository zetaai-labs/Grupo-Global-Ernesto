import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { dateLocale, useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'
import { OUTCOME_LABELS, OUTCOME_TONE, PURPOSE_LABELS, STATUS_LABELS, minutes } from './ccLabels'

const EMPTY_CALL = { outcome: '', notes: '', callback_at: '' }
const EMPTY_INBOUND = { campaign_id: '', name: '', company: '', phone: '', outcome: 'RESOLVED', notes: '', minutes: '', callback_at: '' }
const toIso = (local) => (local ? new Date(local).toISOString() : null)

/** The agent's screen: status, next contact with script and history, outcome, callbacks and inbound calls. */
function CcDesk({ desk, reload, notify }) {
  const t = useT()
  const [campaignId, setCampaignId] = useState('')
  const [contact, setContact] = useState(null)
  const [call, setCall] = useState(EMPTY_CALL)
  const [startedAt, setStartedAt] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [inbound, setInbound] = useState(null)
  const [busy, setBusy] = useState(false)

  const open = useCallback(async (id) => {
    try {
      const response = await api.get(`/call-center/contacts/${id}`)
      setContact(response.data.data)
      setCall(EMPTY_CALL)
      setStartedAt(Date.now())
    } catch (error) {
      notify(translateServer(error.response?.data?.message) || t('The action could not be completed.'))
    }
  }, [notify, t])

  // Coming back to the page: continue with the contact the agent was already calling.
  useEffect(() => { if (desk.current_contact_id) open(desk.current_contact_id) }, [desk.current_contact_id, open])
  useEffect(() => {
    if (!startedAt) return undefined
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [startedAt])

  const run = async (work, after) => {
    setBusy(true)
    try {
      const response = await work()
      if (after) await after(response)
      await reload()
    } catch (error) {
      notify(translateServer(error.response?.data?.message) || t('The action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  const next = () => run(() => api.post('/call-center/next', campaignId ? { campaign_id: campaignId } : {}), (response) => {
    if (!response.data.data) { setContact(null); notify(translateServer(response.data.message)); return }
    setContact(response.data.data)
    setCall(EMPTY_CALL)
    setStartedAt(Date.now())
    setElapsed(0)
  })

  const save = (andNext) => (event) => {
    event?.preventDefault()
    if (!call.outcome) return notify(t('Choose the outcome of the call.'))
    return run(() => api.post(`/call-center/contacts/${contact.contact_id}/calls`, {
      outcome: call.outcome, notes: call.notes || null, duration_sec: Math.min(elapsed, 14400), callback_at: call.outcome === 'CALLBACK' ? toIso(call.callback_at) : null,
    }), async () => {
      notify(t('Call saved.'))
      setContact(null)
      setStartedAt(null)
      setElapsed(0)
      if (andNext) await next()
    })
  }

  const saveInbound = (event) => {
    event.preventDefault()
    run(() => api.post('/call-center/inbound', {
      campaign_id: inbound.campaign_id, name: inbound.name, company: inbound.company || null, phone: inbound.phone || null,
      outcome: inbound.outcome, notes: inbound.notes || null, duration_sec: Math.round((Number(inbound.minutes) || 0) * 60),
      callback_at: inbound.outcome === 'CALLBACK' ? toIso(inbound.callback_at) : null,
    }), () => { notify(t('Call saved.')); setInbound(null) })
  }

  const status = desk.agent.status
  const outbound = desk.campaigns.filter((campaign) => campaign.direction === 'OUTBOUND')
  const inboundCampaigns = desk.campaigns.filter((campaign) => campaign.direction === 'INBOUND')
  const when = (value) => new Date(value).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div className="cc-desk">
      <div className="cc-bar feature-panel">
        <div className="cc-status" role="group" aria-label={t('My status')}>
          {['AVAILABLE', 'BREAK', 'OFFLINE'].map((value) => (
            <button key={value} type="button" className={status === value ? `on cc-s-${value}` : ''} aria-pressed={status === value} disabled={busy}
              onClick={() => run(() => api.post('/call-center/me/status', { status: value }))}>{t(STATUS_LABELS[value])}</button>
          ))}
          {status === 'ON_CALL' && <span className="cc-pill cc-s-ON_CALL">{t('On a call')}</span>}
        </div>
        <div className="cc-today">
          <span><strong>{desk.today.calls}</strong> {t('calls today')}</span>
          <span><strong>{minutes(desk.today.talk_sec)}</strong> {t('talking')}</span>
          <span><strong>{desk.today.positive}</strong> {t('interested or sales')}</span>
        </div>
      </div>

      <div className="cc-grid">
        <div className="feature-panel cc-main">
          {!contact ? (
            <div className="cc-start">
              <h3>{t('Ready for the next call?')}</h3>
              <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} aria-label={t('Campaign')}>
                <option value="">{t('All my campaigns')}</option>
                {outbound.map((campaign) => <option key={campaign.campaign_id} value={campaign.campaign_id}>{campaign.name} ({campaign.ready})</option>)}
              </select>
              <button type="button" className="primary-action cc-next" disabled={busy || status === 'OFFLINE'} onClick={next}>☎ {t('Next call')}</button>
              {status === 'OFFLINE' && <small>{t('Set yourself Available to start calling.')}</small>}
              {!outbound.length && <small>{t('No active campaigns for your region yet. A supervisor creates them.')}</small>}
            </div>
          ) : (
            <form className="cc-contact" onSubmit={save(false)}>
              <header>
                <div>
                  <small>{contact.campaign} · {t(PURPOSE_LABELS[contact.purpose])}</small>
                  <h3><bdi>{contact.name}</bdi></h3>
                  {contact.company && <p><bdi>{contact.company}</bdi>{contact.organisation ? ` · ${t('Registered on the platform')}` : ''}</p>}
                </div>
                <span className="cc-timer" aria-label={t('Call time')}>⏱ {clock}</span>
              </header>
              <div className="cc-reach">
                {contact.phone && <a className="primary-action" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>📞 {contact.phone}</a>}
                {contact.email && <a className="secondary-action" href={`mailto:${contact.email}`}>✉ {contact.email}</a>}
                {contact.country && <span className="cc-pill">{contact.country}</span>}
                <span className="cc-pill">{t('Attempt {n}', { n: contact.attempts + 1 })}</span>
              </div>
              {contact.notes && <p className="cc-note">{contact.notes}</p>}
              {contact.script && (
                <details className="cc-script" open>
                  <summary>{t('Script')}</summary>
                  <p>{contact.script}</p>
                </details>
              )}
              {contact.history?.length > 0 && (
                <div className="cc-history">
                  <strong>{t('Earlier calls')}</strong>
                  <ul>
                    {contact.history.map((item) => (
                      <li key={item.created_at}>
                        <span className={`cc-pill cc-${OUTCOME_TONE[item.outcome]}`}>{t(OUTCOME_LABELS[item.outcome])}</span>
                        {' '}{when(item.created_at)} · {item.agent}{item.notes ? ` — ${item.notes}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <fieldset className="cc-outcomes">
                <legend>{t('How did it go?')}</legend>
                {desk.outcomes.map((outcome) => (
                  <label key={outcome} className={`cc-${OUTCOME_TONE[outcome]} ${call.outcome === outcome ? 'on' : ''}`}>
                    <input type="radio" name="outcome" value={outcome} checked={call.outcome === outcome} onChange={() => setCall({ ...call, outcome })} />
                    {t(OUTCOME_LABELS[outcome])}
                  </label>
                ))}
              </fieldset>
              {call.outcome === 'CALLBACK' && (
                <label className="cc-field">{t('Call back on')}<input type="datetime-local" required value={call.callback_at} onChange={(event) => setCall({ ...call, callback_at: event.target.value })} /></label>
              )}
              {call.outcome === 'DO_NOT_CALL' && <p className="cc-warn">{t('This person will never be called again, in any campaign.')}</p>}
              <label className="cc-field">{t('Notes')}<textarea rows="3" maxLength="4000" value={call.notes} onChange={(event) => setCall({ ...call, notes: event.target.value })} placeholder={t('What was said, what was agreed…')} /></label>
              <div className="cc-actions">
                <button type="button" className="secondary-action" disabled={busy}
                  onClick={() => run(() => api.post(`/call-center/contacts/${contact.contact_id}/release`), () => { setContact(null); setStartedAt(null) })}>{t('Return to queue')}</button>
                <button type="submit" className="secondary-action" disabled={busy}>{t('Save call')}</button>
                <button type="button" className="primary-action" disabled={busy} onClick={save(true)}>{t('Save and next call')}</button>
              </div>
            </form>
          )}
        </div>

        <aside className="cc-side">
          <div className="feature-panel">
            <h3>{t('My callbacks')} ({desk.callbacks.length})</h3>
            <ul className="cc-list">
              {desk.callbacks.map((item) => (
                <li key={item.contact_id}>
                  <button type="button" onClick={() => open(item.contact_id)} disabled={busy}>
                    <strong><bdi>{item.name}</bdi></strong>
                    <small>{when(item.next_call_at)}{new Date(item.next_call_at) < new Date() ? ` · ${t('due now')}` : ''}</small>
                  </button>
                </li>
              ))}
              {!desk.callbacks.length && <li className="cc-muted">{t('No callbacks scheduled.')}</li>}
            </ul>
          </div>
          <div className="feature-panel">
            <h3>{t('Incoming call')}</h3>
            {!inbound ? (
              <button type="button" className="secondary-action" disabled={!inboundCampaigns.length}
                onClick={() => setInbound({ ...EMPTY_INBOUND, campaign_id: inboundCampaigns[0]?.campaign_id || '' })}>＋ {t('Log an incoming call')}</button>
            ) : (
              <form className="cc-inbound" onSubmit={saveInbound}>
                <select required value={inbound.campaign_id} onChange={(event) => setInbound({ ...inbound, campaign_id: event.target.value })} aria-label={t('Line')}>
                  {inboundCampaigns.map((campaign) => <option key={campaign.campaign_id} value={campaign.campaign_id}>{campaign.name}</option>)}
                </select>
                <input required minLength="2" placeholder={t('Caller name')} value={inbound.name} onChange={(event) => setInbound({ ...inbound, name: event.target.value })} />
                <input placeholder={t('Company')} value={inbound.company} onChange={(event) => setInbound({ ...inbound, company: event.target.value })} />
                <input placeholder={t('Phone')} value={inbound.phone} onChange={(event) => setInbound({ ...inbound, phone: event.target.value })} />
                <select value={inbound.outcome} onChange={(event) => setInbound({ ...inbound, outcome: event.target.value })} aria-label={t('Outcome')}>
                  {desk.outcomes.filter((outcome) => !['NO_ANSWER', 'VOICEMAIL', 'WRONG_NUMBER'].includes(outcome)).map((outcome) => <option key={outcome} value={outcome}>{t(OUTCOME_LABELS[outcome])}</option>)}
                </select>
                {inbound.outcome === 'CALLBACK' && <input type="datetime-local" required value={inbound.callback_at} onChange={(event) => setInbound({ ...inbound, callback_at: event.target.value })} aria-label={t('Call back on')} />}
                <input type="number" min="0" max="240" placeholder={t('Minutes')} value={inbound.minutes} onChange={(event) => setInbound({ ...inbound, minutes: event.target.value })} />
                <textarea rows="2" placeholder={t('Notes')} value={inbound.notes} onChange={(event) => setInbound({ ...inbound, notes: event.target.value })} />
                <div className="cc-actions"><button type="button" className="secondary-action" onClick={() => setInbound(null)}>{t('Cancel')}</button><button type="submit" className="primary-action" disabled={busy}>{t('Save call')}</button></div>
              </form>
            )}
            {!inboundCampaigns.length && <small className="cc-muted">{t('No incoming-call line is set up yet.')}</small>}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default CcDesk
