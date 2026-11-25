import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import { config } from './config/env.js'
import authRoutes from './routes/auth.routes.js'
import userRoutes from './routes/users.routes.js'
import folderRoutes from './routes/folders.routes.js'
import fileRoutes from './routes/files.routes.js'
import recycleBinRoutes from './routes/recycleBin.routes.js'
import auditLogRoutes from './routes/auditLogs.routes.js'
import metaLinkRoutes from './routes/metaLinks.routes.js'
import publicLinkRoutes from './routes/publicLinks.routes.js'
import workflowRoutes from './routes/workflows.routes.js'
import chatRoutes from './routes/chat.routes.js'
import emailRoutes from './routes/emails.routes.js'
import dashboardRoutes from './routes/dashboard.routes.js'
import receivedRoutes, { publicReceivedRoutes } from './routes/receivedFiles.routes.js'
import externalShareRoutes from './routes/externalShares.routes.js'
import backupRoutes from './routes/backups.routes.js'
import contentRoutes from './routes/content.routes.js'
import notificationRoutes from './routes/notifications.routes.js'
import pushRoutes from './routes/push.routes.js'
import { createSupportRequest, showAvatar, supportInfo } from './controllers/profile.controller.js'
import { rateLimit } from 'express-rate-limit'
import organizationRoutes, { publicOnboardingRoutes } from './routes/organizations.routes.js'
import crmRoutes, { crmWebhookRoutes } from './routes/crm.routes.js'
import communityRoutes, { videoWebhookRoutes } from './routes/community.routes.js'
import privacyRoutes from './routes/privacy.routes.js'
import courseRoutes, { publicCertificateRoutes, courseContentRoutes } from './routes/courses.routes.js'
import governanceRoutes from './routes/governance.routes.js'
import vaultRoutes from './routes/vault.routes.js'
import projectRoutes from './routes/projects.routes.js'
import videoRoutes from './routes/video.routes.js'
import aiRoutes from './routes/ai.routes.js'
import commercialRoutes, { commercialPortalRoutes } from './routes/commercial.routes.js'
import zylaxRoutes from './zylax/routes.js'
import integrationRoutes from './routes/integrations.routes.js'
import billingRoutes, { paymentWebhookRoutes } from './routes/billing.routes.js'
import { endNavSession, navPreflight, navScript, navSession, startNavSession } from './controllers/nav.controller.js'
import provisioningRoutes from './routes/provisioning.routes.js'
import { PROVISIONING_ROLES } from './controllers/provisioning.controller.js'
import importRoutes from './imports/routes.js'
import { COMMERCIAL_READ_ROLES, COMMERCIAL_CUSTOMER_ROLES } from './config/roles.js'
import { cloudflareEdge } from './middleware/cloudflare.js'
import { authenticate } from './middleware/authenticate.js'
import { requireIntranet, requireRole, requireSystemAdmin } from './middleware/authorize.js'
import { databaseCheck, errorHandler, requestMonitor, systemHealth } from './monitoring/monitor.js'

const allowedOrigins = config.frontendOrigin.split(',').map((origin) => origin.trim())

export const isAllowedOrigin = (origin) => {
  if (!origin || allowedOrigins.includes(origin)) return true
  // Development convenience only — never allow arbitrary localhost ports in production.
  return process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost:\d+$/.test(origin)
}

