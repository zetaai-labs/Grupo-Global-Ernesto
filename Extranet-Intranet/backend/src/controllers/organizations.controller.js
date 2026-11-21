import { z } from 'zod'
import { query, withTransaction } from '../config/database.js'
import { config } from '../config/env.js'
import { writeAudit } from '../services/audit.js'
import { notify, notifyRoles } from '../services/notification.service.js'
import { sendMail, smtpConfigured } from '../services/email.service.js'
import { sendStoredFile } from '../services/storage.service.js'
import { COMPLIANCE_ROLES, CORRIDORS } from '../config/roles.js'
import {
  REQUIRED_DOCUMENTS,
  SCREENING_CHECKS,
  ROLE_FOR_ORG_TYPE,
  NDA_VERSION,
  sha256,
  newAccessToken,
  runAutoValidation,
  latestScreening,
  issueNda,
  createPrimaryAccount,
} from '../services/kyc.service.js'

const CORRIDOR_CODES = CORRIDORS.map(([code]) => code).filter((code) => code !== 'GLOBAL')
const APPLICANT_TYPES = ['CLIENT', 'STRATEGIC_PARTNER', 'VENDOR', 'INVESTOR', 'DELEGATION_NODE']
const ALL_TYPES = ['PARENT', 'BUSINESS_UNIT', ...APPLICANT_TYPES]
const DOC_TYPES = [...REQUIRED_DOCUMENTS, 'OPERATING_LICENSE', 'OTHER']
const uuid = z.string().uuid()

const registrationSchema = z.object({
  legal_name: z.string().trim().min(2).max(255),
  tax_id: z.string().trim().min(3).max(64),
  pic_code: z.string().trim().max(64).optional().nullable(),
  country: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  region_corridor: z.enum(CORRIDOR_CODES),
  org_type: z.enum(APPLICANT_TYPES),
  contact_name: z.string().trim().min(2).max(255),
  contact_email: z.string().trim().email().max(255),
  contact_phone: z.string().trim().max(64).optional().nullable(),
})

function fail(res, status, message) {
  return res.status(status).json({ message })
}

async function applicationByToken(token) {
  const { rows } = await query(
    `SELECT a.*, o.legal_name, o.verification_status, o.onboarding_stage, o.org_type, o.country, o.region_corridor
     FROM kyc_applications a JOIN organizations o ON o.org_id = a.org_id
     WHERE a.access_token_hash = $1`,
    [sha256(String(token || ''))],
  )
  return rows[0]
}

// ---------------------------------------------------------------------------
// Public onboarding (no account): steps 1–3
// ---------------------------------------------------------------------------

/** Step 1 — pre-registration. Returns a private application token to continue the process. */
export async function publicRegister(req, res) {
  const parsed = registrationSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Please complete all required fields.')
  const data = parsed.data

  const exists = await query('SELECT 1 FROM organizations WHERE LOWER(legal_name) = LOWER($1)', [data.legal_name])
  if (exists.rowCount) return fail(res, 409, 'An organisation with this legal name is already registered.')

  const { token, hash } = newAccessToken()
  const org = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO organizations (legal_name, tax_id, pic_code, country, region_corridor, org_type, onboarding_stage)
       VALUES ($1, $2, $3, $4, $5, $6, 2) RETURNING org_id, legal_name`,
      [data.legal_name, data.tax_id, data.pic_code || null, data.country, data.region_corridor, data.org_type],
    )
    await client.query(
      `INSERT INTO kyc_applications (org_id, access_token_hash, contact_name, contact_email, contact_phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [rows[0].org_id, hash, data.contact_name, data.contact_email.toLowerCase(), data.contact_phone || null],
    )
    return rows[0]
  })

  await writeAudit(null, 'KYC_PRE_REGISTRATION', 'organizations', org.org_id, { org_type: data.org_type })

  const link = `${config.frontendOrigin}/onboarding?ref=${token}`
  if (smtpConfigured()) {
    sendMail({
      to: data.contact_email,
      subject: 'Global Group — continue your registration',
      text: `Thank you for registering ${data.legal_name}.\n\nContinue your verification (upload legal documents) here:\n${link}\n\nKeep this link private.`,
    }).catch(() => {})
  }

  return res.status(201).json({
    data: { org_id: org.org_id, token, stage: 2 },
    message: 'Registration received. Upload your legal documents to continue.',
  })
}

