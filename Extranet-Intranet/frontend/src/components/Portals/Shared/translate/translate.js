import api from '../../../../api/client'
import { getLanguage } from '../../../../i18n'

/** Content translation (ES, EN, AR, HI, RU) through POST /api/ai/translate, with a per-session memory cache. */

export const TARGETS = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ru', label: 'Русский' },
  { code: 'fr', label: 'Français' },
]
const KEY = 'gg_translate_to'
const memory = new Map()
let status = null

/** The language people want content translated into: their choice, else the screen language. */
export function translateTarget() {
  try {
    const saved = window.localStorage.getItem(KEY)
    if (TARGETS.some((item) => item.code === saved)) return saved
  } catch { /* ignore */ }
  const ui = getLanguage()
  return TARGETS.some((item) => item.code === ui) ? ui : 'en'
}

export function setTranslateTarget(code) {
  try { window.localStorage.setItem(KEY, code) } catch { /* ignore */ }
}

/** Whether translation is switched on (an AI key is set). Asked once per page load. */
export function translationAvailable() {
  if (!status) status = api.get('/ai/status').then((response) => Boolean(response.data?.data?.configured)).catch(() => false)
  return status
}

export async function translateText(text, target) {
  const key = `${target}\u0000${text}`
  if (memory.has(key)) return memory.get(key)
  const response = await api.post('/ai/translate', { text, target })
  const result = response.data.data
  memory.set(key, result)
  return result
}
