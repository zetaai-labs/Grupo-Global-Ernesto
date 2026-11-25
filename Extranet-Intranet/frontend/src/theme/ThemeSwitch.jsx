import { setTheme, useTheme } from './index'
import { useT } from '../i18n'
import './ThemeSwitch.css'

/** Sun / moon button that switches between light and dark mode. */
function ThemeSwitch({ className = '' }) {
  const t = useT()
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className={`theme-switch ${className}`}
      onClick={() => setTheme(next)}
      aria-label={t(next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode')}
      title={t(next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode')}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  )
}

export default ThemeSwitch
