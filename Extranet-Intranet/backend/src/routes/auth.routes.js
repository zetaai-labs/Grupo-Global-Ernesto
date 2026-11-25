import { Router } from 'express'
import { deleteAvatar, receiveAvatar, saveAvatar } from '../controllers/profile.controller.js'
import { rateLimit } from 'express-rate-limit'
import {
  login,
  me,
  logout,
  mfaSetup,
  mfaEnable,
  mfaDisable,
  mfaVerify,
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
  logoutEverywhere,
} from '../controllers/auth.controller.js'
import {
  listKeys,
  loginOptions,
  loginVerify,
  registerOptions,
  registerVerify,
  removeKey,
} from '../controllers/webauthn.controller.js'
import { oidcCallback, oidcComplete, oidcStart, oidcStatus } from '../controllers/oidc.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { exportMyData } from '../controllers/users.controller.js'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Strict in production; relaxed locally so demos/tests can switch accounts freely.
  limit: Number(process.env.LOGIN_RATE_LIMIT || (process.env.NODE_ENV === 'production' ? 10 : 100)),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
})

router.post('/login', loginLimiter, login)
router.post('/mfa/verify', loginLimiter, mfaVerify)
router.post('/mfa/webauthn/login/options', loginLimiter, loginOptions)
router.post('/mfa/webauthn/login/verify', loginLimiter, loginVerify)
router.post('/password-reset/request', loginLimiter, requestPasswordReset)
router.post('/password-reset/confirm', loginLimiter, confirmPasswordReset)

router.get('/oidc/status', oidcStatus)
router.get('/oidc/start', loginLimiter, oidcStart)
router.get('/oidc/callback', loginLimiter, oidcCallback)
router.post('/oidc/complete', loginLimiter, oidcComplete)

router.get('/me', authenticate, me)
router.put('/me/avatar', authenticate, receiveAvatar, saveAvatar)
router.delete('/me/avatar', authenticate, deleteAvatar)
router.get('/me/export', authenticate, exportMyData)
router.post('/logout', authenticate, logout)
router.post('/password', authenticate, loginLimiter, changePassword)
router.post('/logout-everywhere', authenticate, logoutEverywhere)
router.post('/mfa/setup', authenticate, mfaSetup)
router.post('/mfa/enable', authenticate, mfaEnable)
router.post('/mfa/disable', authenticate, mfaDisable)
router.get('/mfa/webauthn/credentials', authenticate, listKeys)
router.post('/mfa/webauthn/register/options', authenticate, loginLimiter, registerOptions)
router.post('/mfa/webauthn/register/verify', authenticate, loginLimiter, registerVerify)
router.delete('/mfa/webauthn/credentials/:id', authenticate, loginLimiter, removeKey)

export default router