/** Current status of an application (applicant view). */
export async function publicStatus(req, res) {
  const app = await applicationByToken(req.params.token)
  if (!app) return fail(res, 404, 'Application not found.')
  const docs = await query(
    'SELECT document_id, doc_type, original_name, size_bytes, created_at FROM kyc_documents WHERE org_id = $1 ORDER BY created_at',
    [app.org_id],
  )
  const auto = await query(
    `SELECT result, details, created_at FROM kyc_checks
     WHERE org_id = $1 AND check_type = 'AUTO_VALIDATION' ORDER BY created_at DESC LIMIT 1`,
    [app.org_id],
  )
  return res.json({
    data: {
      legal_name: app.legal_name,
      org_type: app.org_type,
      verification_status: app.verification_status,
      onboarding_stage: app.onboarding_stage,
      submitted_at: app.submitted_at,
      required_documents: REQUIRED_DOCUMENTS,
      documents: docs.rows,
      validation: auto.rows[0] ? { result: auto.rows[0].result, issues: auto.rows[0].details.issues || [] } : null,
    },
  })
}

/** Step 2 — legal documentation upload (one file per request). */
export async function publicUploadDocument(req, res) {
  const app = await applicationByToken(req.params.token)
  if (!app) return fail(res, 404, 'Application not found.')
  if (app.verification_status !== 'PENDING' || app.onboarding_stage > 3) {
    return fail(res, 409, 'Documents can no longer be changed for this application.')
  }
  if (!req.file) return fail(res, 400, 'Choose a PDF, Word or image file (max 25 MB).')
  const docType = String(req.body?.doc_type || '')
  if (!DOC_TYPES.includes(docType)) return fail(res, 400, 'Choose the document type.')

  const { rows } = await query(
    `INSERT INTO kyc_documents (org_id, doc_type, original_name, stored_name, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING document_id, doc_type, original_name, size_bytes, created_at`,
    [app.org_id, docType, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size],
  )
  await writeAudit(null, 'KYC_DOCUMENT_UPLOADED', 'organizations', app.org_id, { doc_type: docType })
  return res.status(201).json({ data: rows[0] })
}

/** Submits the application: runs step 3 automatic validation and alerts the Compliance Office. */
export async function publicSubmit(req, res) {
  const app = await applicationByToken(req.params.token)
  if (!app) return fail(res, 404, 'Application not found.')
  if (app.verification_status !== 'PENDING') return fail(res, 409, 'This application has already been decided.')

  await query('UPDATE kyc_applications SET submitted_at = COALESCE(submitted_at, now()) WHERE application_id = $1', [app.application_id])
  await query('UPDATE organizations SET onboarding_stage = GREATEST(onboarding_stage, 3) WHERE org_id = $1', [app.org_id])
  const result = await runAutoValidation(app.org_id)

  await notifyRoles(COMPLIANCE_ROLES, {
    type: 'kyc',
    title: `KYC application: ${app.legal_name}`,
    body: result.passed ? 'Automatic validation passed — ready for AML/PEP screening.' : 'Automatic validation found issues.',
    link: '/intranet/organizations',
  })
  await writeAudit(null, 'KYC_SUBMITTED', 'organizations', app.org_id, { auto_validation: result.passed ? 'PASS' : 'FAIL' })

  return res.json({
    data: { passed: result.passed, issues: result.details.issues },
    message: result.passed
      ? 'Submitted. Your documents passed automatic checks and are now with our Compliance Office.'
      : 'Submitted with issues. Please review the list and upload any missing documents.',
  })
}

