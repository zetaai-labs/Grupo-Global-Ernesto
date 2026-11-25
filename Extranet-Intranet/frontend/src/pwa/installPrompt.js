// Keeps the browser's install prompt (Chrome, Edge, Android) so a button can show it later.
let deferred = null
const listeners = new Set()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event
    listeners.forEach((listener) => listener())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((listener) => listener())
  })
}

export const canInstall = () => Boolean(deferred)

export function onInstallChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Shows the browser's install dialog. Resolves true when the user accepts. */
export async function promptInstall() {
  if (!deferred) return false
  const event = deferred
  deferred = null
  listeners.forEach((listener) => listener())
  await event.prompt()
  const choice = await event.userChoice.catch(() => null)
  return choice?.outcome === 'accepted'
}
