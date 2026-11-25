import ExcelJS from 'exceljs'
import { query } from '../config/database.js'
import { writeAudit } from '../services/audit.js'
import { httpError } from './rules.js'
import { scopedRecords, presentRows, visibleFields } from './engine.controller.js'

/**
 * ZYLAX exports (Excel / CSV) and reports. Both reuse the engine's visibility and field rules,
 * so a user can only export or count what the module list would already show them.
 */

const EXPORT_LIMIT = 10000
// Cells starting with these could run as formulas in Excel (CSV injection).
const risky = (text) => /^[=+\-@\t\r]/.test(text)
const safeCell = (text) => (risky(text) ? `'${text}` : text)

function cellText(field, value, labels) {
  if (value === null || value === undefined || value === '') return ''
  if (labels[value]) return labels[value]
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (field?.type === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export async function exportRecords(req, res) {
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx'
  const { module, def, rows } = await scopedRecords(req, EXPORT_LIMIT)
  const records = await presentRows(req.user, def, rows)
  const fields = visibleFields(req.user, def).filter((field) => field.type !== 'file')
  const header = ['Ref', def.titleLabel || 'Title', 'Status', ...fields.map((field) => field.label), 'Created', 'Updated']
  const lines = records.map((record) => [
    record.ref_no, record.title, record.status,
    ...fields.map((field) => cellText(field, record.data[field.key], record.labels)),
    new Date(record.created_at).toISOString(), new Date(record.updated_at).toISOString(),
  ].map((value) => safeCell(String(value ?? ''))))

  await writeAudit(req.user.sub, 'ZX_EXPORT', 'zx_records', null, { module: module.key, entity: def.key, rows: lines.length, format })
  const name = `${module.key}-${def.key}-${new Date().toISOString().slice(0, 10)}`
  res.setHeader('Cache-Control', 'no-store')

  if (format === 'csv') {
    const escape = (text) => (/[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
    const body = [header, ...lines].map((line) => line.map(escape).join(',')).join('\r\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`)
    // BOM so Excel opens accents and non-Latin text correctly.
    return res.send(`﻿${body}`)
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Grupo Global ZYLAX'
  const sheet = workbook.addWorksheet(def.label.slice(0, 31))
  sheet.addRow(header).font = { bold: true }
  for (const line of lines) sheet.addRow(line)
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.columns.forEach((column, index) => { column.width = Math.min(48, Math.max(10, String(header[index]).length + 4)) })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`)
  const buffer = await workbook.xlsx.writeBuffer()
  return res.send(Buffer.from(buffer))
}

/** Counts by status, records per month (last 12 months) and the module total per month. */
export async function reportRecords(req, res) {
  const { module, def, where, params } = await scopedRecords(req, 0)
  const candidate = def.sumField || def.signedSum?.field || null
  const sumField = candidate && /^[a-z_]{1,60}$/.test(candidate) ? candidate : null
  const byStatus = await query(`SELECT r.status, COUNT(*)::int AS count FROM zx_records r WHERE ${where} GROUP BY r.status ORDER BY count DESC`, params)
  const amount = sumField ? `COALESCE(SUM(CASE WHEN (r.data->>'${sumField}') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (r.data->>'${sumField}')::numeric ELSE 0 END), 0)` : '0'
  const byMonth = await query(
    `SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count, ${amount} AS amount
     FROM zx_records r WHERE ${where} AND r.created_at >= date_trunc('month', now()) - interval '11 months'
     GROUP BY 1 ORDER BY 1`,
    params,
  )
  const months = []
  const now = new Date()
  for (let back = 11; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    const key = d.toISOString().slice(0, 7)
    const hit = byMonth.rows.find((row) => row.month === key)
    months.push({ month: key, count: hit?.count || 0, amount: hit ? Number(hit.amount) : 0 })
  }
  const total = byStatus.rows.reduce((sum, row) => sum + row.count, 0)
  return res.json({ data: { module: module.key, entity: def.key, total, by_status: byStatus.rows, by_month: months, amount_field: sumField } })
}

export { httpError }
