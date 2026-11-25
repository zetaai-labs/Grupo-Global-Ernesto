import { useState } from 'react'
import { dateLocale, useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { clockAction, duration, liveSeconds, stopwatch, useClock, useTick } from './clockStore'
import './Clock.css'

/** Big "start my day" card: clock in, take a break, clock out, and hours worked so far. */
function ClockCard({ showLeave = false, onChange }) {
  const t = useT()
  const clock = useClock()
  const [message, setMessage] = useState('')
  const status = clock.status
  const open = status?.open
  useTick(Boolean(open))

  if (!status) return null
  const live = liveSeconds(clock)
  const state = !open ? 'out' : open.on_break ? 'break' : 'in'
  const time = (iso) => new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })

  const run = async (action) => {
    if (action === 'out' && !window.confirm(t('Clock out now? You have worked {time} today.', { time: duration(t, live.today) }))) return
    try {
      const result = await clockAction(action)
      if (!result) return
      if (action === 'in') setMessage(t(result.late ? 'Clocked in (late).' : 'Clocked in.'))
      else if (action === 'out') setMessage(t('Clocked out. You worked {time}.', { time: duration(t, result.worked_seconds) }))
      else setMessage(t(action === 'break_start' ? 'Break started. Your time is paused.' : 'Welcome back. Your time is running again.'))
      onChange?.()
    } catch (error) {
      setMessage(translateServer(error.response?.data?.message || t('The action could not be completed.')))
    }
  }

  return (
    <section className={`clock-card clock-${state}`} aria-label={t('Attendance')}>
      <div className="clock-card-main">
        <span className="clock-state"><i aria-hidden="true" />{t(state === 'out' ? 'Not clocked in' : state === 'break' ? 'On a break' : 'Working')}</span>
        <strong className="clock-timer" aria-live="off">{stopwatch(open ? live.session : live.today)}</strong>
        <small>
          {open
            ? t('Since {time}', { time: time(open.clock_in) }) + (live.breakSeconds >= 60 ? ` · ${t('Breaks: {time}', { time: duration(t, live.breakSeconds) })}` : '')
            : live.today ? t('Worked today. Press Clock in to continue.') : t('Press Clock in to start your working day.')}
        </small>
        {open?.long_shift && <small className="clock-warning">{t('This shift has been open for more than 14 hours. Did you forget to clock out?')}</small>}
      </div>

      <div className="clock-card-totals">
        <div><span>{t('Today')}</span><b>{duration(t, live.today)}</b></div>
        <div><span>{t('This week')}</span><b>{duration(t, live.week)}</b></div>
        {showLeave && <div><span>{t('Annual leave')}</span><b>{status.leave_total - status.leave_used} / {status.leave_total} {t('days left')}</b></div>}
      </div>

      <div className="clock-card-actions">
        {state === 'out' && <button type="button" className="clock-btn clock-btn-in" disabled={clock.busy} onClick={() => run('in')}>▶ {t('Clock in')}</button>}
        {state === 'in' && <button type="button" className="clock-btn clock-btn-break" disabled={clock.busy} onClick={() => run('break_start')}>❚❚ {t('Take a break')}</button>}
        {state === 'break' && <button type="button" className="clock-btn clock-btn-in" disabled={clock.busy} onClick={() => run('break_end')}>▶ {t('End break')}</button>}
        {state !== 'out' && <button type="button" className="clock-btn clock-btn-out" disabled={clock.busy} onClick={() => run('out')}>■ {t('Clock out')}</button>}
      </div>
      {message && <small className="clock-message" role="status">{message}</small>}
    </section>
  )
}

export default ClockCard
