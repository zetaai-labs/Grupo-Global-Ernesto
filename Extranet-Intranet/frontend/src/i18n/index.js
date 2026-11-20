import { useCallback, useSyncExternalStore } from 'react'
import es from './es'

/**
 * Minimal i18n: English text is the key; Spanish comes from ./es.js.
 * Missing translations fall back to English, so screens never break.
 * The choice is remembered per browser.
 */

const STORAGE_KEY = 'gg_language'
const DICTIONARIES = { es }
export const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'es', label: 'ES', name: 'Español' },
]

function initialLanguage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'es') return saved
  } catch {
    // Storage unavailable (private mode): fall through.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

let language = typeof window === 'undefined' ? 'en' : initialLanguage()
const listeners = new Set()

if (typeof document !== 'undefined') document.documentElement.lang = language

export function getLanguage() {
  return language
}

export function setLanguage(next) {
  if (next === language || !LANGUAGES.some((item) => item.code === next)) return
  language = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not persisted; still applies for this session.
  }
  document.documentElement.lang = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Translates `text`; `{name}` placeholders are filled from `values`. */
export function translate(text, values) {
  const template = DICTIONARIES[language]?.[text] ?? text
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match))
}

/** React hook: returns `t(text, values)` and re-renders when the language changes. */
export function useT() {
  const current = useSyncExternalStore(subscribe, getLanguage, () => 'en')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((text, values) => translate(text, values), [current])
}

/** React hook: current language code. */
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, () => 'en')
}
