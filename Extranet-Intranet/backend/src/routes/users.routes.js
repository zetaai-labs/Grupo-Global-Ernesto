import { Router } from 'express'
import {
  listUsers,
  getUser,
  createUser,
  updateUserStatus,
  listMetadata,
  exportUser,
  eraseUserAccount,
} from '../controllers/users.controller.js'
import { requireAdmin } from '../middleware/authorize.js'

const router = Router()

// Mounted behind authenticate + requireRole('admin', 'hr') in app.js.
// HR can read the user directory; only admins can create or suspend accounts.
router.get('/', listUsers)
router.get('/meta', listMetadata)
router.get('/:id', getUser)
router.post('/', requireAdmin, createUser)
router.patch('/:id/status', requireAdmin, updateUserStatus)
router.get('/:id/export', requireAdmin, exportUser)
router.post('/:id/erase', requireAdmin, eraseUserAccount)

export default router
