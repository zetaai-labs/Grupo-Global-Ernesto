import fs from 'node:fs'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetObjectLockConfigurationCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { config } from '../../config/env.js'

let client = null

export function s3Configured() {
  return Boolean(config.storage.s3.bucket && config.storage.s3.region)
}

function getClient() {
  if (!client) {
    client = new S3Client({
      region: config.storage.s3.region,
      // Credentials come from the standard AWS chain (env vars, instance role, ~/.aws).
      ...(config.storage.s3.endpoint ? { endpoint: config.storage.s3.endpoint, forcePathStyle: true } : {}),
    })
  }
  return client
}

/** Server-side encryption: SSE-KMS when a key id is configured, otherwise SSE-S3 (AES-256). */
function encryptionParams() {
  return config.storage.s3.kmsKeyId
    ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: config.storage.s3.kmsKeyId }
    : { ServerSideEncryption: 'AES256' }
}

export async function putFile(key, localPath, contentType) {
  const { size } = fs.statSync(localPath)
  await getClient().send(new PutObjectCommand({
    Bucket: config.storage.s3.bucket,
    Key: key,
    Body: fs.createReadStream(localPath),
    ContentLength: size,
    ContentType: contentType || 'application/octet-stream',
    ...encryptionParams(),
  }))
}

export async function getFile(key) {
  const result = await getClient().send(new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }))
  return { body: result.Body, contentType: result.ContentType, contentLength: result.ContentLength }
}

export async function deleteFile(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }))
}

// ----- Write-once audit storage (separate bucket with S3 Object Lock) -----

let auditClient = null
const getAuditClient = () => {
  if (!auditClient) {
    auditClient = new S3Client({
      region: config.audit.region,
      ...(config.storage.s3.endpoint ? { endpoint: config.storage.s3.endpoint, forcePathStyle: true } : {}),
    })
  }
  return auditClient
}

export const auditStore = {
  configured: () => Boolean(config.audit.bucket && config.audit.region && config.audit.retentionDays > 0),
  mode: () => config.audit.lockMode,
  retentionDays: () => config.audit.retentionDays,
  async lockEnabled() {
    const result = await getAuditClient().send(new GetObjectLockConfigurationCommand({ Bucket: config.audit.bucket }))
    return result.ObjectLockConfiguration?.ObjectLockEnabled === 'Enabled'
  },
  /** Returns false when the key already exists; an existing locked object is never replaced. */
  async put({ key, body, checksum, retainUntil }) {
    try {
      await getAuditClient().send(new PutObjectCommand({
        Bucket: config.audit.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/ld+json',
        ChecksumSHA256: checksum,
        IfNoneMatch: '*',
        ObjectLockMode: config.audit.lockMode,
        ObjectLockRetainUntilDate: retainUntil,
        ServerSideEncryption: 'AES256',
      }))
      return true
    } catch (error) {
      if (error.$metadata?.httpStatusCode === 412) return false
      throw error
    }
  },
  async head(key) {
    const result = await getAuditClient().send(new HeadObjectCommand({ Bucket: config.audit.bucket, Key: key, ChecksumMode: 'ENABLED' }))
    return { checksum: result.ChecksumSHA256, retainUntil: result.ObjectLockRetainUntilDate }
  },
  async read(key) {
    const result = await getAuditClient().send(new GetObjectCommand({ Bucket: config.audit.bucket, Key: key }))
    return Buffer.from(await result.Body.transformToByteArray())
  },
}

export default { s3Configured, putFile, getFile, deleteFile }
