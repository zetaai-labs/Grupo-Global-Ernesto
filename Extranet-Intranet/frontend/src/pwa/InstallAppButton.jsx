import { useSyncExternalStore } from 'react'
import { useT } from '../i18n'
import { canInstall, onInstallChange, promptInstall } from './installPrompt'
import '../theme/ThemeSwitch.css'

/** "Install app" button, shown only when the browser offers installation. */
function InstallAppButton() {
  const t = useT()
  const available = useSyncExternalStore(onInstallChange, canInstall, () => false)
  if (!available) return null
  return (
    <button type="button" className="theme-switch" onClick={() => promptInstall()} title={t('Install the app')} aria-label={t('Install the app')}>
      ⤓
    </button>
  )
}

export default InstallAppButton
