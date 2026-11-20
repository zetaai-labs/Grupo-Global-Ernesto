import { Router } from 'express'
import {
  listShares,
  createShare,
  deleteShare,
  sharedWithMe,
  sharedLinks,
  listRecipients,
  downloadSharedFile,
} from '../controllers/externalShares.controller.js'
import { requireIntranet } from '../middleware/authorize.js'

const router = Router()

// Partner-facing reads (any authenticated user).
router.get('/shared-with-me', sharedWithMe)
router.get('/shared-links', sharedLinks)
router.get('/shared-with-me/files/:id/download', downloadSharedFile)

// Management is internal only.
router.get('/', requireIntranet, listShares)
router.get('/recipients', requireIntranet, listRecipients)
router.post('/', requireIntranet, createShare)
router.delete('/:id', requireIntranet, deleteShare)

export default router
