import { useEffect, useState } from 'react'
import { useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { TARGETS, translateTarget, translateText, translationAvailable } from './translate'
import './Translate.css'

/**
 * Shows `text` with a "Translate" link (when an AI key is set). `sourceLang` hides the link when the text is
 * already in the target language. Never use it for end-to-end encrypted messages: it sends the text to the server.
 */
function TranslateText({ text, sourceLang = null, as: Tag = 'p', className = '' }) {
  const t = useT()
  const [available, setAvailable] = useState(false)
  const [result, setResult] = useState(null)
  const [showing, setShowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const target = translateTarget()

  useEffect(() => {
    let alive = true
    translationAvailable().then((value) => { if (alive) setAvailable(value) })
    return () => { alive = false }
  }, [])

  const toggle = async () => {
    if (showing) { setShowing(false); return }
    if (result?.target === target) { setShowing(true); return }
    setBusy(true)
    setError('')
    try {
      setResult(await translateText(text, target))
      setShowing(true)
    } catch (failure) {
      setError(translateServer(failure.response?.data?.message) || t('The text could not be translated.'))
    } finally {
      setBusy(false)
    }
  }

  const label = TARGETS.find((item) => item.code === target)?.label || target
  const canTranslate = available && text?.trim() && sourceLang !== target
  const shownText = showing && result ? result.translation : text
  const rtl = showing && result?.target === 'ar'

  return (
    <>
      <Tag className={className} dir={showing && result ? (rtl ? 'rtl' : 'ltr') : 'auto'} lang={showing && result ? result.target : sourceLang || undefined}>{shownText}</Tag>
      {canTranslate && (
        <span className="tr-bar">
          <button type="button" className="tr-link" onClick={toggle} disabled={busy} aria-pressed={showing}>
            {busy ? t('Translating…') : showing ? t('Show original') : t('Translate to {language}', { language: label })}
          </button>
          {showing && <small className="tr-note">{t('Machine translation')}</small>}
          {error && <small className="tr-error" role="status">{error}</small>}
        </span>
      )}
    </>
  )
}

export default TranslateText
