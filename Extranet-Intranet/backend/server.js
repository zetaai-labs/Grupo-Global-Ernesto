import { createServer } from 'node:http'
import { Server } from 'socket.io'

import { config } from './src/config/env.js'
import { createApp, corsOrigin } from './src/app.js'
import { registerSockets } from './src/sockets/index.js'
import { createBackup, pruneOldBackups } from './src/services/backup.service.js'
import { storageDriver } from './src/services/storage.service.js'
import { purgeExpired } from './src/services/recycleBin.service.js'
import { purgeOldNotifications } from './src/services/gdpr.service.js'
import { writeAudit } from './src/services/audit.js'
import { runAuditIntegrityJob } from './src/services/auditIntegrity.service.js'
import { runBillingCycle } from './src/services/billing.service.js'
import { syncInbox, imapConfigured } from './src/jobs/emailSync.job.js'
import { sendWorkflowReminders } from './src/controllers/workflows.controller.js'
import { sendEventReminders } from './src/controllers/calendar.controller.js'
import { sendOverdueRemediationAlerts } from './src/controllers/governance.controller.js'
import { query } from './src/config/database.js'
import { sweepOrphanPackages } from './src/services/coursePackage.service.js'
import { purgeOldPositions } from './src/zylax/fleet.controller.js'
import { pruneAssistantData } from './src/controllers/assistant.controller.js'
import { encryptExistingMessages } from './src/services/chatCrypto.service.js'
import { computeRiskScores } from './src/services/churnRisk.service.js'
import { indexPendingPosts } from './src/services/translation.service.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { captureError, jobFailed, log, registerJob, runJob, setAlertSender } from './src/monitoring/monitor.js'
import { notifyRoles } from './src/services/notification.service.js'
import { sendMail, smtpConfigured } from './src/services/email.service.js'
import { SYSTEM_ADMIN_ROLES } from './src/config/roles.js'

const app = createApp()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
})

registerSockets(io)

httpServer.listen(config.port, () => {
  log('info', 'started', { port: config.port })
})

// Crashes and forgotten promise rejections are reported instead of disappearing.
process.on('unhandledRejection', (reason) => captureError(reason instanceof Error ? reason : new Error(String(reason)), { kind: 'unhandledRejection' }))
process.on('uncaughtException', (error) => {
  captureError(error, { kind: 'uncaughtException' })
  setTimeout(() => process.exit(1), 1000).unref()
})

// A failing scheduled job alerts administrators in the app, on their phones and by email (MONITORING_ALERT_EMAIL).
setAlertSender(async ({ job, error }) => {
  await notifyRoles(SYSTEM_ADMIN_ROLES, { type: 'system', title: 'A scheduled job failed', body: `${job}: ${error}`, link: '/intranet/integrations' })
  if (!smtpConfigured()) return
  let to = String(process.env.MONITORING_ALERT_EMAIL || '').trim()
  if (!to) {
    const { rows } = await query(
      "SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = ANY($1::text[]) AND u.status = 'active' LIMIT 10",
      [SYSTEM_ADMIN_ROLES],
    )
    to = rows.map((row) => row.email).join(', ')
  }
  if (to) await sendMail({ to, subject: `[Global Group] Scheduled job failed: ${job}`, text: `The scheduled job "${job}" failed at ${new Date().toISOString()}.

Error: ${error}

Open Integrations > System health for details. You get at most one email per job every 6 hours.` })
})

const jobContext = new AsyncLocalStorage()

async function safeAudit(action, entity, details) {
  // Every job reports its failures here: also hand them to the job watchdog.
  if (action.endsWith('_FAILED')) await jobFailed(jobContext.getStore() || action, new Error(details?.error || action))
  try {
    await writeAudit(null, action, entity, null, details)
  } catch {
    // The database itself may be the thing that is down.
  }
}

/** Runs `task` every `hours`, recorded under `name` on the System health screen. */
function schedule(name, hours, task) {
  const interval = hours * 60 * 60 * 1000
  if (!(interval > 0)) return
  registerJob(name, hours)
  setInterval(() => jobContext.run(name, () => runJob(name, task, hours)), interval).unref()
}

