import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { listCourses, getCourse, createCourse, enroll, submitQuiz, verifyCertificate } from '../controllers/courses.controller.js'

// Mounted behind authenticate + requireIntranet. Access tiers are enforced in the controller.
const router = Router()
router.get('/', listCourses)
router.post('/', createCourse)
router.get('/:id', getCourse)
router.post('/:id/enroll', enroll)
router.post('/:id/submit', submitQuiz)

/** Public verification of a certificate by its SHA-256 code. */
export const publicCertificateRoutes = Router()
publicCertificateRoutes.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
}))
publicCertificateRoutes.get('/:hash', verifyCertificate)

export default router
