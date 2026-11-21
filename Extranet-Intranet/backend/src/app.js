import express from 'express'
import cors from 'cors'

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
import organizationRoutes, { publicOnboardingRoutes } from './routes/organizations.routes.js'
import crmRoutes, { crmWebhookRoutes } from './routes/crm.routes.js'
import governanceRoutes from './routes/governance.routes.js'
import vaultRoutes from './routes/vault.routes.js'
import projectRoutes from './routes/projects.routes.js'
import { authenticate } from './middleware/authenticate.js'
import { requireIntranet, requireRole, requireSystemAdmin } from './middleware/authorize.js'

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

  app.use(cors({ origin: corsOrigin, credentials: true }))
  // Keep the raw body so signed webhooks (HMAC-SHA256) can be verified byte-for-byte.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { req.rawBody = buffer.toString('utf8') } }))

  app.get('/', (_req, res) => res.send('Extranet-Intranet backend is running!'))

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'success', message: 'Intranet/Extranet backend is running' })
  })

  app.use('/api/auth', authRoutes)

  // Admin-only routes.
  app.use('/api/users', authenticate, requireRole('admin', 'tech_admin', 'hr'), userRoutes)
  app.use('/api/audit-logs', authenticate, requireSystemAdmin, auditLogRoutes)
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
  app.use('/api/organizations', authenticate, organizationRoutes)
  app.use('/api/crm', authenticate, requireIntranet, crmRoutes)
  app.use('/api/governance', authenticate, governanceRoutes)
  app.use('/api/vault', authenticate, vaultRoutes)
  app.use('/api/projects', authenticate, projectRoutes)

  // Token-based public links and public file submission (no JWT).
  app.use('/api/links', publicLinkRoutes)
  app.use('/api/public/received-files', publicReceivedRoutes)
  app.use('/api/public/onboarding', publicOnboardingRoutes)
  app.use('/api/webhooks', crmWebhookRoutes)

  app.use((error, _req, res, _next) => {
    const status = error.status || 500
    res.status(status).json({ message: status === 500 ? 'Server error' : error.message })
  })

  return app
}
