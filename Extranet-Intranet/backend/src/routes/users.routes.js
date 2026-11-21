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
import { requireAdmin, requireSystemAdmin } from '../middleware/authorize.js'

const router = Router()

// Mounted behind authenticate + requireRole('admin', 'hr') in app.js.
// HR can read the directory; Super/Tech Admin manage accounts; only the Super Admin erases (GDPR).
router.get('/', listUsers)
router.get('/meta', listMetadata)
router.get('/:id', getUser)
router.post('/', requireSystemAdmin, createUser)
router.patch('/:id/status', requireSystemAdmin, updateUserStatus)
router.get('/:id/export', requireAdmin, exportUser)
router.post('/:id/erase', requireAdmin, eraseUserAccount)

export default router
