import { useState } from 'react'
import { useT } from '../../../i18n'
import { askAi, useAiEnabled } from './ai'
import { translateServer } from '../../../i18n/serverMessages'
import './AiAssistant.css'

const SECTIONS = [
  ['key_facts', 'Key facts'], ['key_points', 'Key points'], ['next_steps', 'Next steps'],
  ['action_items', 'Action items'], ['risks', 'Watch out for'],
]

/** Button + result card. `path` is the AI endpoint, e.g. /zylax/helpdesk/tickets/<id>/summary. */
export function AiSummaryButton({ path, label = 'AI summary' }) {
  const t = useT()
  const enabled = useAiEnabled()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  if (!enabled) return null

  const run = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await askAi(path)
      setResult(response.data?.data || null)
    } catch (err) {
      setError(err.response?.data?.message || 'The AI assistant could not be reached. Try again later.')
    } finally {
      setBusy(false)
    }
  }

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(`${result.email_subject}\n\n${result.email_body}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="ai-box">
      <button type="button" className="ai-button" onClick={run} disabled={busy}>✨ {busy ? t('Thinking…') : t(label)}</button>
      {error && <p className="ai-error" role="alert">{translateServer(error)}</p>}
      {result && (
        <section className="ai-result" aria-live="polite">
          {result.summary && <p>{result.summary}</p>}
          {result.next_action && <p><strong>{t('Next step')}:</strong> {result.next_action}</p>}
          {SECTIONS.map(([key, heading]) => (Array.isArray(result[key]) && result[key].length > 0 ? (
            <div key={key}>
              <strong>{t(heading)}</strong>
              <ul>{result[key].map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null))}
          {result.email_body && (
            <div className="ai-email">
              <strong>{t('Draft email')}</strong>
              <p className="ai-email-subject">{result.email_subject}</p>
              <pre>{result.email_body}</pre>
              <button type="button" onClick={copyEmail}>{copied ? t('Copied') : t('Copy email')}</button>
            </div>
          )}
          <small>{t('Written by AI from the data you can see. Check it before using it.')}</small>
        </section>
      )}
    </div>
  )
}
