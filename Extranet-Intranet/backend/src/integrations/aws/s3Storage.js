import fs from 'node:fs'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
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

export default { s3Configured, putFile, getFile, deleteFile }
