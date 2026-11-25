import { useEffect, useState } from 'react'
import api from '../api/client'
import { useT } from '../i18n'
import { alertState, disableAlerts, enableAlerts, syncAlerts } from './push'

/** "Phone & desktop alerts" switch for this device, shown in the notification panel. */
function AlertsToggle() {
  const t = useT()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true
    syncAlerts().then(alertState).then((next) => { if (alive) setState(next) }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!state) return null
  if (state.needsInstall) return <p className="alerts-toggle-note">{t('On iPhone or iPad, add this app to your Home Screen first to receive alerts.')}</p>
  if (!state.supported || !state.available) return null

  const on = state.subscribed && state.permission === 'granted'
  const toggle = async () => {
    setBusy(true)
    setMessage('')
    try {
      if (on) {
        await disableAlerts()
      } else {
        const permission = await enableAlerts()
        if (permission === 'denied') setMessage(t('Alerts are blocked in this browser. Allow notifications for this site in the browser settings.'))
      }
      setState(await alertState())
    } catch (error) {
      setMessage(t(error?.message === 'timeout' ? 'The alert service did not answer. Check your connection and try again.' : 'Alerts could not be turned on. Try again.'))
    } finally {
      setBusy(false)
    }
  }
  const test = async () => {
    try {
      await api.post('/push/test')
      setMessage(t('Test alert sent.'))
    } catch {
      setMessage(t('The action could not be completed.'))
    }
  }

  return (
    <div className="alerts-toggle">
      <label>
        <input type="checkbox" role="switch" checked={on} disabled={busy || state.permission === 'denied'} onChange={toggle} />
        <span>{t('Phone & desktop alerts on this device')}</span>
      </label>
      {on && <button type="button" onClick={test}>{t('Send test')}</button>}
      {state.permission === 'denied' && !message && <p className="alerts-toggle-note">{t('Alerts are blocked in this browser. Allow notifications for this site in the browser settings.')}</p>}
      {message && <p className="alerts-toggle-note" role="status">{message}</p>}
    </div>
  )
}

export default AlertsToggle