// ---------------------------------------------------------------------------
// Staff: organisation registry and Compliance Office actions (steps 3–5)
// ---------------------------------------------------------------------------

export async function listOrganizations(req, res) {
  const filters = []
  const params = []
  const add = (sql, value) => {
    params.push(value)
    filters.push(sql.replace('?', `$${params.length}`))
  }
  if (req.query.status) add('o.verification_status = ?', String(req.query.status).toUpperCase())
  if (req.query.type) add('o.org_type = ?', String(req.query.type).toUpperCase())
  if (req.query.corridor) add('o.region_corridor = ?', String(req.query.corridor).toUpperCase())
  if (req.query.q) {
    params.push(`%${req.query.q}%`)
    filters.push(`(o.legal_name ILIKE $${params.length} OR o.tax_id ILIKE $${params.length})`)
  }

  const { rows } = await query(
    `SELECT o.org_id, o.legal_name, o.org_type, o.tax_id, o.pic_code, o.country, o.region_corridor,
            o.verification_status, o.onboarding_stage, o.created_at, p.legal_name AS parent_name,
            (SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.org_id AND u.status = 'active') AS members,
            a.contact_name, a.contact_email, a.submitted_at
     FROM organizations o
     LEFT JOIN organizations p ON p.org_id = o.parent_org_id
     LEFT JOIN kyc_applications a ON a.org_id = o.org_id
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY (o.verification_status = 'PENDING') DESC, o.created_at DESC
     LIMIT 500`,
    params,
  )
  return res.json({ data: rows, meta: { corridors: CORRIDORS, types: ALL_TYPES, required_documents: REQUIRED_DOCUMENTS } })
}

export async function getOrganization(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid organisation id.')
  const org = await query(
    `SELECT o.*, p.legal_name AS parent_name FROM organizations o
     LEFT JOIN organizations p ON p.org_id = o.parent_org_id WHERE o.org_id = $1`,
    [req.params.id],
  )
  if (!org.rows[0]) return fail(res, 404, 'Organisation not found.')

  const [application, documents, checks, ndas, members] = await Promise.all([
    query('SELECT contact_name, contact_email, contact_phone, submitted_at, decided_at, decision_notes FROM kyc_applications WHERE org_id = $1', [req.params.id]),
    query('SELECT document_id, doc_type, original_name, size_bytes, mime_type, created_at FROM kyc_documents WHERE org_id = $1 ORDER BY created_at', [req.params.id]),
    query(
      `SELECT c.check_type, c.result, c.details, c.created_at, u.name AS performed_by
       FROM kyc_checks c LEFT JOIN users u ON u.id = c.performed_by
       WHERE c.org_id = $1 ORDER BY c.created_at DESC LIMIT 50`,
      [req.params.id],
    ),
    query(
      `SELECT n.nda_version, n.document_hash, n.issued_at, n.accepted_at, u.name AS accepted_by
       FROM nda_records n LEFT JOIN users u ON u.id = n.accepted_by WHERE n.org_id = $1 ORDER BY n.issued_at DESC`,
      [req.params.id],
    ),
    query(
      `SELECT u.id, u.name, u.email, u.status, r.name AS role, r.code AS role_code
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.org_id = $1 ORDER BY u.name`,
      [req.params.id],
    ),
  ])

  return res.json({
    data: {
      ...org.rows[0],
      application: application.rows[0] || null,
      documents: documents.rows,
      checks: checks.rows,
      screening: await latestScreening(req.params.id),
      ndas: ndas.rows,
      members: members.rows,
      required_documents: REQUIRED_DOCUMENTS,
    },
  })
}

const createSchema = registrationSchema
  .omit({ contact_name: true, contact_email: true, contact_phone: true, org_type: true, region_corridor: true })
  .extend({
    org_type: z.enum(ALL_TYPES),
    region_corridor: z.enum(CORRIDORS.map(([code]) => code)),
    parent_org_id: uuid.optional().nullable(),
  })

