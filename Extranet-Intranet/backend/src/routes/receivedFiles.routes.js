import { Router } from 'express'
import { upload, persistUpload } from '../middleware/upload.js'
import {
  publicUpload,
  listReceived,
  reviewReceived,
  downloadReceived,
} from '../controllers/receivedFiles.controller.js'

export const publicReceivedRoutes = Router()
publicReceivedRoutes.post('/', upload.single('file'), persistUpload, publicUpload)

const router = Router()
router.get('/', listReceived)
router.patch('/:id', reviewReceived)
router.get('/:id/download', downloadReceived)

export default router
