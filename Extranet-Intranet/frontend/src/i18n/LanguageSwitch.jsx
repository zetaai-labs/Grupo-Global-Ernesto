import { LANGUAGES, setLanguage, useLanguage } from './index'
import './LanguageSwitch.css'

/** Compact EN | ES toggle. */
function LanguageSwitch({ className = '' }) {
  const current = useLanguage()
  return (
    <div className={`language-switch ${className}`} role="group" aria-label="Language / Idioma">
      {LANGUAGES.map((language) => (
        <button
          key={language.code}
          type="button"
          lang={language.code}
          title={language.name}
          aria-pressed={current === language.code}
          className={current === language.code ? 'active' : ''}
          onClick={() => setLanguage(language.code)}
        >
          {language.label}
        </button>
      ))}
    </div>
  )
}

export default LanguageSwitch
