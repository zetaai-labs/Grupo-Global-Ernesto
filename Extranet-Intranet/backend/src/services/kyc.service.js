import { createHash, randomBytes } from 'node:crypto'
import { query, withTransaction } from '../config/database.js'
import { checkVat } from '../integrations/vies/viesClient.js'

/**
 * KYC / KYB onboarding (Schema Document §2.4).
 * Stage 1 Pre-registration → 2 Legal upload → 3 Auto-validation → 4 AML/PEP screening → 5 Approval.
 */

export const REQUIRED_DOCUMENTS = ['INCORPORATION_CERTIFICATE', 'LEGAL_REPRESENTATION', 'DIRECTOR_ID']
export const SCREENING_CHECKS = ['SANCTIONS', 'PEP', 'ADVERSE_MEDIA']
export const NDA_VERSION = 'GG-NDA-2026.1'

/** Account role given to an organisation's primary contact once approved. */
export const ROLE_FOR_ORG_TYPE = {
  CLIENT: 'client',
  STRATEGIC_PARTNER: 'partner',
  VENDOR: 'supplier',
  INVESTOR: 'investor',
  DELEGATION_NODE: 'partner',
}

export const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex')

export function newAccessToken() {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: sha256(token) }
}

// ---------------------------------------------------------------------------
// Step 3 — automatic validation rules
// ---------------------------------------------------------------------------

