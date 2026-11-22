import { createWriteStream } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { parse } from 'csv-parse'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

const MAX_EXPANDED_BYTES = 1024 * 1024 * 1024
const WORKBOOK_PARTS = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml']
const httpError = (status, message) => Object.assign(new Error(message), { status })

/** Plain value of an Excel cell (rich text, links and formulas included). */
export function cellValue(value) {
  if (value === null || value === undefined || value instanceof Date) return value ?? null
  if (typeof value !== 'object') return value
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
  if ('result' in value) return cellValue(value.result)
  if ('text' in value) return cellValue(value.text)
  if ('error' in value) return null
  return null
}

function decode(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // Older Spanish exports are usually Windows-1252.
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

function detectDelimiter(text) {
  const firstLine = text.slice(0, 5000).split(/\r?\n/, 1)[0]
  return [';', ',', '\t', '|']
    .map((delimiter) => [delimiter, firstLine.split(delimiter).length])
    .sort((a, b) => b[1] - a[1])[0][0]
}

async function* readCsv(filePath, fileName) {
  const text = decode(await readFile(filePath))
  const parser = parse(text, {
    bom: true, delimiter: detectDelimiter(text), relax_column_count: true, relax_quotes: true, skip_empty_lines: false,
  })
  let rowNumber = 0
  for await (const cells of parser) {
    rowNumber += 1
    yield { sheet: path.parse(fileName).name.slice(0, 128), rowNumber, cells }
  }
}

/**
 * The streaming reader needs the workbook index before any sheet, but valid files may store it
 * later. Such files are rewritten in a safe order. Returns the new path, or null if not needed.
 */
async function orderedWorkbook(filePath) {
  const zip = await JSZip.loadAsync(await readFile(filePath))
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  // eslint-disable-next-line no-underscore-dangle
  const expanded = entries.reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0)
  if (expanded > MAX_EXPANDED_BYTES) throw httpError(413, 'This workbook is too large once decompressed.')

  const names = entries.map((entry) => entry.name)
  const firstSheet = names.findIndex((name) => name.startsWith('xl/worksheets/') && name.endsWith('.xml'))
  if (firstSheet < 0) throw httpError(422, 'This workbook has no worksheets.')
  if (names.indexOf('xl/workbook.xml') < firstSheet && names.indexOf('xl/_rels/workbook.xml.rels') < firstSheet) return null

  const ordered = new JSZip()
  const first = WORKBOOK_PARTS.filter((name) => zip.file(name))
  for (const name of [...first, ...names.filter((item) => !first.includes(item))]) {
    ordered.file(name, zip.file(name).nodeStream())
  }
  const target = `${filePath}.ordered.xlsx`
  await pipeline(ordered.generateNodeStream({ streamFiles: true, compression: 'STORE' }), createWriteStream(target))
  return target
}

async function* readXlsx(filePath) {
  const ordered = await orderedWorkbook(filePath)
  try {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(ordered || filePath, {
      entries: 'emit', sharedStrings: 'cache', styles: 'cache', hyperlinks: 'ignore', worksheets: 'emit',
    })
    for await (const worksheet of reader) {
      const sheet = String(worksheet.name || `Sheet ${worksheet.id}`).slice(0, 128)
      for await (const row of worksheet) {
        const cells = []
        // ExcelJS row values are 1-indexed and may be sparse.
        row.values.forEach((value, index) => { cells[index - 1] = cellValue(value) })
        yield { sheet, rowNumber: row.number, cells: Array.from(cells, (cell) => cell ?? null) }
      }
    }
  } finally {
    if (ordered) await rm(ordered, { force: true })
  }
}

export function readSpreadsheet(filePath, fileName) {
  const extension = path.extname(fileName).toLowerCase()
  if (extension === '.csv') return readCsv(filePath, fileName)
  if (extension === '.xlsx') return readXlsx(filePath)
  throw httpError(400, 'Upload an .xlsx or .csv file.')
}