export const corsOrigin = (origin, callback) =>
  isAllowedOrigin(origin)
    ? callback(null, true)
    : callback(new Error('Origin not allowed by CORS'))

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  // Request ID, timing and the access log line come first so every response carries them.
  app.use(requestMonitor)

  // Without this, every user behind nginx would share one IP and one login rate limit.
  const hops = Number(process.env.TRUST_PROXY_HOPS || 0)
  app.set('trust proxy', Number.isInteger(hops) && hops >= 1 && hops <= 5 ? hops : false)

  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    strictTransportSecurity: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  }))

  app.use(cloudflareEdge)

  // Public navigation for the WordPress site: its own origin check, so it sits before the app-wide CORS rule.
  app.get('/api/public/nav.js', navScript)
  app.options('/api/public/nav/session', navPreflight)
  app.get('/api/public/nav/session', navSession)

  // SCORM / xAPI package content: sandboxed pages have an opaque origin, so this sits before the CORS rule.
  app.use('/api/course-content', courseContentRoutes)

  app.use(cors({ origin: corsOrigin, credentials: true }))
  // Keep the raw body so signed webhooks (HMAC-SHA256) can be verified byte-for-byte.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { req.rawBody = buffer.toString('utf8') } }))

  app.get('/', (_req, res) => res.send('Extranet-Intranet backend is running!'))

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'success', message: 'Intranet/Extranet backend is running' })
  })
  // Readiness for load balancers and uptime monitors: 503 when the database does not answer.
  app.get('/api/health/ready', async (_req, res) => {
    const database = await databaseCheck()
    res.status(database.ok ? 200 : 503).json({ status: database.ok ? 'ok' : 'down', database: { ok: database.ok, ms: database.ms } })
  })
  app.get('/api/monitoring', authenticate, requireSystemAdmin, async (_req, res) => {
    res.json({ data: await systemHealth() })
  })

  app.post('/api/auth/nav-session', authenticate, startNavSession)
  app.delete('/api/auth/nav-session', endNavSession)
  app.use('/api/auth', authRoutes)

  // Admin-only routes.
  app.use('/api/users', authenticate, requireRole('admin', 'tech_admin', 'hr'), userRoutes)
  app.use('/api/audit-logs', authenticate, requireSystemAdmin, auditLogRoutes)
  app.use('/api/integrations', authenticate, requireSystemAdmin, integrationRoutes)
  app.use('/api/billing', authenticate, billingRoutes)
  app.use('/api/provisioning', authenticate, requireRole(...PROVISIONING_ROLES), provisioningRoutes)
  app.use('/api/backups', authenticate, requireSystemAdmin, backupRoutes)

  // Internal workspace routes.
  app.use('/api/folders', authenticate, requireIntranet, folderRoutes)
  app.use('/api/files', authenticate, requireIntranet, fileRoutes)
  app.use('/api/recycle-bin', authenticate, requireIntranet, recycleBinRoutes)
  app.use('/api/metalinks', authenticate, requireIntranet, metaLinkRoutes)
  app.use('/api/workflows', authenticate, requireIntranet, workflowRoutes)
  app.use('/api/emails', authenticate, requireIntranet, emailRoutes)
  app.use('/api/dashboard', authenticate, requireIntranet, dashboardRoutes)
  app.use('/api/received-files', authenticate, requireIntranet, receivedRoutes)
  app.use('/api/external-shares', authenticate, externalShareRoutes)

  app.use('/api/chat', authenticate, chatRoutes)
  app.use('/api/content', authenticate, contentRoutes)
  app.use('/api/notifications', authenticate, notificationRoutes)
  app.use('/api/push', authenticate, pushRoutes)
  app.get('/api/people/:id/avatar', authenticate, showAvatar)
  app.get('/api/support', authenticate, supportInfo)
  app.post('/api/support/requests', authenticate, rateLimit({
    windowMs: 10 * 60 * 1000, limit: 5, keyGenerator: (req) => `support-${req.user?.sub}`, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { message: 'Too many requests. Wait a few minutes and try again.' },
  }), createSupportRequest)
  app.use('/api/organizations', authenticate, organizationRoutes)
  app.use('/api/crm', authenticate, requireIntranet, crmRoutes)
  app.use('/api/imports', authenticate, requireIntranet, importRoutes)
  app.use('/api/community', authenticate, requireIntranet, communityRoutes)
  app.use('/api/courses', authenticate, courseRoutes)
  app.use('/api/privacy', authenticate, privacyRoutes)
  app.use('/api/governance', authenticate, governanceRoutes)
  app.use('/api/vault', authenticate, vaultRoutes)
  app.use('/api/video', authenticate, videoRoutes)
  app.use('/api/ai', authenticate, aiRoutes)
  app.use('/api/projects', authenticate, projectRoutes)
  app.use('/api/zylax/hub', authenticate, zylaxRoutes)
  app.use('/api/zylax/portal', authenticate, requireRole(...COMMERCIAL_CUSTOMER_ROLES), commercialPortalRoutes)
  app.use('/api/zylax', authenticate, requireRole(...COMMERCIAL_READ_ROLES), commercialRoutes)

  // Token-based public links and public file submission (no JWT).
  app.use('/api/links', publicLinkRoutes)
  app.use('/api/public/received-files', publicReceivedRoutes)
  app.use('/api/public/onboarding', publicOnboardingRoutes)
  app.use('/api/webhooks', crmWebhookRoutes)
  app.use('/api/webhooks', paymentWebhookRoutes)
  app.use('/api/webhooks', videoWebhookRoutes)
  app.use('/api/public/certificates', publicCertificateRoutes)

  app.use(errorHandler)

  return app
}
