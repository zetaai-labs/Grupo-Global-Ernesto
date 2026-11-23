import { query } from '../config/database.js'
import { providerConfigured, activeProvider } from '../integrations/vault/keyProvider.js'
import { livekitConfigured } from '../integrations/video/livekit.js'
import { oidcConfigured } from '../integrations/oidc/oidcClient.js'
import { streamingProvider } from './streaming.service.js'

/**
 * Read-only readiness report for system administrators.
 * It reports only setting NAMES and whether they are present. Values never leave this file.
 * "CONFIGURED" means the settings exist; it does not prove the outside service accepts them.
 */

const isSet = (name) => String(process.env[name] ?? '').trim().length > 0
const equals = (name, value) => String(process.env[name] ?? '').trim().toLowerCase() === value

const vaultSettings = () => {
  const provider = activeProvider()
  if (provider === 'aws_kms') return ['VAULT_KEY_PROVIDER', 'VAULT_KMS_KEY_ID', 'VAULT_KMS_REGION']
  if (provider === 'hashicorp') return ['VAULT_KEY_PROVIDER', 'VAULT_TRANSIT_ADDR', 'VAULT_TRANSIT_TOKEN', 'VAULT_TRANSIT_KEY']
  return ['VAULT_ENCRYPTION_KEY']
}

