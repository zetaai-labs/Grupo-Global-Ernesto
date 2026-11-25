import { useT } from '../../../../i18n'
import { clockAction, liveSeconds, stopwatch, useClock, useTick } from './clockStore'
import './Clock.css'

/** Top-bar clock on every intranet page: one click to clock in, pause or resume; live timer. */
function ClockButton() {
  const t = useT()
  const clock = useClock()
  const open = clock.status?.open
  useTick(Boolean(open))
  if (!clock.status) return null

  const state = !open ? 'out' : open.on_break ? 'break' : 'in'
  const live = liveSeconds(clock)
  const act = (action) => clockAction(action).catch(() => {})
  const outLabel = t('Clock out')

  return (
    <div className={`clock-pill clock-${state}`} role="group" aria-label={t('Attendance')}>
      {state === 'out' ? (
        <button type="button" className="clock-pill-main" disabled={clock.busy} onClick={() => act('in')}>
          <span aria-hidden="true">▶</span> {t('Clock in')}
        </button>
      ) : (
        <>
          <span className="clock-pill-time" title={t(state === 'break' ? 'On a break' : 'Working')}>
            <i aria-hidden="true" />{stopwatch(live.session)}
          </span>
          <button
            type="button"
            className="clock-pill-icon"
            disabled={clock.busy}
            onClick={() => act(state === 'break' ? 'break_end' : 'break_start')}
            title={t(state === 'break' ? 'End break' : 'Take a break')}
            aria-label={t(state === 'break' ? 'End break' : 'Take a break')}
          >{state === 'break' ? '▶' : '❚❚'}</button>
          <button
            type="button"
            className="clock-pill-icon clock-pill-stop"
            disabled={clock.busy}
            onClick={() => { if (window.confirm(t('Clock out now?'))) act('out') }}
            title={outLabel}
            aria-label={outLabel}
          >■</button>
        </>
      )}
    </div>
  )
}

export default ClockButton
