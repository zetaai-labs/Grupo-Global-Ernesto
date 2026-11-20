import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import { config } from '../config/env.js'

fs.mkdirSync(config.uploadDir, { recursive: true })

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'application/zip',
])
const ALLOWED_EXTENSION = /\.(pdf|docx?|xlsx?|txt|csv|png|jpe?g|zip)$/i

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.uploadDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname)
    callback(null, `${Date.now()}-${randomUUID()}${extension}`)
  },
})

export { persistUpload } from '../services/storage.service.js'

export const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXTENSION.test(file.originalname)
    callback(null, allowed)
  },
})