const TAX_ID_RULES = {
  // Spain: CIF (companies), NIF/DNI (individuals), NIE (foreigners); optional "ES" VAT prefix.
  ESP: [
    { name: 'Spanish CIF', pattern: /^(ES)?[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/ },
    { name: 'Spanish NIF/DNI', pattern: /^(ES)?\d{8}[A-Z]$/ },
    { name: 'Spanish NIE', pattern: /^(ES)?[XYZ]\d{7}[A-Z]$/ },
  ],
  // India: PAN or GSTIN.
  IND: [
    { name: 'Indian PAN', pattern: /^[A-Z]{5}\d{4}[A-Z]$/ },
    { name: 'Indian GSTIN', pattern: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/ },
  ],
  // UAE: 15-digit TRN.
  ARE: [{ name: 'UAE TRN', pattern: /^\d{15}$/ }],
  // Morocco: ICE (15 digits).
  MAR: [{ name: 'Moroccan ICE', pattern: /^\d{15}$/ }],
}

/** Validates the tax ID format for the organisation's country. */
export function validateTaxId(country, rawTaxId) {
  const taxId = String(rawTaxId || '').toUpperCase().replace(/[\s.-]/g, '')
  const rules = TAX_ID_RULES[String(country || '').toUpperCase()]
  if (!rules) {
    const ok = /^[A-Z0-9]{5,20}$/.test(taxId)
    return { ok, rule: 'Generic tax ID (5–20 letters/digits)', normalized: taxId }
  }
  const match = rules.find((rule) => rule.pattern.test(taxId))
  return {
    ok: Boolean(match),
    rule: match ? match.name : `Expected: ${rules.map((rule) => rule.name).join(' or ')}`,
    normalized: taxId,
  }
}

/** EU Participant Identification Code: 9 digits. */
export function validatePic(pic) {
  if (!pic) return { ok: true, skipped: true }
  return { ok: /^\d{9}$/.test(String(pic).trim()) }
}

/**
 * Runs step-3 checks and records the result. Moves the organisation to stage 4 on success.
 * EU VAT numbers are checked in VIES when enabled. A negative VIES answer is a warning for Compliance,
 * not a failure: a genuine company may simply not be registered for intra-EU trade.
 * PIC numbers are still format-only.
 */
export async function runAutoValidation(orgId) {
  const { rows } = await query('SELECT * FROM organizations WHERE org_id = $1', [orgId])
  const org = rows[0]
  if (!org) throw Object.assign(new Error('Organization not found.'), { status: 404 })

  const docs = await query('SELECT DISTINCT doc_type FROM kyc_documents WHERE org_id = $1', [orgId])
  const present = new Set(docs.rows.map((row) => row.doc_type))
  const missingDocuments = REQUIRED_DOCUMENTS.filter((type) => !present.has(type))

  const tax = validateTaxId(org.country, org.tax_id)
  const pic = validatePic(org.pic_code)
  const vies = tax.ok ? await checkVat(org.country, tax.normalized) : { status: 'NOT_APPLICABLE' }
  const duplicate = await query(
    `SELECT legal_name FROM organizations
     WHERE org_id <> $1 AND verification_status = 'VERIFIED'
       AND UPPER(REPLACE(REPLACE(tax_id, ' ', ''), '-', '')) = $2
       AND org_type <> 'BUSINESS_UNIT'`,
    [orgId, tax.normalized],
  )

  const issues = []
  if (!tax.ok) issues.push(`Tax ID format not valid. ${tax.rule}.`)
  if (!pic.ok) issues.push('EU PIC must be exactly 9 digits.')
  if (missingDocuments.length) issues.push(`Missing documents: ${missingDocuments.join(', ')}.`)
  if (duplicate.rowCount) issues.push(`Tax ID already registered to ${duplicate.rows[0].legal_name}.`)

  const warnings = []
  if (vies.status === 'INVALID') warnings.push('VIES: this VAT number is not active for intra-EU trade. Compliance must review it.')
  if (vies.status === 'UNAVAILABLE') warnings.push('VIES could not be reached. Run the validation again before approving.')

  const passed = issues.length === 0
  const details = {
    tax_id: { value: tax.normalized, valid: tax.ok, rule: tax.rule },
    pic: pic.skipped ? { provided: false } : { value: org.pic_code, valid: pic.ok },
    documents: { required: REQUIRED_DOCUMENTS, missing: missingDocuments },
    duplicate_tax_id: duplicate.rowCount > 0,
    vies,
    registry_lookup: vies.status === 'OFF' ? 'Format only (VIES is switched off)' : `VIES: ${vies.status}`,
    issues,
    warnings,
  }

  await query(
    `INSERT INTO kyc_checks (org_id, check_type, result, details) VALUES ($1, 'AUTO_VALIDATION', $2, $3)`,
    [orgId, passed ? 'PASS' : 'FAIL', JSON.stringify(details)],
  )
  await query(
    'UPDATE organizations SET onboarding_stage = $2 WHERE org_id = $1 AND onboarding_stage < $2',
    [orgId, passed ? 4 : 3],
  )
  return { passed, details }
}

/** Latest result per screening check type. */
export async function latestScreening(orgId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (check_type) check_type, result, details, created_at
     FROM kyc_checks WHERE org_id = $1 AND check_type = ANY($2::text[])
     ORDER BY check_type, created_at DESC`,
    [orgId, SCREENING_CHECKS],
  )
  return rows
}

/** Issues the NDA record for an approved organisation (document hash = SHA-256 of the NDA terms). */
export async function issueNda(client, org) {
  const terms = `${NDA_VERSION}|${org.org_id}|${org.legal_name}|${org.tax_id}|confidentiality of all Grupo Global information`
  await client.query(
    'INSERT INTO nda_records (org_id, nda_version, document_hash) VALUES ($1, $2, $3)',
    [org.org_id, NDA_VERSION, sha256(terms)],
  )
}

/** Creates the organisation's primary account with no usable password plus a 7-day set-password link. */
export async function createPrimaryAccount(client, { org, name, email, role }) {
  const roleRow = await client.query('SELECT id FROM roles WHERE name = $1', [role])
  const regionRow = await client.query('SELECT id FROM regions WHERE code = $1', [org.region_corridor])
  const { rows } = await client.query(
    `INSERT INTO users (name, email, password_hash, role_id, region_id, status, org_id)
     VALUES ($1, $2, $3, $4, $5, 'active', $6)
     RETURNING id`,
    [name, email, `!pending-${randomBytes(8).toString('hex')}`, roleRow.rows[0].id, regionRow.rows[0]?.id || null, org.org_id],
  )
  const token = randomBytes(24).toString('hex')
  await client.query(
    "INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, now() + interval '7 days')",
    [rows[0].id, token],
  )
  return { userId: rows[0].id, resetToken: token }
}

export { withTransaction }
