import { useState } from 'react'
import { useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { askAi, useAiEnabled } from '../ai'

/** "Ask in your own words": Claude turns the request into this list's status and search filters. */
function AiSmartSearch({ moduleKey, entityKey, onFilters }) {
  const t = useT()
  const enabled = useAiEnabled()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  if (!enabled) return null

  const submit = async (event) => {
    event.preventDefault()
    if (text.trim().length < 3) return
    setBusy(true)
    setNote('')
    try {
      const response = await askAi(`/zylax/${moduleKey}/${entityKey}/search`, { query: text.trim() })
      const { status, q, explanation } = response.data.data
      onFilters({ status, q })
      setNote(explanation)
    } catch (error) {
      setNote(error.response?.data?.message || 'The AI assistant could not be reached. Try again later.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="ai-search" onSubmit={submit}>
      <input
        type="search"
        aria-label={t('Ask AI to filter this list')}
        placeholder={t('✨ Ask in your own words, e.g. “urgent tickets still open”')}
        value={text}
        maxLength={300}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="zh-secondary" disabled={busy}>{busy ? t('Thinking…') : t('Ask AI')}</button>
      {note && <small className="zx-fleet-note" role="status">{translateServer(note)}</small>}
    </form>
  )
}

export default AiSmartSearch
