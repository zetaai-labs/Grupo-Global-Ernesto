import { rm } from 'node:fs/promises'
import { query, withTransaction } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { detectLayout, mapRow } from './mapping.js'
import { readSpreadsheet } from './parser.js'

export const MAX_IMPORT_ROWS = 250000
const CHUNK_SIZE = 1000
const HEADER_SCAN_ROWS = 15
const httpError = (status, message) => Object.assign(new Error(message), { status })

const insertChunk = (batchId, rows) => query(
  `INSERT INTO import_staging (batch_id, sheet, row_no, raw_data, normalized, dedupe_key, validation_status, issues)
   SELECT $1, x.sheet, x.row_no, x.raw_data, x.normalized, x.dedupe_key, x.validation_status, x.issues
   FROM jsonb_to_recordset($2::jsonb) AS x(
     sheet text, row_no int, raw_data jsonb, normalized jsonb, dedupe_key text, validation_status text, issues jsonb
   )`,
  [batchId, JSON.stringify(rows)],
)

async function stageFile(batchId, filePath, fileName) {
  const layouts = new Map()
  const unmapped = new Set()
  const sourceTypes = new Set()
  let buffer = []
  let total = 0

  for await (const { sheet, rowNumber, cells } of readSpreadsheet(filePath, fileName)) {
    if (!cells.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')) continue
    if (!layouts.has(sheet)) {
      if (rowNumber > HEADER_SCAN_ROWS) { layouts.set(sheet, null); continue }
      const layout = detectLayout(cells)
      if (!layout) continue
      layouts.set(sheet, layout)
      sourceTypes.add(layout.sourceType)
      layout.unmapped.forEach((column) => unmapped.add(column))
      continue
    }
    const layout = layouts.get(sheet)
    if (!layout) continue
    total += 1
    if (total > MAX_IMPORT_ROWS) throw httpError(413, `This file has more than ${MAX_IMPORT_ROWS} rows.`)
    const mapped = mapRow(cells, layout)
    buffer.push({
      sheet, row_no: rowNumber, raw_data: mapped.raw, normalized: { ...mapped.normalized, source_type: layout.sourceType },
      dedupe_key: mapped.dedupe_key, validation_status: mapped.status, issues: mapped.issues,
    })
    if (buffer.length >= CHUNK_SIZE) {
      await insertChunk(batchId, buffer)
      buffer = []
    }
  }
  if (buffer.length) await insertChunk(batchId, buffer)
  if (![...layouts.values()].some(Boolean)) throw httpError(422, 'No recognised header row was found. A name column is required.')
  if (!total) throw httpError(422, 'The file has a header row but no data.')
  if (sourceTypes.size > 1) throw httpError(422, 'This file mixes different directory formats. Upload them separately.')
  return { sourceType: [...sourceTypes][0], unmapped: [...unmapped] }
}

async function markDuplicates(batchId) {
  await query(
    `UPDATE import_staging s SET validation_status = 'DUPLICATE', issues = s.issues || '["Already in the directory."]'::jsonb
     FROM directory_organizations d
     WHERE s.batch_id = $1 AND s.validation_status IN ('VALID', 'WARNING') AND d.dedupe_key = s.dedupe_key`,
    [batchId],
  )
  await query(
    `WITH ranked AS (
       SELECT staging_id, row_number() OVER (PARTITION BY dedupe_key ORDER BY sheet, row_no) AS position
       FROM import_staging WHERE batch_id = $1 AND validation_status IN ('VALID', 'WARNING')
     )
     UPDATE import_staging s SET validation_status = 'DUPLICATE', issues = s.issues || '["Repeated in this file."]'::jsonb
     FROM ranked WHERE ranked.staging_id = s.staging_id AND ranked.position > 1`,
    [batchId],
  )
}

/** Parses an upload into staging. The uploaded file is always removed afterwards. */
export async function processUpload(batchId, filePath, fileName) {
  try {
    const { sourceType, unmapped } = await stageFile(batchId, filePath, fileName)
    await markDuplicates(batchId)
    await query(
      `UPDATE import_batches b SET status = 'READY', source_type = $2, unmapped_columns = $3::jsonb,
         total_rows = c.total, valid_rows = c.valid, warning_rows = c.warning, invalid_rows = c.invalid, duplicate_rows = c.duplicate
       FROM (
         SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE validation_status = 'VALID')::int AS valid,
                COUNT(*) FILTER (WHERE validation_status = 'WARNING')::int AS warning,
                COUNT(*) FILTER (WHERE validation_status = 'INVALID')::int AS invalid,
                COUNT(*) FILTER (WHERE validation_status = 'DUPLICATE')::int AS duplicate
         FROM import_staging WHERE batch_id = $1
       ) c WHERE b.batch_id = $1`,
      [batchId, sourceType, JSON.stringify(unmapped)],
    )
  } catch (error) {
    await query('DELETE FROM import_staging WHERE batch_id = $1', [batchId])
    const message = error.status ? error.message : 'The file could not be read. Check that it is a valid spreadsheet.'
    await query(`UPDATE import_batches SET status = 'FAILED', error = $2 WHERE batch_id = $1`, [batchId, message])
  } finally {
    await rm(filePath, { force: true })
  }
}

/** Moves approved rows into the directory, then removes the staged copy of the data. */
export async function confirmBatch(batchId, actorId) {
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM import_batches WHERE batch_id = $1 FOR UPDATE', [batchId])
    const batch = rows[0]
    if (!batch) throw httpError(404, 'Import not found.')
    if (batch.status !== 'READY') throw httpError(409, 'Only a reviewed import can be confirmed.')

    const text = (field) => `NULLIF(s.normalized->>'${field}', '')`
    const inserted = await client.query(
      `INSERT INTO directory_organizations (
         source_type, source_file, dedupe_key, registration_number, name, commercial_name, tax_identifier, activity,
         registered_at, constituted_at, seat, address, postal_code, province, locality, website, batch_id
       )
       SELECT DISTINCT ON (s.dedupe_key) $2, $3, s.dedupe_key, ${text('registration_number')}, s.normalized->>'name',
              ${text('commercial_name')}, ${text('tax_identifier')}, ${text('activity')},
              ${text('registered_at')}::date, ${text('constituted_at')}::date, ${text('seat')}, ${text('address')},
              ${text('postal_code')}, ${text('province')}, ${text('locality')}, ${text('website')}, $1
       FROM import_staging s
       WHERE s.batch_id = $1 AND s.validation_status IN ('VALID', 'WARNING')
       ORDER BY s.dedupe_key, s.sheet, s.row_no
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [batchId, batch.source_type, batch.file_name],
    )
    await client.query(
      `INSERT INTO directory_contacts (directory_id, contact_name, email, phone, designation)
       SELECT d.directory_id, ${text('contact_name')}, ${text('email')}, ${text('phone')}, ${text('designation')}
       FROM import_staging s JOIN directory_organizations d ON d.dedupe_key = s.dedupe_key AND d.batch_id = $1
       WHERE s.batch_id = $1 AND s.validation_status IN ('VALID', 'WARNING')
         AND COALESCE(${text('contact_name')}, ${text('email')}, ${text('phone')}) IS NOT NULL`,
      [batchId],
    )
    await client.query('DELETE FROM import_staging WHERE batch_id = $1', [batchId])
    await client.query(
      `UPDATE import_batches SET status = 'IMPORTED', imported_rows = $2, confirmed_by = $3, confirmed_at = now() WHERE batch_id = $1`,
      [batchId, inserted.rowCount, actorId],
    )
    return { imported: inserted.rowCount }
  })
  await writeAudit(actorId, 'DATA_IMPORT_CONFIRMED', 'import_batches', batchId, result)
  return result
}

export async function cancelBatch(batchId, actorId) {
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT status FROM import_batches WHERE batch_id = $1 FOR UPDATE', [batchId])
    if (!rows[0]) throw httpError(404, 'Import not found.')
    if (!['READY', 'FAILED'].includes(rows[0].status)) throw httpError(409, 'This import can no longer be canceled.')
    await client.query('DELETE FROM import_staging WHERE batch_id = $1', [batchId])
    await client.query(`UPDATE import_batches SET status = 'CANCELED' WHERE batch_id = $1`, [batchId])
  })
  await writeAudit(actorId, 'DATA_IMPORT_CANCELED', 'import_batches', batchId)
}

/** GDPR: directory contacts matching a person's email address. */
export async function exportDirectoryContacts(email) {
  const { rows } = await query(
    `SELECT c.contact_name, c.email, c.phone, c.designation, d.name AS organization, d.source_file, c.created_at
     FROM directory_contacts c JOIN directory_organizations d ON d.directory_id = c.directory_id
     WHERE LOWER(c.email) = LOWER($1)`,
    [email],
  )
  return rows
}

export async function eraseDirectoryContacts(client, email) {
  await client.query('DELETE FROM directory_contacts WHERE LOWER(email) = LOWER($1)', [email])
}
