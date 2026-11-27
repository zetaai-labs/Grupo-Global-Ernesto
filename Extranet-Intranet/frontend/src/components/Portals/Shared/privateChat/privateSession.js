// The unlocked private key lives only in this tab's memory: closing or reloading the tab locks it again.
// Public keys and conversation keys are cached here too, so each is fetched and derived once.
import api from '../../../../api/client'
import { conversationKey } from './e2ee'

let unlocked = null // { keyId, privateKey }
const publicKeys = new Map()
const conversationKeys = new Map()
const listeners = new Set()

export const getUnlocked = () => unlocked
export function setUnlocked(value) {
  unlocked = value
  conversationKeys.clear()
  listeners.forEach((listener) => listener())
}
export function onUnlockChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Public keys by id (several at once), from the cache or the server. */
export async function loadPublicKeys(ids) {
  const missing = [...new Set(ids)].filter((id) => id && !publicKeys.has(id))
  if (missing.length) {
    const response = await api.get('/chat/e2ee/keys', { params: { ids: missing.join(',') } })
    for (const row of response.data?.data || []) publicKeys.set(row.key_id, row.public_jwk)
  }
  return publicKeys
}

/** The shared AES key for one conversation and one pair of keys (my current key + one of theirs). */
export async function sharedKey(conversationId, theirKeyId) {
  if (!unlocked) return null
  const cacheKey = `${conversationId}:${unlocked.keyId}:${theirKeyId}`
  if (!conversationKeys.has(cacheKey)) {
    const keys = await loadPublicKeys([theirKeyId])
    const theirs = keys.get(theirKeyId)
    if (!theirs) return null
    conversationKeys.set(cacheKey, conversationKey(unlocked.privateKey, theirs, conversationId, unlocked.keyId, theirKeyId))
  }
  return conversationKeys.get(cacheKey)
}
