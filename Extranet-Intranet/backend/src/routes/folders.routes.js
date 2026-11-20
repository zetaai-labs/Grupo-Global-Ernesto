import { Router } from 'express'
import {
  listFolders,
  createFolder,
  deleteFolder,
  listPermissions,
  grantPermission,
} from '../controllers/folders.controller.js'
import { requireAdmin } from '../middleware/authorize.js'

const router = Router()

router.get('/', listFolders)
router.post('/', createFolder)
router.get('/:id/permissions', requireAdmin, listPermissions)
router.post('/:id/permissions', requireAdmin, grantPermission)
router.delete('/:id', deleteFolder)

export default router