// Scheduled backups (default: once daily).
schedule('Backups', config.jobs.backupIntervalHours, async () => {
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

// Backup retention: delete local backups older than BACKUP_RETENTION_DAYS, keeping the newest 7 of each type (daily).
schedule('Backup retention', 24, async () => {
  try {
    const result = await pruneOldBackups()
    if (result.removed) await safeAudit('BACKUPS_PRUNED', 'backups', result)
  } catch (error) {
    await safeAudit('BACKUP_PRUNE_FAILED', 'backups', { error: error.message })
  }
})

// Course packages: remove unpacked folders whose course is gone and interrupted uploads (every 6 hours).
schedule('Course package clean-up', 6, async () => {
  try {
    const { rows } = await query('SELECT package_id FROM course_packages')
    const removed = await sweepOrphanPackages(new Set(rows.map((row) => row.package_id)))
    if (removed) await safeAudit('COURSE_PACKAGE_SWEEP', 'course_packages', { removed })
  } catch (error) {
    await safeAudit('COURSE_PACKAGE_SWEEP_FAILED', 'course_packages', { error: error.message })
  }
})

// Fleet GPS retention: delete vehicle positions older than 90 days (daily).
schedule('Fleet GPS retention', 24, async () => {
  try {
    const removed = await purgeOldPositions()
    if (removed) await safeAudit('FLEET_POSITIONS_PURGED', 'zx_vehicle_positions', { removed })
  } catch (error) {
    await safeAudit('FLEET_POSITIONS_PURGE_FAILED', 'zx_vehicle_positions', { error: error.message })
  }
})

// Public assistant: anonymous questions are kept 90 days, answered contact requests one year (daily).
schedule('Assistant data retention', 24, async () => {
  try {
    const removed = await pruneAssistantData()
    if (removed) await safeAudit('ASSISTANT_DATA_PURGED', 'assistant_questions', { removed })
  } catch (error) {
    await safeAudit('ASSISTANT_DATA_PURGE_FAILED', 'assistant_questions', { error: error.message })
  }
})

// Chat encryption at rest: encrypt messages written before the key was configured (at start, then daily).
const encryptOldMessages = async () => {
  try {
    const done = await encryptExistingMessages()
    if (done) await safeAudit('CHAT_MESSAGES_ENCRYPTED', 'messages', { messages: done })
  } catch (error) {
    await safeAudit('CHAT_ENCRYPTION_FAILED', 'messages', { error: error.message })
  }
}
setTimeout(() => jobContext.run('Chat encryption', () => runJob('Chat encryption', encryptOldMessages, 24)), 30 * 1000).unref()
schedule('Chat encryption', 24, encryptOldMessages)

// Predictive retention: renewal risk for every paying member (daily; alerts Finance about new high risks).
schedule('Renewal risk scoring', 24, async () => {
  try {
    const result = await computeRiskScores()
    await safeAudit('CHURN_RISK_RUN', 'member_risk_scores', result)
  } catch (error) {
    await safeAudit('CHURN_RISK_FAILED', 'member_risk_scores', { error: error.message })
  }
})

// Multilingual index: translate community posts written before the AI key was set (hourly, 20 per run).
schedule('Translation indexing', 1, async () => {
  try {
    const done = await indexPendingPosts(20)
    if (done) await safeAudit('POSTS_TRANSLATED', 'community_posts', { posts: done })
  } catch (error) {
    await safeAudit('TRANSLATION_INDEX_FAILED', 'community_posts', { error: error.message })
  }
})

// Subscription billing: renew ended periods and flag overdue invoices (hourly; safe to repeat).
schedule('Subscription billing', 1, async () => {
  try {
    const summary = await runBillingCycle()
    if (summary.invoices || summary.canceled || summary.past_due) await safeAudit('BILLING_CYCLE', 'subscriptions', summary)
  } catch (error) {
    await safeAudit('BILLING_CYCLE_FAILED', 'subscriptions', { error: error.message })
  }
})

// Recycle bin retention (default: purge items older than 30 days, checked every 6 hours).
schedule('Recycle bin clean-up', 6, async () => {
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
  const tracked = () => jobContext.run('Email inbox sync', () => runJob('Email inbox sync', runSync, minutes / 60))
  registerJob('Email inbox sync', minutes / 60)
  tracked()
  setInterval(tracked, minutes * 60 * 1000).unref()
}

// AutoFlow reminders for requests due within a day or overdue (checked hourly).
schedule('AutoFlow reminders', 1, async () => {
  try {
    await sendWorkflowReminders()
  } catch (error) {
    await safeAudit('WORKFLOW_REMINDERS_FAILED', 'workflows', { error: error.message })
  }
})

// Code of Ethics: alert HR about overdue Tier 1 remediation (checked hourly).
schedule('Ethics remediation alerts', 1, async () => {
  try {
    await sendOverdueRemediationAlerts()
  } catch (error) {
    await safeAudit('REMEDIATION_ALERTS_FAILED', 'governance_sanctions', { error: error.message })
  }
})

// Audit trail: verify the hash chain and copy new entries to immutable storage (hourly).
schedule('Audit integrity check', 1, async () => {
  try {
    await runAuditIntegrityJob()
  } catch (error) {
    await safeAudit('AUDIT_INTEGRITY_JOB_FAILED', 'audit_logs', { error: error.message })
  }
})

// Calendar reminders ~15 minutes before events (checked every minute).
registerJob('Calendar reminders', 1 / 60)
setInterval(() => jobContext.run('Calendar reminders', () => runJob('Calendar reminders', async () => {
  try {
    await sendEventReminders(15)
  } catch (error) {
    await safeAudit('CALENDAR_REMINDERS_FAILED', 'calendar_events', { error: error.message })
  }
}, 1 / 60)), 60 * 1000).unref()

// Data retention: remove read notifications older than 90 days (daily).
schedule('Notification retention', 24, async () => {
  try {
    await purgeOldNotifications(90)
  } catch (error) {
    await safeAudit('RETENTION_PURGE_FAILED', 'notifications', { error: error.message })
  }
})
