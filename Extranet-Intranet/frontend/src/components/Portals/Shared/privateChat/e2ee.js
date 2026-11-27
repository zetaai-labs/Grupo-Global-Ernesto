/**
 * End-to-end encryption for private chats, using only the browser's Web Crypto API.
 *
 * - Each person has an ECDH P-256 key pair made in their browser.
 * - The private key is encrypted (AES-256-GCM) with a key derived from their passphrase (PBKDF2-SHA-256,
 *   310,000 rounds) before it is sent to the server, so the server never holds it in readable form.
 * - Two people derive the same secret (ECDH), turned into a per-conversation AES-256-GCM key with HKDF.
 * - Each message names the two keys used, so earlier messages stay readable to the other person after one
 *   side resets a forgotten passphrase.
 *
 * Plain module (no React), so the server tests run exactly this code.
 */

export const KDF_ITERATIONS = 310000
export const MESSAGE_PREFIX = 'e2ee:v1:'
const subtle = () => globalThis.crypto.subtle
const encode = (text) => new TextEncoder().encode(text)
const decode = (bytes) => new TextDecoder().decode(bytes)

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
export const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
const random = (length) => globalThis.crypto.getRandomValues(new Uint8Array(length))

async function passphraseKey(passphrase, salt, iterations) {
  const material = await subtle().importKey('raw', encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** A new identity, ready to store on the server: public key, and the private key locked with the passphrase. */
export async function createIdentity(passphrase, iterations = KDF_ITERATIONS) {
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const { kty, crv, x, y } = await subtle().exportKey('jwk', pair.publicKey)
  const pkcs8 = await subtle().exportKey('pkcs8', pair.privateKey)
  const salt = random(16)
  const iv = random(12)
  const sealed = await subtle().encrypt({ name: 'AES-GCM', iv }, await passphraseKey(passphrase, salt, iterations), pkcs8)
  const wrapped = new Uint8Array(iv.length + sealed.byteLength)
  wrapped.set(iv)
  wrapped.set(new Uint8Array(sealed), iv.length)
  return { public_jwk: { kty, crv, x, y }, wrapped_private: toBase64(wrapped), kdf_salt: toBase64(salt), kdf_iterations: iterations }
}

/** Opens the stored private key with the passphrase. Returns null when the passphrase is wrong. */
export async function unlockIdentity(stored, passphrase) {
  try {
    const wrapped = fromBase64(stored.wrapped_private)
    const key = await passphraseKey(passphrase, fromBase64(stored.kdf_salt), stored.kdf_iterations)
    const pkcs8 = await subtle().decrypt({ name: 'AES-GCM', iv: wrapped.subarray(0, 12) }, key, wrapped.subarray(12))
    // Not extractable: once unlocked, the key can be used but never read out again.
    return await subtle().importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  } catch {
    return null
  }
}

/** The AES key two people share for one conversation, from my private key and their public key. */
export async function conversationKey(myPrivateKey, theirPublicJwk, conversationId, myKeyId, theirKeyId) {
  const theirs = await subtle().importKey('jwk', { ...theirPublicJwk, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const secret = await subtle().deriveBits({ name: 'ECDH', public: theirs }, myPrivateKey, 256)
  const hkdf = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encode(`gg-e2ee-v1:${conversationId}`), info: encode([myKeyId, theirKeyId].sort().join(':')) },
    hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

/** Splits a stored message into its parts, or null when it is not an encrypted message. */
export function parseMessage(body) {
  const match = /^e2ee:v1:([0-9a-f-]{36}):([0-9a-f-]{36}):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/.exec(String(body || ''))
  return match ? { senderKeyId: match[1], recipientKeyId: match[2], iv: match[3], data: match[4] } : null
}

const binding = (conversationId, senderKeyId, recipientKeyId) => encode(`${conversationId}:${senderKeyId}:${recipientKeyId}`)

export async function encryptMessage(key, text, conversationId, senderKeyId, recipientKeyId) {
  const iv = random(12)
  const data = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: binding(conversationId, senderKeyId, recipientKeyId) }, key, encode(text))
  return `${MESSAGE_PREFIX}${senderKeyId}:${recipientKeyId}:${toBase64(iv)}:${toBase64(data)}`
}

/** Returns the text, or null when it cannot be read (wrong key, or the message was changed). */
export async function decryptMessage(key, parsed, conversationId) {
  try {
    const plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(parsed.iv), additionalData: binding(conversationId, parsed.senderKeyId, parsed.recipientKeyId) },
      key, fromBase64(parsed.data),
    )
    return decode(plain)
  } catch {
    return null
  }
}

/** Short, human-checkable fingerprint of a public key, so two people can confirm they talk to each other. */
export async function fingerprint(publicJwk) {
  const digest = await subtle().digest('SHA-256', encode(`${publicJwk.crv}:${publicJwk.x}:${publicJwk.y}`))
  return toBase64(digest).replace(/[^A-Za-z0-9]/g, '').slice(0, 20).toUpperCase().match(/.{1,4}/g).join(' ')
}
