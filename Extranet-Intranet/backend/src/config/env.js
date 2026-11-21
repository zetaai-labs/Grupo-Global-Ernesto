import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config()

const required = ['JWT_SECRET', 'DATABASE_URL']
const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
}

export const config = {
  port: Number(process.env.PORT || 5000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  seedUserPassword: process.env.SEED_USER_PASSWORD || '',
  uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'storage/uploads'),
  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    encryptionKey: process.env.STORAGE_ENCRYPTION_KEY || '',
    backupToS3: process.env.BACKUP_TO_S3 === 'true',
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || process.env.AWS_REGION || '',
      endpoint: process.env.S3_ENDPOINT || '',
      kmsKeyId: process.env.S3_KMS_KEY_ID || '',
    },
  },
  integrations: {
    // Shared secret for HMAC-SHA256 signed webhooks from the WordPress site (Technical Spec §2.1).
    webhookSecret: process.env.WEBHOOK_SECRET || '',
  },
  security: {
    // Technical Spec §3.1 — mandatory MFA for Super Admin, Tech Admin and HR.
    enforceMfa: process.env.MFA_ENFORCE === 'true',
  },
  jobs: {
    backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS || 24),
    recycleBinRetentionDays: Math.max(1, Number(process.env.RECYCLE_BIN_RETENTION_DAYS || 30)),
  },
  imap: {
    host: process.env.IMAP_HOST || '',
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_SECURE !== 'false',
    user: process.env.IMAP_USER || '',
    pass: process.env.IMAP_PASS || '',
    mailbox: process.env.IMAP_MAILBOX || 'INBOX',
    lookbackDays: Number(process.env.IMAP_LOOKBACK_DAYS || 7),
    syncMinutes: Number(process.env.IMAP_SYNC_MINUTES || 5),
    fallbackRecipient: process.env.IMAP_FALLBACK_RECIPIENT || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'no-reply@grupoglobal.es',
  },
}
