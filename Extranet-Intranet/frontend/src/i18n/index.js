import { useCallback, useSyncExternalStore } from 'react'
import es from './es'
import './rtl.css'

/**
 * Minimal i18n: English text is the key; Spanish, Arabic, Russian and French come from ./es.js, ./ar.js, ./ru.js, ./fr.js.
 * Missing translations fall back to English, so screens never break.
 * The choice is remembered per browser.
 */

const STORAGE_KEY = 'gg_language'
const DICTIONARIES = { es }
// Arabic, Russian and French are downloaded only when someone picks them.
const LOADERS = { ar: () => import('./ar'), ru: () => import('./ru'), fr: () => import('./fr') }
export const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'es', label: 'ES', name: 'Español' },
  { code: 'ar', label: 'AR', name: 'العربية', dir: 'rtl' },
  { code: 'ru', label: 'RU', name: 'Русский' },
  { code: 'fr', label: 'FR', name: 'Français' },
]
const CODES = LANGUAGES.map((item) => item.code)

/** Sets the page language and reading direction (Arabic is right-to-left). */
function applyToDocument(code) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = code
  document.documentElement.dir = LANGUAGES.find((item) => item.code === code)?.dir || 'ltr'
}

function initialLanguage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (CODES.includes(saved)) return saved
  } catch {
    // Storage unavailable (private mode): fall through.
  }
  const device = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase().slice(0, 2) : 'en'
  return CODES.includes(device) ? device : 'en'
}

let language = typeof window === 'undefined' ? 'en' : initialLanguage()
// Bumped when a dictionary arrives, so screens re-render with it.
let version = 0
const listeners = new Set()

function notify() {
  version += 1
  listeners.forEach((listener) => listener())
  shareWithServiceWorker()
}

/**
 * Gives the service worker the current dictionary, so phone/desktop alerts that arrive while the app is
 * closed are shown in the person's language (public/sw.js translates the title and text).
 */
let sharedKey = ''
function shareWithServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const dict = language === 'en' ? null : DICTIONARIES[language]
  if (language !== 'en' && !dict) return
  const key = `${language}:${Boolean(dict)}`
  if (key === sharedKey) return
  sharedKey = key
  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage({ type: 'gg-i18n', lang: language, dict }))
    .catch(() => { sharedKey = '' })
}

function ensureDictionary(code) {
  if (DICTIONARIES[code] || !LOADERS[code]) return
  LOADERS[code]()
    .then((module) => {
      DICTIONARIES[code] = module.default
      if (code === language) notify()
    })
    .catch(() => {
      // Offline or failed download: the screen stays in English.
    })
}

applyToDocument(language)
ensureDictionary(language)
shareWithServiceWorker()

export function getLanguage() {
  return language
}

// Locale for dates and times. Arabic keeps Latin digits so dates match the numbers elsewhere.
const DATE_LOCALES = { en: 'en-GB', es: 'es-ES', ar: 'ar-u-nu-latn', ru: 'ru-RU', fr: 'fr-FR' }

/** Locale to pass to toLocaleDateString / toLocaleTimeString / toLocaleString. */
export function dateLocale() {
  return DATE_LOCALES[language] || 'en-GB'
}

export function setLanguage(next) {
  if (next === language || !LANGUAGES.some((item) => item.code === next)) return
  language = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not persisted; still applies for this session.
  }
  applyToDocument(next)
  ensureDictionary(next)
  notify()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Translates `text`; `{name}` placeholders are filled from `values`. */
export function translate(text, values) {
  const dictionary = DICTIONARIES[language]
  const template = dictionary?.[text] ?? text
  // Development only: remember texts that have no translation, for the coverage check.
  if (import.meta.env.DEV && dictionary && typeof window !== 'undefined' && !(text in dictionary)) {
    ;(window.__i18nMissing ||= new Set()).add(text)
  }
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match))
}

/** React hook: returns `t(text, values)` and re-renders when the language changes. */
const getSnapshot = () => `${language}:${version}`

export function useT() {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => 'en:0')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((text, values) => translate(text, values), [current])
}

/** React hook: current language code. */
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, () => 'en')
}
