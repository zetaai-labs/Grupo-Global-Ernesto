import { useEffect, useState } from 'react'
import api from '../../../api/client'
import { getLanguage } from '../../../i18n'

let statusPromise = null

/** true once the server says the AI assistant is configured (checked once per page load). */
export function useAiEnabled() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    statusPromise ||= api.get('/ai/status').then((response) => Boolean(response.data?.data?.configured)).catch(() => false)
    let alive = true
    statusPromise.then((value) => { if (alive) setEnabled(value) })
    return () => { alive = false }
  }, [])
  return enabled
}

/** POSTs to an AI endpoint with the user's language. */
export const askAi = (path, body = {}) => api.post(`/ai${path}`, { ...body, lang: getLanguage() }, { timeout: 120 * 1000 })
