import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import {
  publicRegister,
  publicMembershipInfo,
  publicStatus,
  publicUploadDocument,
  publicSubmit,
  publicAddPerson,
  publicRemovePerson,
  erasePerson,
  listOrganizations,
  getOrganization,
  createOrganization,
  uploadOrganizationDocument,
  downloadOrganizationDocument,
  validateOrganization,
  recordScreening,
  runAutomaticScreening,
  addPerson,
  removePerson,
  decideOrganization,
  setOrganizationStatus,
  myOrganization,
  acceptNda,
} from '../controllers/organizations.controller.js'
import { requireRole } from '../middleware/authorize.js'
import { upload, persistUpload } from '../middleware/upload.js'
import { COMPLIANCE_ROLES, REGISTRY_READ_ROLES } from '../config/roles.js'

// Public KYC/KYB onboarding (no account). Rate-limited against abuse.
export const publicOnboardingRoutes = Router()
const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.ONBOARDING_RATE_LIMIT || 60),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
})
publicOnboardingRoutes.use(onboardingLimiter)
publicOnboardingRoutes.post('/', publicRegister)
publicOnboardingRoutes.get('/membership', publicMembershipInfo)
publicOnboardingRoutes.get('/:token', publicStatus)
publicOnboardingRoutes.post('/:token/documents', upload.single('file'), persistUpload, publicUploadDocument)
publicOnboardingRoutes.post('/:token/people', publicAddPerson)
publicOnboardingRoutes.delete('/:token/people/:personId', publicRemovePerson)
publicOnboardingRoutes.post('/:token/submit', publicSubmit)

// Authenticated routes (mounted behind authenticate).
const router = Router()
const canRead = requireRole(...REGISTRY_READ_ROLES)
const compliance = requireRole(...COMPLIANCE_ROLES)

router.get('/me', myOrganization)
router.post('/me/nda/accept', acceptNda)

router.get('/', canRead, listOrganizations)
router.post('/', requireRole('admin', 'tech_admin', ...COMPLIANCE_ROLES), createOrganization)
router.get('/:id', canRead, getOrganization)
router.post('/:id/documents', compliance, upload.single('file'), persistUpload, uploadOrganizationDocument)
router.get('/:id/documents/:docId/download', compliance, downloadOrganizationDocument)
router.post('/:id/validate', compliance, validateOrganization)
router.post('/:id/screening', compliance, recordScreening)
router.post('/:id/screening/auto', compliance, runAutomaticScreening)
router.post('/:id/people', compliance, addPerson)
router.delete('/:id/people/:personId', compliance, removePerson)
router.post('/:id/people/:personId/erase', compliance, erasePerson)
router.post('/:id/decision', compliance, decideOrganization)
router.patch('/:id/status', requireRole('admin'), setOrganizationStatus)

export default router
