import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../../../api/client'
import { useT, dateLocale } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import MatchSuggestions from '../MatchSuggestions'

const STATUS_LABELS = { REQUESTED: 'Requested', ACCEPTED: 'Accepted', DECLINED: 'Declined', CANCELLED: 'Cancelled' }

/** Event detail: join online (hybrid / online events) and B2B 1:1 meetings between participants. */
function EventPanel({ event }) {
  const t = useT()
  const navigate = useNavigate()
  const base = `/zylax/hub/events/events/${event.record_id}`
  const mode = event.data?.mode || 'IN_PERSON'
  const [participants, setParticipants] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [form, setForm] = useState({ recipient_id: '', slot_start: '', mode: mode === 'ONLINE' ? 'ONLINE' : 'IN_PERSON', message: '' })
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const [people, mine] = await Promise.all([api.get(`${base}/b2b/participants`), api.get(`${base}/b2b/meetings`)])
      setParticipants(people.data?.data || [])
      setMeetings(mine.data?.data || [])
    } catch {
      setParticipants(null)
    }
  }, [base])
  useEffect(() => { load() }, [load])

  const call = async (work) => {
    setMessage('')
    try {
      const response = await work()
      setMessage(response.data?.message || '')
      await load()
    } catch (error) {
      setMessage(error.response?.data?.message || 'The action could not be completed.')
    }
  }

  const joinOnline = async () => {
    try {
      const response = await api.get(`${base}/join`)
      navigate(`/intranet/video-conferencing?room=${encodeURIComponent(response.data.data.room)}`)
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not join the meeting.')
    }
  }

  const request = (submit) => {
    submit.preventDefault()
    call(() => api.post(`${base}/b2b/meetings`, {
      recipient_id: Number(form.recipient_id),
      slot_start: new Date(form.slot_start).toISOString(),
      mode: form.mode,
      message: form.message || null,
    })).then(() => setForm((current) => ({ ...current, recipient_id: '', message: '' })))
  }

  const when = (meeting) => new Date(meeting.slot_start).toLocaleString(dateLocale(), { dateStyle: 'short', timeStyle: 'short' })

  return (
    <section className="zx-fleet">
      <div className="zx-fleet-head">
        <strong>{t(mode === 'HYBRID' ? 'Hybrid event' : mode === 'ONLINE' ? 'Online event' : 'In-person event')}</strong>
        {mode !== 'IN_PERSON' && <button type="button" className="primary-action" onClick={joinOnline}>{t('Join online')}</button>}
      </div>
      {message && <p className="zx-fleet-message" role="status">{translateServer(message)}</p>}

      {participants === null
        ? <small className="zx-fleet-note">{t('Register for this event to book B2B meetings with other participants.')}</small>
        : (
          <>
            <MatchSuggestions
              url={`${base}/b2b/suggestions`}
              title="Suggested for you"
              onPick={(person) => setForm((current) => ({ ...current, recipient_id: String(person.user_id) }))}
              pickLabel="Choose"
            />
            <strong>{t('B2B meetings')}</strong>
            {meetings.length > 0 && (
              <ul className="zx-b2b-list">
                {meetings.map((meeting) => {
                  const other = meeting.direction === 'sent' ? meeting.recipient_name : meeting.requester_name
                  return (
                    <li key={meeting.meeting_id}>
                      <span>
                        <strong>{other}</strong>
                        <small>
                          {when(meeting)} · {meeting.slot_minutes} min · {t(meeting.mode === 'ONLINE' ? 'Online' : 'In person')}
                          {meeting.table_label ? ` · ${t('Table')} ${meeting.table_label}` : ''} · {t(STATUS_LABELS[meeting.status])}
                        </small>
                        {meeting.message && <small>“{meeting.message}”</small>}
                      </span>
                      <span className="zx-b2b-actions">
                        {meeting.direction === 'received' && meeting.status === 'REQUESTED' && (
                          <>
                            <button type="button" className="primary-action" onClick={() => call(() => api.post(`${base}/b2b/meetings/${meeting.meeting_id}/respond`, { accept: true }))}>{t('Accept')}</button>
                            <button type="button" onClick={() => call(() => api.post(`${base}/b2b/meetings/${meeting.meeting_id}/respond`, { accept: false }))}>{t('Decline')}</button>
                          </>
                        )}
                        {meeting.room && <button type="button" className="primary-action" onClick={() => navigate(`/intranet/video-conferencing?room=${encodeURIComponent(meeting.room)}`)}>{t('Join meeting')}</button>}
                        {['REQUESTED', 'ACCEPTED'].includes(meeting.status) && <button type="button" onClick={() => call(() => api.post(`${base}/b2b/meetings/${meeting.meeting_id}/cancel`))}>{t('Cancel')}</button>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            {participants.length > 0 ? (
              <form className="zx-b2b-form" onSubmit={request}>
                <select required aria-label={t('Participant')} value={form.recipient_id} onChange={(e) => setForm({ ...form, recipient_id: e.target.value })}>
                  <option value="">{t('Choose a participant…')}</option>
                  {participants.map((person) => <option key={person.id} value={person.id}>{person.name}{person.organisation ? ` · ${person.organisation}` : ''}</option>)}
                </select>
                <input required type="datetime-local" aria-label={t('When')} value={form.slot_start} onChange={(e) => setForm({ ...form, slot_start: e.target.value })} />
                {mode === 'HYBRID' && (
                  <select aria-label={t('Format')} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                    <option value="IN_PERSON">{t('In person')}</option>
                    <option value="ONLINE">{t('Online')}</option>
                  </select>
                )}
                <input maxLength={500} placeholder={t('Topic (optional)')} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                <button type="submit" className="primary-action">{t('Request meeting')}</button>
              </form>
            ) : <small className="zx-fleet-note">{t('No other confirmed participants yet.')}</small>}
            {participants.some((person) => person.video_bio_url) && (
              <small className="zx-fleet-note">
                {t('Video presentations')}:{' '}
                {participants.filter((person) => person.video_bio_url).map((person, index) => (
                  <span key={person.id}>{index ? ', ' : ''}<a href={person.video_bio_url} target="_blank" rel="noreferrer">{person.name}</a></span>
                ))}
              </small>
            )}
          </>
        )}
    </section>
  )
}

export default EventPanel
