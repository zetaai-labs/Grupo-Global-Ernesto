import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { query } from '../config/database.js'
import { writeAudit } from './audit.js'
import { notifyRoles } from './notification.service.js'

/**
 * Investor Vault (Schema Document §4.4, Technical Spec §3.1).
 * Profiles are encrypted with a key that is separate from all other platform keys
 * (VAULT_ENCRYPTION_KEY). In production this key is supplied by AWS KMS or HashiCorp Vault.
 */

const VERSION = 'v1'

function vaultKey() {
  const raw = process.env.VAULT_ENCRYPTION_KEY || ''
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw Object.assign(new Error('The Investor Vault is not configured (VAULT_ENCRYPTION_KEY).'), { status: 503 })
  }
  return key
}

export function vaultConfigured() {
  try {
    vaultKey()
    return true
  } catch {
    return false
  }
}

/** AES-256-GCM: "v1:<iv>:<tag>:<ciphertext>" (base64 parts). */
export function encryptProfile(profile) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(profile), 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decryptProfile(payload) {
  const [version, iv, tag, ciphertext] = String(payload).split(':')
  if (version !== VERSION) throw new Error('Unknown vault payload version.')
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()])
  return JSON.parse(plain.toString('utf8'))
}

/** Appends an entry to the record's own cryptographic access log and to the platform audit log. */
export async function logVaultAccess(req, investorId, action, details = {}) {
  const entry = { at: new Date().toISOString(), user_id: req.user?.sub || null, role: req.user?.role || null, ip: req.ip, action, ...details }
  if (investorId) {
    await query(
      `UPDATE investors_vault SET access_audit_log = access_audit_log || $2::jsonb WHERE investor_id = $1`,
      [investorId, JSON.stringify([entry])],
    )
  }
  await writeAudit(req.user?.sub || null, `VAULT_${action}`, 'investors_vault', investorId, { ip: req.ip, ...details })
}

/**
 * Schema Document §5.1/§5.2: an unauthorised vault access attempt is denied, logged,
 * and the security team (Super Admin) is alerted. Such attempts are Tier-3 offences.
 */
export async function denyAndAlert(req, res) {
  await writeAudit(req.user?.sub || null, 'VAULT_UNAUTHORIZED_ATTEMPT', 'investors_vault', null, {
    ip: req.ip, path: req.originalUrl, role: req.user?.role || null,
  })
  await notifyRoles(['admin'], {
    type: 'security',
    title: 'Security alert: unauthorised Investor Vault access attempt',
    body: `${req.user?.name || 'Unknown user'} (${req.user?.role || 'no role'}) tried ${req.method} ${req.originalUrl}`,
    link: '/intranet/audit-log',
  })
  return res.status(403).json({ message: 'Access to the Investor Vault is restricted. This attempt has been logged.' })
}