const streamingSettings = () => {
  if (equals('STREAMING_PROVIDER', 'mux')) return ['STREAMING_PROVIDER', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']
  if (equals('STREAMING_PROVIDER', 'cloudflare')) return ['STREAMING_PROVIDER', 'CF_STREAM_CUSTOMER_CODE', 'CF_STREAM_KEY_ID', 'CF_STREAM_PRIVATE_KEY']
  return ['STREAMING_PROVIDER']
}

/** The audit bucket can reuse the general S3 or AWS region. This does not prove Object Lock is enabled. */
const auditRegion = () => ['AUDIT_S3_REGION', 'S3_REGION', 'AWS_REGION'].find(isSet) || 'AUDIT_S3_REGION'
const auditSettings = () => ['AUDIT_S3_BUCKET', auditRegion(), 'AUDIT_RETENTION_DAYS']
const auditReady = () => isSet('AUDIT_S3_BUCKET') && isSet(auditRegion()) && Number(process.env.AUDIT_RETENTION_DAYS) > 0

/** `valid` is the code's own check, for settings that can be present but unusable. */
const BUILT = [
  { key: 'smtp', name: 'Outgoing email (SMTP)', group: 'Communication', launch: true, settings: () => ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'], off: 'Password resets, quotes and invoices cannot be emailed.' },
  { key: 'imap', name: 'Incoming email (IMAP)', group: 'Communication', launch: false, settings: () => ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS'], off: 'The Emails inbox does not receive external mail.' },
  { key: 'livekit', name: 'Large video meetings (LiveKit)', group: 'Communication', launch: false, settings: () => ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'], valid: livekitConfigured, off: 'Meetings use direct browser video, up to 8 people.' },
  { key: 'streaming', name: 'Video streaming (Mux or Cloudflare)', group: 'Communication', launch: false, settings: streamingSettings, valid: () => Boolean(streamingProvider()), off: 'Protected video streaming stays off.' },
  { key: 'storage_key', name: 'File encryption key', group: 'Security', launch: true, settings: () => ['STORAGE_ENCRYPTION_KEY'], off: 'Uploaded files and confidential fields are not protected.' },
  { key: 'vault', name: 'Investor Vault key', group: 'Security', launch: true, settings: vaultSettings, valid: () => providerConfigured(), off: 'The Investor Vault cannot open.' },
  { key: 'mfa', name: 'Mandatory MFA', group: 'Security', launch: true, settings: () => ['MFA_ENFORCE'], valid: () => equals('MFA_ENFORCE', 'true'), off: 'Admin, HR and Finance can log in without a second factor.' },
  { key: 'webauthn', name: 'Security keys (WebAuthn)', group: 'Security', launch: true, settings: () => ['WEBAUTHN_RP_ID', 'WEBAUTHN_RP_NAME'], off: 'Security keys need the production domain.' },
  { key: 'audit_lock', name: 'Tamper-proof audit storage', group: 'Security', launch: true, settings: auditSettings, valid: auditReady, off: 'Audit logs are protected in the database only.' },
  { key: 'webhook', name: 'Signed website webhooks', group: 'Security', launch: true, settings: () => ['WEBHOOK_SECRET'], off: 'Website leads cannot be received securely.' },
  { key: 'cloudflare', name: 'Cloudflare protection', group: 'Security', launch: true, settings: () => ['CLOUDFLARE_ENABLED', 'CLOUDFLARE_ORIGIN_SECRET'], valid: () => equals('CLOUDFLARE_ENABLED', 'true') && isSet('CLOUDFLARE_ORIGIN_SECRET'), off: 'The app is not behind the Cloudflare firewall.' },
  { key: 'vies', name: 'EU VAT check (VIES)', group: 'Compliance', launch: true, settings: () => ['VIES_ENABLED'], valid: () => equals('VIES_ENABLED', 'true'), off: 'VAT numbers are checked for format only.' },
  { key: 'wordpress_sso', name: 'WordPress single sign-on', group: 'Identity & accounts', launch: true, settings: () => ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI'], valid: oidcConfigured, off: 'Users sign in with email and password only.' },
  { key: 's3', name: 'Cloud file storage (S3)', group: 'Infrastructure', launch: true, settings: () => ['STORAGE_DRIVER', 'S3_BUCKET', 'S3_REGION'], valid: () => equals('STORAGE_DRIVER', 's3') && isSet('S3_BUCKET') && isSet('S3_REGION'), off: 'Files are kept on this server.' },
  { key: 'backup_offsite', name: 'Off-site backups', group: 'Infrastructure', launch: true, settings: () => ['BACKUP_TO_S3', 'S3_BUCKET', 'S3_REGION'], valid: () => equals('BACKUP_TO_S3', 'true') && isSet('S3_BUCKET') && isSet('S3_REGION'), off: 'Backups stay on this server only.' },
]

const NOT_BUILT = [
  { key: 'stripe', name: 'Stripe payments', group: 'Payments', launch: true, needs: 'Stripe account and API keys' },
  { key: 'paypal', name: 'PayPal payments', group: 'Payments', launch: true, needs: 'PayPal business account and API keys' },
  { key: 'google', name: 'Google Workspace accounts', group: 'Identity & accounts', launch: false, needs: 'Google Workspace admin credentials' },
  { key: 'microsoft', name: 'Microsoft 365 accounts', group: 'Identity & accounts', launch: false, needs: 'Microsoft 365 admin credentials' },
  { key: 'aml', name: 'Automatic AML screening', group: 'Compliance', launch: true, needs: 'Chosen AML provider and API key' },
  { key: 'ai_engine', name: 'AI engine', group: 'AI', launch: false, needs: 'AI server and vector database' },
]

function evaluate(item) {
  const settings = [...new Set(item.settings())]
  const missing = settings.filter((name) => !isSet(name))
  const allPresent = missing.length === 0
  const usable = item.valid ? Boolean(item.valid()) : allPresent
  let status = 'NOT_SET'
  if (allPresent && usable) status = 'CONFIGURED'
  else if (missing.length < settings.length) status = 'PARTIAL'
  return {
    key: item.key, name: item.name, group: item.group, launch: item.launch, status, built: true,
    settings: settings.map((name) => ({ name, present: isSet(name) })),
    when_off: status === 'CONFIGURED' ? null : item.off,
  }
}

export async function integrationReport() {
  const parent = await query(`SELECT billing_address FROM organizations WHERE org_type = 'PARENT' ORDER BY created_at LIMIT 1`)
  const hasAddress = Boolean(parent.rows[0]?.billing_address?.trim()) || isSet('COMPANY_ADDRESS')
  const company = {
    key: 'company_address', name: 'Company billing address', group: 'Compliance', launch: true, built: true,
    status: hasAddress ? 'CONFIGURED' : 'NOT_SET',
    settings: [{ name: 'COMPANY_ADDRESS', present: hasAddress }],
    when_off: hasAddress ? null : 'Invoices do not show the legal company address.',
  }
  const items = [
    ...BUILT.map(evaluate),
    company,
    ...NOT_BUILT.map(({ needs, ...item }) => ({ ...item, status: 'NOT_BUILT', built: false, settings: [], needs, when_off: null })),
  ]
  const count = (status) => items.filter((item) => item.status === status).length
  return {
    items,
    summary: {
      total: items.length,
      configured: count('CONFIGURED'),
      partial: count('PARTIAL'),
      not_set: count('NOT_SET'),
      not_built: count('NOT_BUILT'),
      launch_blockers: items.filter((item) => item.launch && item.status !== 'CONFIGURED').length,
    },
  }
}