/** Manual registration by staff (e.g. a new business unit or a known partner). Starts at stage 2. */
export async function createOrganization(req, res) {
  const parsed = createSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid organisation details.')
  const data = parsed.data
  try {
    const { rows } = await query(
      `INSERT INTO organizations (legal_name, tax_id, pic_code, country, region_corridor, org_type, parent_org_id, onboarding_stage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 2) RETURNING org_id, legal_name, onboarding_stage, verification_status`,
      [data.legal_name, data.tax_id, data.pic_code || null, data.country, data.region_corridor, data.org_type, data.parent_org_id || null],
    )
    await writeAudit(req.user.sub, 'ORGANIZATION_CREATED', 'organizations', rows[0].org_id, { org_type: data.org_type })
    return res.status(201).json({ data: rows[0] })
  } catch (error) {
    if (error.code === '23505') return fail(res, 409, 'An organisation with this legal name already exists.')
    throw error
  }
}

/** Staff document upload for an organisation (same document types as the applicant). */
export async function uploadOrganizationDocument(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid organisation id.')
  if (!req.file) return fail(res, 400, 'Choose a PDF, Word or image file (max 25 MB).')
  const docType = String(req.body?.doc_type || '')
  if (!DOC_TYPES.includes(docType)) return fail(res, 400, 'Choose the document type.')
  const { rows } = await query(
    `INSERT INTO kyc_documents (org_id, doc_type, original_name, stored_name, mime_type, size_bytes)
     SELECT $1, $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM organizations WHERE org_id = $1)
     RETURNING document_id, doc_type, original_name, created_at`,
    [req.params.id, docType, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size],
  )
  if (!rows[0]) return fail(res, 404, 'Organisation not found.')
  await writeAudit(req.user.sub, 'KYC_DOCUMENT_UPLOADED', 'organizations', req.params.id, { doc_type: docType })
  return res.status(201).json({ data: rows[0] })
}

export async function downloadOrganizationDocument(req, res) {
  if (!uuid.safeParse(req.params.id).success || !uuid.safeParse(req.params.docId).success) {
    return fail(res, 400, 'Invalid id.')
  }
  const { rows } = await query(
    'SELECT original_name, stored_name, mime_type FROM kyc_documents WHERE document_id = $1 AND org_id = $2',
    [req.params.docId, req.params.id],
  )
  if (!rows[0]) return fail(res, 404, 'Document not found.')
  await writeAudit(req.user.sub, 'KYC_DOCUMENT_DOWNLOADED', 'organizations', req.params.id, { document_id: req.params.docId })
  const sent = await sendStoredFile(res, rows[0].stored_name, rows[0].original_name, rows[0].mime_type)
  if (!sent) return fail(res, 404, 'File is missing from storage.')
  return undefined
}

/** Step 3 — re-run automatic validation (e.g. after documents were added). */
export async function validateOrganization(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid organisation id.')
  try {
    const result = await runAutoValidation(req.params.id)
    await writeAudit(req.user.sub, 'KYC_AUTO_VALIDATION', 'organizations', req.params.id, { result: result.passed ? 'PASS' : 'FAIL' })
    return res.json({ data: result })
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message)
    throw error
  }
}

const screeningSchema = z.object({
  sanctions: z.enum(['CLEAR', 'HIT']),
  pep: z.enum(['CLEAR', 'HIT']),
  adverse_media: z.enum(['CLEAR', 'HIT']),
  notes: z.string().trim().max(2000).optional(),
})

