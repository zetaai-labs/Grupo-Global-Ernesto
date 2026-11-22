import { randomBytes } from 'node:crypto'

/**
 * Key providers for the Investor Vault (Technical Spec §3.1).
 *  - local (default): VAULT_ENCRYPTION_KEY, used directly for `v1:` records.
 *  - aws_kms: envelope encryption with an AWS KMS key.
 *  - hashicorp: envelope encryption with HashiCorp Vault Transit.
 *
 * If an external provider is selected but not configured, the vault fails closed:
 * it never silently falls back to the weaker local key for new records.
 */

const ENCRYPTION_CONTEXT = { purpose: 'gg-investor-vault' }
const PAYLOAD_TAGS = { aws_kms: 'kms', hashicorp: 'transit' }
const PROVIDER_BY_TAG = { kms: 'aws_kms', transit: 'hashicorp' }

let kmsClient = null

/** Test hook: supplies a mock KMS client (pass null to reset). */
export function setKmsClientForTests(client) {
  kmsClient = client
}

export function activeProvider() {
  return String(process.env.VAULT_KEY_PROVIDER || 'local').trim().toLowerCase()
}

export const payloadTag = (provider) => PAYLOAD_TAGS[provider] || null
export const providerForTag = (tag) => PROVIDER_BY_TAG[tag] || null

export function localKey() {
  const key = Buffer.from(process.env.VAULT_ENCRYPTION_KEY || '', 'base64')
  if (key.length !== 32) {
    throw Object.assign(new Error('The Investor Vault is not configured (VAULT_ENCRYPTION_KEY).'), { status: 503 })
  }
  return key
}

function transitConfig() {
  const address = String(process.env.VAULT_TRANSIT_ADDR || '').replace(/\/+$/, '')
  return {
    address,
    token: process.env.VAULT_TRANSIT_TOKEN || '',
    key: process.env.VAULT_TRANSIT_KEY || '',
    mount: String(process.env.VAULT_TRANSIT_MOUNT || 'transit').replace(/^\/+|\/+$/g, ''),
    namespace: process.env.VAULT_TRANSIT_NAMESPACE || '',
  }
}

function transitAddressAllowed(address) {
  try {
    const url = new URL(address)
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  } catch {
    return false
  }
}

export function providerConfigured(provider = activeProvider()) {
  if (provider === 'local') {
    try {
      localKey()
      return true
    } catch {
      return false
    }
  }
  if (provider === 'aws_kms') {
    return Boolean(process.env.VAULT_KMS_KEY_ID && (process.env.VAULT_KMS_REGION || process.env.AWS_REGION))
  }
  if (provider === 'hashicorp') {
    const transit = transitConfig()
    return Boolean(transit.token && transit.key && transitAddressAllowed(transit.address))
  }
  return false
}

function requireProvider(provider) {
  if (!providerConfigured(provider)) {
    throw Object.assign(new Error(`The Investor Vault key provider "${provider}" is not configured.`), { status: 503 })
  }
}

async function getKms() {
  if (kmsClient) return kmsClient
  const { KMSClient } = await import('@aws-sdk/client-kms')
  kmsClient = new KMSClient({ region: process.env.VAULT_KMS_REGION || process.env.AWS_REGION })
  return kmsClient
}

async function transitCall(path, body) {
  const transit = transitConfig()
  const response = await fetch(`${transit.address}/v1/${transit.mount}/${path}/${encodeURIComponent(transit.key)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vault-token': transit.token,
      ...(transit.namespace ? { 'x-vault-namespace': transit.namespace } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) {
    // Never include the response body: it could echo key material or request data.
    throw Object.assign(new Error(`HashiCorp Vault request failed (${response.status}).`), { status: 503 })
  }
  return (await response.json()).data
}

/** Creates a one-time 256-bit data key: returns it in plaintext and wrapped by the provider. */
export async function generateDataKey(provider) {
  requireProvider(provider)
  if (provider === 'aws_kms') {
    const { GenerateDataKeyCommand } = await import('@aws-sdk/client-kms')
    const client = await getKms()
    const result = await client.send(new GenerateDataKeyCommand({
      KeyId: process.env.VAULT_KMS_KEY_ID,
      KeySpec: 'AES_256',
      EncryptionContext: ENCRYPTION_CONTEXT,
    }))
    return { plaintext: Buffer.from(result.Plaintext), wrapped: Buffer.from(result.CiphertextBlob).toString('base64') }
  }
  if (provider === 'hashicorp') {
    const data = await transitCall('datakey/plaintext', { bits: 256 })
    return { plaintext: Buffer.from(data.plaintext, 'base64'), wrapped: Buffer.from(data.ciphertext, 'utf8').toString('base64') }
  }
  throw Object.assign(new Error('This key provider does not use data keys.'), { status: 500 })
}

/** Asks the provider to unwrap a stored data key. */
export async function unwrapDataKey(provider, wrapped) {
  requireProvider(provider)
  if (provider === 'aws_kms') {
    const { DecryptCommand } = await import('@aws-sdk/client-kms')
    const client = await getKms()
    const result = await client.send(new DecryptCommand({
      KeyId: process.env.VAULT_KMS_KEY_ID,
      CiphertextBlob: Buffer.from(wrapped, 'base64'),
      EncryptionContext: ENCRYPTION_CONTEXT,
    }))
    return Buffer.from(result.Plaintext)
  }
  if (provider === 'hashicorp') {
    const data = await transitCall('decrypt', { ciphertext: Buffer.from(wrapped, 'base64').toString('utf8') })
    return Buffer.from(data.plaintext, 'base64')
  }
  throw Object.assign(new Error('Unknown vault key provider.'), { status: 500 })
}

export function newIv() {
  return randomBytes(12)
}
