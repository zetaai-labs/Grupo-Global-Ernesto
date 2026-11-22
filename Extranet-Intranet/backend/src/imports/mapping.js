import { createHash } from 'node:crypto'
import { validateTaxId } from '../services/kyc.service.js'

/** Maps supplied spreadsheet columns onto the directory and validates each row. */

const ALIASES = {
  registration_number: ['REGISTRO', 'NUM_REGISTRO', 'NUMERO_REGISTRO', 'NO_REGISTRO'],
  name: ['DENOMINACION', 'RAZON_SOCIAL', 'NOMBRE', 'NOMBRE_EMPRESA', 'EMPRESA', 'NEGOCIO', 'ESTABLECIMIENTO'],
  commercial_name: ['NOMBRE_COMERCIAL', 'COMERCIAL', 'PATRONIMICO'],
  tax_identifier: ['NIF', 'CIF', 'RFC', 'TAX_ID'],
  activity: ['ACTIVIDAD', 'GIRO', 'SECTOR', 'ACTIVIDAD_ECONOMICA'],
  registered_at: ['FECHA_REGISTRO'],
  constituted_at: ['FECHA_CONSTITUCION'],
  seat: ['SEDE'],
  address: ['DOMICILIO', 'DIRECCION', 'CALLE'],
  postal_code: ['CP', 'C_P', 'CODIGO_POSTAL'],
  province: ['PROVINCIA', 'ESTADO'],
  locality: ['LOCALIDAD', 'MUNICIPIO', 'CIUDAD', 'POBLACION'],
  website: ['WEB', 'PAGINA_WEB', 'SITIO_WEB', 'URL'],
  contact_name: ['PROPIETARIO', 'CONTACTO', 'NOMBRE_CONTACTO', 'REPRESENTANTE', 'DUENO', 'TITULAR'],
  email: ['EMAIL', 'E_MAIL', 'CORREO', 'CORREO_ELECTRONICO'],
  phone: ['TELEFONO', 'TELEFONOS', 'TEL', 'MOVIL', 'CELULAR'],
  designation: ['CARGO', 'PUESTO'],
}
const FIELD_BY_HEADER = new Map(Object.entries(ALIASES).flatMap(([field, headers]) => headers.map((header) => [header, field])))
const LIMITS = {
  registration_number: 100, name: 500, commercial_name: 500, tax_identifier: 64, activity: 500, seat: 255, address: 500,
  postal_code: 20, province: 120, locality: 160, website: 500, contact_name: 255, email: 255, phone: 60, designation: 160,
}

export const normalizeHeader = (value) => String(value ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export const cleanText = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()
  return text || null
}

/** Finds the column layout of a header row, or null when it is not a directory sheet. */
export function detectLayout(cells) {
  const columns = new Map()
  const unmapped = []
  cells.forEach((cell, index) => {
    const header = normalizeHeader(cell)
    if (!header) return
    const field = FIELD_BY_HEADER.get(header)
    if (field && ![...columns.values()].includes(field)) columns.set(index, field)
    else unmapped.push(cleanText(cell))
  })
  const fields = new Set(columns.values())
  if (!fields.has('name') && !fields.has('commercial_name')) return null
  if (columns.size < 2) return null
  const headers = new Set(cells.map(normalizeHeader))
  const sourceType = headers.has('REGISTRO') && headers.has('DENOMINACION') ? 'ASSOCIATIONS' : 'BUSINESS_DIRECTORY'
  return { columns, unmapped, sourceType, headers: cells.map((cell) => cleanText(cell)) }
}

export function parseDate(value) {
  if (value === null || value === undefined || value === '') return null
  let date = null
  if (value instanceof Date) date = value
  else if (typeof value === 'number' && value > 10000 && value < 80000) date = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
  else {
    const text = String(value).trim()
    let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
    if (match) date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]))
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(text)
    if (match) {
      date = new Date(Date.UTC(+match[3], +match[2] - 1, +match[1]))
      if (date.getUTCDate() !== +match[1]) return null
    }
  }
  if (!date || Number.isNaN(date.getTime())) return null
  const year = date.getUTCFullYear()
  return year >= 1700 && year <= 2100 ? date.toISOString().slice(0, 10) : null
}

function parseWebsite(value) {
  const text = cleanText(value)
  if (!text || /\s/.test(text)) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null
    return url.href.slice(0, LIMITS.website)
  } catch {
    return null
  }
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const compact = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function dedupeKey(row, sourceType) {
  const tax = compact(row.tax_identifier)
  if (tax.length >= 5) return sha256(`tax:${tax}`)
  if (row.registration_number) return sha256(`reg:${sourceType}:${compact(row.registration_number)}`)
  return sha256(`name:${sourceType}:${compact(row.name)}|${compact(row.locality)}|${compact(row.address)}`)
}

/** Turns one spreadsheet row into a validated directory record. */
export function mapRow(cells, layout) {
  const raw = {}
  layout.headers.forEach((header, index) => {
    if (!header) return
    const value = cells[index]
    if (value === null || value === undefined || value === '') return
    raw[header] = value instanceof Date ? value.toISOString() : cleanText(value)
  })
  const source = {}
  for (const [index, field] of layout.columns) source[field] = cells[index]

  const row = {}
  for (const [field, limit] of Object.entries(LIMITS)) {
    if (!(field in source)) continue
    const text = cleanText(source[field])
    if (text) row[field] = text.slice(0, limit)
  }
  row.name = row.name || row.commercial_name || null

  const issues = []
  if (!row.name) issues.push('Name is missing.')

  for (const field of ['registered_at', 'constituted_at']) {
    if (!cleanText(source[field])) continue
    const parsed = parseDate(source[field])
    if (parsed) row[field] = parsed
    else issues.push(`${field === 'registered_at' ? 'Registration' : 'Constitution'} date is not valid.`)
  }
  if (row.website) {
    const website = parseWebsite(row.website)
    if (website) row.website = website
    else { delete row.website; issues.push('Website is not valid.') }
  }
  if (row.email) {
    const first = row.email.split(/[;,\s]+/).find(Boolean)?.toLowerCase()
    if (first && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(first)) row.email = first
    else { delete row.email; issues.push('Email is not valid.') }
  }
  if (layout.sourceType === 'ASSOCIATIONS') {
    if (row.tax_identifier) {
      const tax = validateTaxId('ESP', row.tax_identifier)
      row.tax_identifier = tax.normalized
      if (!tax.ok) issues.push('NIF format is not valid.')
    }
    if (row.postal_code) {
      // Excel drops the leading zero of Spanish postcodes such as 08001.
      if (/^\d{4}$/.test(row.postal_code)) row.postal_code = `0${row.postal_code}`
      if (!/^\d{5}$/.test(row.postal_code)) issues.push('Postal code is not valid.')
    }
  }

  const status = !row.name ? 'INVALID' : issues.length ? 'WARNING' : 'VALID'
  return { normalized: row, raw, issues, status, dedupe_key: row.name ? dedupeKey(row, layout.sourceType) : null }
}