/** Step 4 — AML / sanctions / PEP / adverse-media screening recorded by the Compliance Office. */
export async function recordScreening(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid organisation id.')
  const parsed = screeningSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, 'Record a result (CLEAR or HIT) for sanctions, PEP and adverse media.')

  const org = await query('SELECT onboarding_stage, verification_status FROM organizations WHERE org_id = $1', [req.params.id])
  if (!org.rows[0]) return fail(res, 404, 'Organisation not found.')
  if (org.rows[0].onboarding_stage < 4) return fail(res, 409, 'Automatic validation must pass before screening.')
  if (org.rows[0].verification_status !== 'PENDING') return fail(res, 409, 'This organisation has already been decided.')

  const { sanctions, pep, adverse_media: adverseMedia, notes } = parsed.data
  const results = { SANCTIONS: sanctions, PEP: pep, ADVERSE_MEDIA: adverseMedia }
  for (const type of SCREENING_CHECKS) {
    await query(
      'INSERT INTO kyc_checks (org_id, check_type, result, details, performed_by) VALUES ($1, $2, $3, $4, $5)',
      [req.params.id, type, results[type], JSON.stringify({ notes: notes || null, method: 'manual' }), req.user.sub],
    )
  }
  const clear = Object.values(results).every((value) => value === 'CLEAR')
  if (clear) await query('UPDATE organizations SET onboarding_stage = 5 WHERE org_id = $1', [req.params.id])

  await writeAudit(req.user.sub, 'KYC_SCREENING_RECORDED', 'organizations', req.params.id, results)
  return res.json({
    data: { clear, stage: clear ? 5 : 4 },
    message: clear ? 'Screening clear — ready for final approval.' : 'Screening has hits — review before deciding.',
  })
}

const decisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().trim().max(2000).optional(),
  create_account: z.boolean().optional(),
})

/** Step 5 — approval & credential issuance (or rejection). */
export async function decideOrganization(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid organisation id.')
  const parsed = decisionSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, 'Decision must be APPROVE or REJECT.')
  const { decision, notes } = parsed.data
  const createAccount = parsed.data.create_account !== false

  const orgResult = await query('SELECT * FROM organizations WHERE org_id = $1', [req.params.id])
  const org = orgResult.rows[0]
  if (!org) return fail(res, 404, 'Organisation not found.')
  if (org.verification_status !== 'PENDING') return fail(res, 409, 'This organisation has already been decided.')
  if (decision === 'APPROVE' && org.onboarding_stage < 5) {
    return fail(res, 409, 'All screening checks must be CLEAR before approval.')
  }

  const app = (await query('SELECT * FROM kyc_applications WHERE org_id = $1', [org.org_id])).rows[0]
  let account = null

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE organizations SET verification_status = $2, onboarding_stage = $3 WHERE org_id = $1',
      [org.org_id, decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED', decision === 'APPROVE' ? 5 : org.onboarding_stage],
    )
    if (app) {
      await client.query(
        'UPDATE kyc_applications SET decided_by = $2, decided_at = now(), decision_notes = $3 WHERE org_id = $1',
        [org.org_id, req.user.sub, notes || null],
      )
    }
    if (decision === 'APPROVE') {
      await issueNda(client, org)
      const role = ROLE_FOR_ORG_TYPE[org.org_type]
      if (createAccount && app && role) {
        const existing = await client.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [app.contact_email])
        if (!existing.rowCount) {
          account = await createPrimaryAccount(client, { org, name: app.contact_name, email: app.contact_email, role })
        }
      }
    }
  })

  await writeAudit(req.user.sub, decision === 'APPROVE' ? 'ORGANIZATION_APPROVED' : 'ORGANIZATION_REJECTED', 'organizations', org.org_id, {
    notes: notes || null,
    account_created: Boolean(account),
  })

  let setPasswordLink = null
  if (account) {
    const link = `${config.frontendOrigin}/reset-password?token=${account.resetToken}`
    if (smtpConfigured()) {
      sendMail({
        to: app.contact_email,
        subject: 'Global Group — your organisation has been verified',
        text: `${org.legal_name} has been verified on the Global Group platform.\n\nSet your password (link valid for 7 days):\n${link}\n\nYou will be asked to accept the confidentiality agreement (NDA) on first sign-in.`,
      }).catch(() => {})
    } else if (process.env.NODE_ENV !== 'production') {
      setPasswordLink = link
    }
  } else if (app && decision === 'REJECT' && smtpConfigured()) {
    sendMail({
      to: app.contact_email,
      subject: 'Global Group — registration outcome',
      text: `We were unable to verify ${org.legal_name} at this time.${notes ? `\n\nNotes: ${notes}` : ''}`,
    }).catch(() => {})
  }

  return res.json({
    data: { verification_status: decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED', account_created: Boolean(account), set_password_link: setPasswordLink },
    message: decision === 'APPROVE'
      ? `Organisation verified.${account ? ' Account created and NDA issued.' : ' NDA issued.'}`
      : 'Organisation rejected.',
  })
}

