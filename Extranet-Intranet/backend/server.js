import { createServer } from 'node:http'
import { Server } from 'socket.io'

import { config } from './src/config/env.js'
import { createApp, corsOrigin } from './src/app.js'
import { registerSockets } from './src/sockets/index.js'
import { createBackup } from './src/services/backup.service.js'
import { storageDriver } from './src/services/storage.service.js'
import { purgeExpired } from './src/services/recycleBin.service.js'
import { purgeOldNotifications } from './src/services/gdpr.service.js'
import { writeAudit } from './src/services/audit.js'
import { runAuditIntegrityJob } from './src/services/auditIntegrity.service.js'
import { syncInbox, imapConfigured } from './src/jobs/emailSync.job.js'
import { sendWorkflowReminders } from './src/controllers/workflows.controller.js'
import { sendEventReminders } from './src/controllers/calendar.controller.js'
import { sendOverdueRemediationAlerts } from './src/controllers/governance.controller.js'

const app = createApp()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
})

registerSockets(io)

httpServer.listen(config.port, () => {
  console.log(`Backend running at http://localhost:${config.port}`)
})

async function safeAudit(action, entity, details) {
  try {
    await writeAudit(null, action, entity, null, details)
  } catch {
    // The database itself may be the thing that is down.
  }
}

function schedule(hours, task) {
  const interval = hours * 60 * 60 * 1000
  if (!(interval > 0)) return
  setInterval(task, interval).unref()
}

// Scheduled backups (default: once daily).
schedule(config.jobs.backupIntervalHours, async () => {
  // With S3 storage, files are protected by bucket versioning; only the database is dumped.
  const types = storageDriver() === 's3' ? ['database'] : ['database', 'files']
  for (const type of types) {
    try {
      const backup = await createBackup(type, null)
      await safeAudit('BACKUP_CREATED', 'backups', { type, id: backup.id, scheduled: true })
    } catch (error) {
      await safeAudit('BACKUP_FAILED', 'backups', { type, scheduled: true, error: error.message })
    }
  }
})

// Recycle bin retention (default: purge items older than 30 days, checked every 6 hours).
schedule(6, async () => {
  try {
    const result = await purgeExpired(config.jobs.recycleBinRetentionDays)
    if (result.files || result.folders) {
      await safeAudit('RECYCLE_BIN_AUTO_PURGE', 'recycle_bin', result)
    }
  } catch (error) {
    await safeAudit('RECYCLE_BIN_AUTO_PURGE_FAILED', 'recycle_bin', { error: error.message })
  }
})

// Email inbox sync from the company IMAP mailbox (only when IMAP_* is configured).
if (imapConfigured()) {
  const minutes = Math.max(1, config.imap.syncMinutes)
  let running = false
  const runSync = async () => {
    if (running) return
    running = true
    try {
      await syncInbox()
    } catch (error) {
      await safeAudit('EMAIL_SYNC_FAILED', 'emails', { error: error.message })
    } finally {
      running = false
    }
  }
  runSync()
  setInterval(runSync, minutes * 60 * 1000).unref()
}

// AutoFlow reminders for requests due within a day or overdue (checked hourly).
schedule(1, async () => {
  try {
    await sendWorkflowReminders()
  } catch (error) {
    await safeAudit('WORKFLOW_REMINDERS_FAILED', 'workflows', { error: error.message })
  }
})

// Code of Ethics: alert HR about overdue Tier 1 remediation (checked hourly).
schedule(1, async () => {
  try {
    await sendOverdueRemediationAlerts()
  } catch (error) {
    await safeAudit('REMEDIATION_ALERTS_FAILED', 'governance_sanctions', { error: error.message })
  }
})

// Audit trail: verify the hash chain and copy new entries to immutable storage (hourly).
schedule(1, async () => {
  try {
    await runAuditIntegrityJob()
  } catch (error) {
    await safeAudit('AUDIT_INTEGRITY_JOB_FAILED', 'audit_logs', { error: error.message })
  }
})

// Calendar reminders ~15 minutes before events (checked every minute).
setInterval(async () => {
  try {
    await sendEventReminders(15)
  } catch (error) {
    await safeAudit('CALENDAR_REMINDERS_FAILED', 'calendar_events', { error: error.message })
  }
}, 60 * 1000).unref()

// Data retention: remove read notifications older than 90 days (daily).
schedule(24, async () => {
  try {
    await purgeOldNotifications(90)
  } catch (error) {
    await safeAudit('RETENTION_PURGE_FAILED', 'notifications', { error: error.message })
  }
})
