import express, { Router } from 'express'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { listCourses, getCourse, createCourse, enroll, submitQuiz, verifyCertificate } from '../controllers/courses.controller.js'
import {
  uploadPackage, deletePackage, launchPackage, saveRuntime,
  contentHeaders, contentAuth, serveContent, xapiAbout, xapiPostStatements, xapiPutStatement, xapiGetStatements, xapiState,
} from '../controllers/coursePackage.controller.js'
import { LIMITS } from '../services/coursePackage.service.js'

// SCORM / xAPI packages are .zip files; they are unpacked and checked before anything is stored.
const packageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.zipBytes, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, /\.zip$/i.test(file.originalname || '')),
})

function receivePackage(req, res, next) {
  packageUpload.single('file')(req, res, (error) => {
    if (!error) return next()
    const tooLarge = error.code === 'LIMIT_FILE_SIZE'
    return res.status(tooLarge ? 413 : 400).json({ message: tooLarge ? `The package is larger than ${Math.round(LIMITS.zipBytes / 1048576)} MB.` : 'Choose a SCORM or xAPI .zip file.' })
  })
}

// Mounted behind authenticate. Access tiers are enforced in the controller.
const router = Router()
router.get('/', listCourses)
router.post('/', createCourse)
router.get('/:id', getCourse)
router.post('/:id/enroll', enroll)
router.post('/:id/submit', submitQuiz)
router.post('/:id/package', receivePackage, uploadPackage)
router.delete('/:id/package', deletePackage)
router.post('/:id/package/launch', launchPackage)
router.post('/:id/package/runtime', saveRuntime)

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

/**
 * Sandboxed package content and the xAPI endpoint, addressed by a signed token in the path.
 * Mounted before the app-wide CORS rule: sandboxed pages have an opaque ("null") origin.
 */
export const courseContentRoutes = Router()
const xapiJson = express.json({ limit: '2mb', type: ['application/json', 'application/*+json'] })
const xapiRaw = express.raw({ type: () => true, limit: '1mb' })
courseContentRoutes.use(rateLimit({ windowMs: 60 * 1000, limit: 3000, standardHeaders: 'draft-7', legacyHeaders: false }))
courseContentRoutes.use(contentHeaders)
courseContentRoutes.get('/:token/xapi/about', xapiAbout)
courseContentRoutes.post('/:token/xapi/statements', contentAuth, xapiJson, xapiPostStatements)
courseContentRoutes.put('/:token/xapi/statements', contentAuth, xapiJson, xapiPutStatement)
courseContentRoutes.get('/:token/xapi/statements', contentAuth, xapiGetStatements)
courseContentRoutes.all('/:token/xapi/activities/state', contentAuth, xapiRaw, xapiState)
courseContentRoutes.get('/:token/*path', contentAuth, serveContent)

export default router