const statusSchema = z.object({ status: z.enum(['VERIFIED', 'SUSPENDED']) })

/** Suspend or reinstate a verified organisation (all its users lose/regain access). */
export async function setOrganizationStatus(req, res) {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, 'Invalid organisation id.')
  const parsed = statusSchema.safeParse(req.body || {})
  if (!parsed.success) return fail(res, 400, 'Status must be VERIFIED or SUSPENDED.')
  const { rows } = await query(
    `UPDATE organizations SET verification_status = $2
     WHERE org_id = $1 AND verification_status IN ('VERIFIED', 'SUSPENDED') AND org_type NOT IN ('PARENT')
     RETURNING legal_name`,
    [req.params.id, parsed.data.status],
  )
  if (!rows[0]) return fail(res, 404, 'Organisation not found or not in a verified state.')
  await writeAudit(req.user.sub, 'ORGANIZATION_STATUS_CHANGED', 'organizations', req.params.id, parsed.data)
  return res.json({ message: `${rows[0].legal_name} is now ${parsed.data.status.toLowerCase()}.` })
}

// ---------------------------------------------------------------------------
// The signed-in user's own organisation and NDA
// ---------------------------------------------------------------------------

export async function myOrganization(req, res) {
  if (!req.user.org_id) return res.json({ data: null })
  const { rows } = await query(
    `SELECT o.org_id, o.legal_name, o.org_type, o.country, o.region_corridor, o.verification_status,
            (SELECT json_build_object('nda_version', n.nda_version, 'document_hash', n.document_hash,
                                      'issued_at', n.issued_at, 'accepted_at', n.accepted_at)
             FROM nda_records n WHERE n.org_id = o.org_id ORDER BY n.issued_at DESC LIMIT 1) AS nda
     FROM organizations o WHERE o.org_id = $1`,
    [req.user.org_id],
  )
  return res.json({ data: rows[0] || null })
}

/** Accepts the organisation's latest NDA; the acceptance hash binds user, NDA hash and time. */
export async function acceptNda(req, res) {
  if (!req.user.org_id) return fail(res, 400, 'Your account is not linked to an organisation.')
  const latest = await query(
    'SELECT nda_id, document_hash, accepted_at FROM nda_records WHERE org_id = $1 ORDER BY issued_at DESC LIMIT 1',
    [req.user.org_id],
  )
  const nda = latest.rows[0]
  if (!nda) return fail(res, 404, 'No NDA has been issued for your organisation.')
  if (nda.accepted_at) return res.json({ message: 'NDA already accepted.' })

  const acceptedAt = new Date().toISOString()
  const acceptanceHash = sha256(`${nda.document_hash}|${req.user.uuid}|${acceptedAt}`)
  await query(
    'UPDATE nda_records SET accepted_by = $2, accepted_at = $3, acceptance_hash = $4 WHERE nda_id = $1',
    [nda.nda_id, req.user.sub, acceptedAt, acceptanceHash],
  )
  await writeAudit(req.user.sub, 'NDA_ACCEPTED', 'organizations', req.user.org_id, { nda_version: NDA_VERSION, acceptance_hash: acceptanceHash })
  await notifyRoles(COMPLIANCE_ROLES, { type: 'kyc', title: `NDA accepted by ${req.user.name}`, link: '/intranet/organizations' })
  return res.json({ data: { acceptance_hash: acceptanceHash, accepted_at: acceptedAt }, message: 'NDA accepted.' })
}

export { notify }
