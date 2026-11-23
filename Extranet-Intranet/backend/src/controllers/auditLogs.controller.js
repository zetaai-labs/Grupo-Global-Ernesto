import { query } from '../config/database.js'
import { auditStore } from '../integrations/aws/s3Storage.js'
import { writeAudit } from '../services/audit.js'
import { anchorAuditChain, verifyAuditChain } from '../services/auditIntegrity.service.js'

export async function listAuditLogs(req, res) {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const { rows } = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.created_at,
            u.name AS user_name, u.email AS user_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC
     LIMIT $1`,
    [limit],
  )
  return res.json({ data: rows })
}

export async function auditIntegrity(req, res) {
  const configured = auditStore.configured()
  const result = await verifyAuditChain({ store: configured ? auditStore : null })
  await writeAudit(req.user.sub, 'AUDIT_CHAIN_VERIFIED', 'audit_logs', null, { valid: result.valid })
  return res.json({
    data: {
      ...result,
      immutable_storage: {
        configured,
        mode: configured ? auditStore.mode() : null,
        retention_days: configured ? auditStore.retentionDays() : null,
      },
    },
  })
}

const ANCHOR_MESSAGES = {
  NOT_CONFIGURED: [409, 'Immutable storage is not configured.'],
  ALREADY_RUNNING: [409, 'A copy is already in progress.'],
  CHAIN_INVALID: [409, 'The audit chain failed verification, so it was not copied.'],
  OBJECT_LOCK_DISABLED: [409, 'The audit bucket does not have Object Lock enabled.'],
  OBJECT_CONFLICT: [409, 'A different locked copy already exists for this range.'],
}

export async function createAuditAnchor(req, res) {
  const result = await anchorAuditChain()
  if (!result.anchored && result.reason !== 'UP_TO_DATE') {
    const [status, message] = ANCHOR_MESSAGES[result.reason]
    return res.status(status).json({ message })
  }
  if (result.anchored) await writeAudit(req.user.sub, 'AUDIT_CHAIN_ANCHORED', 'audit_anchors', null, { to_seq: result.to_seq })
  return res.json({ data: result, message: result.anchored ? 'Audit log copied to immutable storage.' : 'Immutable storage is already up to date.' })
}
