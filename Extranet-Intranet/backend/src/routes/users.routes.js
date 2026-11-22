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
import { requireAdmin, requireRole } from '../middleware/authorize.js'
import { ACCOUNT_MANAGER_ROLES } from '../config/roles.js'

const router = Router()
const canManageAccounts = requireRole(...ACCOUNT_MANAGER_ROLES)

// Mounted behind authenticate + requireRole('admin', 'tech_admin', 'hr') in app.js.
// Super/Tech Admin manage accounts; HR manages employees and managers; only the Super Admin erases (GDPR).
router.get('/', listUsers)
router.get('/meta', listMetadata)
router.get('/:id', getUser)
router.post('/', canManageAccounts, createUser)
router.patch('/:id/status', canManageAccounts, updateUserStatus)
router.get('/:id/export', requireAdmin, exportUser)
router.post('/:id/erase', requireAdmin, eraseUserAccount)

export default router
