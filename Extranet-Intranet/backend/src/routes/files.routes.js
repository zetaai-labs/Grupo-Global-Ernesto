import { Router } from 'express'
import { upload, persistUpload } from '../middleware/upload.js'
import { listFiles, uploadFile, downloadFile, deleteFile } from '../controllers/files.controller.js'

const router = Router()

router.get('/', listFiles)
router.post('/', upload.single('file'), persistUpload, uploadFile)
router.get('/:id/download', downloadFile)
router.delete('/:id', deleteFile)

export default router
