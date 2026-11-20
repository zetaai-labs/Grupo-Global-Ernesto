import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../../../../api/client'
import { getUser } from '../../../../../api/auth'
import './Calendar.css'
import { useT } from '../../../../../i18n'

const EMPTY_FORM = { title: '', starts_at: '', ends_at: '', description: '', online: true, attendee_ids: [] }
const EXTERNAL = ['partner', 'client', 'supplier']
const RESPONSE_LABELS = { pending: 'Invited', accepted: 'Accepted', declined: 'Declined' }

function dayKey(value) {
  return new Date(value).toDateString()
}

function dayLabel(value) {
  const date = new Date(value)
  const today = new Date()
  const tomorrow = new Date(Date.now() + 86400000)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

const timeOf = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function Calendar() {
  const t = useT()
  const navigate = useNavigate()
  const user = getUser()
  const [events, setEvents] = useState([])
  const [people, setPeople] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [eventList, inviteeList] = await Promise.all([
        api.get('/content/calendar/events', { params: { upcoming: 'true' } }),
        api.get('/content/calendar/invitees'),
      ])
      setEvents(eventList.data?.data || [])
      setPeople(inviteeList.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load events.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selected = events.find((event) => event.id === selectedId) || null

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const event of events) {
      const key = dayKey(event.starts_at)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(event)
    }
    return [...groups.entries()]
  }, [events])

  const toggleAttendee = (id) => {
    setForm((current) => ({
      ...current,
      attendee_ids: current.attendee_ids.includes(id)
        ? current.attendee_ids.filter((item) => item !== id)
        : [...current.attendee_ids, id],
    }))
  }

  const create = async (event) => {
    event.preventDefault()
    try {
      await api.post('/content/calendar/events', {
        title: form.title,
        description: form.description || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        online: form.online,
        attendee_ids: form.attendee_ids,
      })
      setNotice(form.attendee_ids.length ? `Event created — ${form.attendee_ids.length} invitation(s) sent.` : 'Event created.')
      setForm(EMPTY_FORM)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not create the event.')
    }
  }

  const respond = async (event, response) => {
    try {
      const result = await api.post(`/content/calendar/events/${event.id}/respond`, { response })
      setNotice(result.data?.message)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not send your response.')
    }
  }

  const cancel = async (event) => {
    if (!window.confirm(`Cancel “${event.title}”? Attendees will be notified.`)) return
    try {
      await api.delete(`/content/calendar/events/${event.id}`)
      setSelectedId(null)
      setNotice('Event cancelled and attendees notified.')
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not cancel the event.')
    }
  }

  const staff = people.filter((person) => !EXTERNAL.includes(person.role))
  const external = people.filter((person) => EXTERNAL.includes(person.role))

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('COLLABORATION')}</div>
          <h1>{t('Calendar')}</h1>
          <p>{t('Schedule meetings, invite colleagues and partners, and join online meetings in one click.')}</p>
        </div>
      </div>

      {notice && <div className="cloud-notice" role="status">{notice}</div>}

      <div className="calendar-layout">
        <div className="feature-panel">
          <div className="panel-heading"><div><h3>New event</h3><p>Invitees are notified and reminded 15 minutes before it starts.</p></div></div>
          <form className="calendar-form" onSubmit={create}>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Event title" required />
            <label className="calendar-field">Starts
              <input type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} required />
            </label>
            <label className="calendar-field">Ends
              <input type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} />
            </label>
            <label className="calendar-check">
              <input type="checkbox" checked={form.online} onChange={(event) => setForm({ ...form, online: event.target.checked })} />
              Online meeting (creates a private video room)
            </label>

            <fieldset className="calendar-invitees">
              <legend>Invite ({form.attendee_ids.length} selected)</legend>
              {[['Colleagues', staff], ['Partners, clients & suppliers', external]].map(([label, group]) => group.length > 0 && (
                <div key={label}>
                  <small>{label}</small>
                  <div className="invitee-chips">
                    {group.map((person) => (
                      <button
                        type="button"
                        key={person.id}
                        className={form.attendee_ids.includes(person.id) ? 'selected' : ''}
                        aria-pressed={form.attendee_ids.includes(person.id)}
                        onClick={() => toggleAttendee(person.id)}
                      >
                        {person.name} <em>{person.role}</em>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>

            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Agenda / description" rows="3" />
            <button type="submit" className="primary-action">＋ Create event</button>
          </form>
        </div>

        <aside className="feature-panel calendar-side">
          <div className="panel-heading"><div><h3>Event details</h3><p>Select an event to see attendees.</p></div></div>
          {selected ? (
            <div className="calendar-detail">
              <h4>{selected.title}</h4>
              <p><strong>When:</strong> {new Date(selected.starts_at).toLocaleString()}{selected.ends_at && ` – ${timeOf(selected.ends_at)}`}</p>
              <p><strong>Organiser:</strong> {selected.owner}</p>
              {selected.description && <p>{selected.description}</p>}

              {selected.attendees.length > 0 && (
                <ul className="attendee-list">
                  {selected.attendees.map((attendee) => (
                    <li key={attendee.id}>
                      <span>{attendee.name} <em>{attendee.role}</em></span>
                      <span className={`rsvp rsvp-${attendee.response}`}>{RESPONSE_LABELS[attendee.response]}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="calendar-actions">
                {selected.video_room && (
                  <button type="button" className="primary-action" onClick={() => navigate(`/intranet/video-conferencing?room=${selected.video_room}`)}>
                    📹 Join meeting
                  </button>
                )}
                {selected.my_response && selected.my_response !== 'accepted' && (
                  <button type="button" onClick={() => respond(selected, 'accepted')}>Accept</button>
                )}
                {selected.my_response && selected.my_response !== 'declined' && (
                  <button type="button" onClick={() => respond(selected, 'declined')}>Decline</button>
                )}
                {(selected.created_by === user?.id || user?.role === 'admin') && (
                  <button type="button" className="calendar-cancel" onClick={() => cancel(selected)}>Cancel event</button>
                )}
              </div>
            </div>
          ) : (
            <p className="cloud-empty">No event selected.</p>
          )}
        </aside>
      </div>

      <div className="feature-panel">
        <div className="panel-heading"><div><h3>Agenda</h3><p>{events.length} upcoming event(s).</p></div></div>
        {grouped.length ? (
          <div className="calendar-agenda">
            {grouped.map(([key, dayEvents]) => (
              <div key={key} className="agenda-day">
                <h4>{dayLabel(dayEvents[0].starts_at)}</h4>
                {dayEvents.map((event) => (
                  <button
                    type="button"
                    className={`calendar-row ${selectedId === event.id ? 'selected' : ''}`}
                    key={event.id}
                    onClick={() => setSelectedId(event.id)}
                  >
                    <span className="agenda-time">{timeOf(event.starts_at)}</span>
                    <span className="list-item-copy">
                      <strong>{event.video_room ? '📹 ' : ''}{event.title}</strong>
                      <span>
                        {event.owner}
                        {event.attendees.length > 0 && ` · ${event.attendees.length} invited`}
                        {event.my_response && ` · you: ${RESPONSE_LABELS[event.my_response].toLowerCase()}`}
                      </span>
                    </span>
                    <span className="list-item-arrow">↗</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="feature-empty-state">
            <div className="empty-icon">◷</div>
            <h3>No upcoming events</h3>
            <p>Create an event to get started.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default Calendar
