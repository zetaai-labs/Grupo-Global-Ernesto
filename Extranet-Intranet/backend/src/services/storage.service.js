import fs from 'node:fs'
import path from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { config } from '../config/env.js'
import * as s3 from '../integrations/aws/s3Storage.js'

/**
 * File storage for every upload in the platform.
 *  - driver "s3":    objects in S3 with server-side encryption (SSE-S3 or SSE-KMS).
 *  - driver "local": files on disk, encrypted with AES-256-GCM when STORAGE_ENCRYPTION_KEY is set.
 * Files written before encryption was enabled stay readable (detected by header).
 */

const MAGIC = Buffer.from('GGENC1')
const IV_LENGTH = 12
const TAG_LENGTH = 16
const HEADER_LENGTH = MAGIC.length + IV_LENGTH

const s3Key = (storedName) => `uploads/${path.basename(storedName)}`
const localPath = (storedName) => path.join(config.uploadDir, path.basename(storedName))

export function storageDriver() {
  return config.storage.driver === 's3' && s3.s3Configured() ? 's3' : 'local'
}

function encryptionKey() {
  const raw = config.storage.encryptionKey
  if (!raw) return null
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('STORAGE_ENCRYPTION_KEY must be 32 bytes, base64-encoded.')
  return key
}

/** Encrypts a local file in place (AES-256-GCM). */
async function encryptInPlace(filePath, key) {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const tempPath = `${filePath}.enc-tmp`
  const output = fs.createWriteStream(tempPath)
  output.write(Buffer.concat([MAGIC, iv]))
  await pipeline(fs.createReadStream(filePath), cipher, output, { end: false })
  await new Promise((resolve, reject) => {
    output.end(cipher.getAuthTag(), (error) => (error ? reject(error) : resolve()))
  })
  fs.renameSync(tempPath, filePath)
}

function isEncrypted(filePath) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(MAGIC.length)
    const read = fs.readSync(fd, header, 0, MAGIC.length, 0)
    return read === MAGIC.length && header.equals(MAGIC)
  } finally {
    fs.closeSync(fd)
  }
}

/** Opens a readable stream of the plaintext of a local file (decrypting if needed). */
function openLocal(filePath) {
  const { size } = fs.statSync(filePath)
  if (!isEncrypted(filePath)) return { stream: fs.createReadStream(filePath), size }

  const key = encryptionKey()
  if (!key) throw new Error('File is encrypted but STORAGE_ENCRYPTION_KEY is not set.')
  const fd = fs.openSync(filePath, 'r')
  const iv = Buffer.alloc(IV_LENGTH)
  const tag = Buffer.alloc(TAG_LENGTH)
  fs.readSync(fd, iv, 0, IV_LENGTH, MAGIC.length)
  fs.readSync(fd, tag, 0, TAG_LENGTH, size - TAG_LENGTH)
  fs.closeSync(fd)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const source = fs.createReadStream(filePath, { start: HEADER_LENGTH, end: size - TAG_LENGTH - 1 })
  source.on('error', (error) => decipher.destroy(error))
  return { stream: source.pipe(decipher), size: size - HEADER_LENGTH - TAG_LENGTH }
}

/**
 * Express middleware placed after multer: moves the uploaded file into permanent storage
 * (S3, or encrypted on local disk). `req.file.filename` remains the stored name.
 */
export async function persistUpload(req, _res, next) {
  if (!req.file) return next()
  const filePath = req.file.path
  try {
    if (storageDriver() === 's3') {
      await s3.putFile(s3Key(req.file.filename), filePath, req.file.mimetype)
      fs.unlinkSync(filePath)
    } else {
      const key = encryptionKey()
      if (key) await encryptInPlace(filePath, key)
    }
    return next()
  } catch (error) {
    try { fs.unlinkSync(filePath) } catch { /* already gone */ }
    return next(error)
  }
}

function contentDisposition(name) {
  const fallback = String(name).replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** Streams a stored file to the client as a download. Returns false if it does not exist. */
export async function sendStoredFile(res, storedName, downloadName, mimeType, { inline = false } = {}) {
  let stream
  let size
  let type = mimeType

  if (storageDriver() === 's3') {
    try {
      const object = await s3.getFile(s3Key(storedName))
      stream = object.body
      size = object.contentLength
      type = type || object.contentType
    } catch (error) {
      if (error.name === 'NoSuchKey') return false
      throw error
    }
  } else {
    const filePath = localPath(storedName)
    if (!fs.existsSync(filePath)) return false
    ;({ stream, size } = openLocal(filePath))
  }

  // Headers only once the file is known to exist.
  res.setHeader('Content-Disposition', inline ? 'inline' : contentDisposition(downloadName))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Type', type || 'application/octet-stream')
  if (size) res.setHeader('Content-Length', size)
  await pipeline(stream, res)
  return true
}

/** Permanently deletes stored files (missing files are ignored). */
export async function removeStoredFiles(storedNames) {
  for (const name of storedNames) {
    try {
      if (storageDriver() === 's3') await s3.deleteFile(s3Key(name))
      else if (fs.existsSync(localPath(name))) fs.unlinkSync(localPath(name))
    } catch {
      // A missing/locked object must not block the database purge.
    }
  }
}

/** Reads a stored file fully into memory (used by tests and small internal tools). */
export async function readStoredFile(storedName) {
  if (storageDriver() === 's3') {
    const object = await s3.getFile(s3Key(storedName))
    return Buffer.from(await object.body.transformToByteArray())
  }
  const chunks = []
  for await (const chunk of openLocal(localPath(storedName)).stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** Copies a local backup file to S3 (off-site). No-op unless S3 backups are enabled. */
export async function uploadBackupOffsite(filePath) {
  if (!config.storage.backupToS3 || !s3.s3Configured()) return null
  const key = `backups/${path.basename(filePath)}`
  await s3.putFile(key, filePath, 'application/sql')
  return key
}

export default { storageDriver, persistUpload, sendStoredFile, removeStoredFiles, readStoredFile, uploadBackupOffsite }
