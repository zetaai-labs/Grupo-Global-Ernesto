import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { config } from '../config/env.js'
import { query } from '../config/database.js'

/**
 * Chat messages encrypted at rest (AES-256-GCM). The key is derived from STORAGE_ENCRYPTION_KEY
 * with its own label, so it is independent from the file and record keys.
 *
 * This protects database copies and backups. It is not end-to-end encryption: the server can
 * read messages in order to deliver them. Messages written before encryption was switched on
 * stay readable and are encrypted by encryptExistingMessages().
 */

const PREFIX = 'enc:v1:'

export const chatEncryptionOn = () => Boolean(config.storage.encryptionKey)

function key() {
  return Buffer.from(hkdfSync('sha256', Buffer.from(config.storage.encryptionKey, 'base64'), Buffer.alloc(0), 'chat-messages-v1', 32))
}

export function sealMessage(text) {
  if (!chatEncryptionOn()) return text
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`
}

export function openMessage(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value
  if (!chatEncryptionOn()) return '[encrypted message]'
  try {
    const [iv, tag, body] = value.slice(PREFIX.length).split(':')
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return '[message could not be decrypted]'
  }
}

/** Encrypts messages stored in plain text, in batches. Returns how many were encrypted. */
export async function encryptExistingMessages(batch = 500) {
  if (!chatEncryptionOn()) return 0
  let total = 0
  for (;;) {
    const { rows } = await query(`SELECT id, body FROM messages WHERE body NOT LIKE '${PREFIX}%' ORDER BY id LIMIT $1`, [batch])
    if (!rows.length) return total
    for (const row of rows) {
      await query('UPDATE messages SET body = $2 WHERE id = $1 AND body = $3', [row.id, sealMessage(row.body), row.body])
    }
    total += rows.length
    if (rows.length < batch) return total
  }
}
