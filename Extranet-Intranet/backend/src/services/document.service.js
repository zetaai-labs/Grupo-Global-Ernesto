import PDFDocument from 'pdfkit'

/** Branded PDF quotes and invoices, in Spanish or English. */

const LABELS = {
  es: {
    QUOTE: 'PRESUPUESTO', INVOICE: 'FACTURA', CORRECTIVE: 'FACTURA RECTIFICATIVA', corrects: 'Rectifica a', reason: 'Motivo de la rectificación', number: 'Número', date: 'Fecha', validUntil: 'Válido hasta', status: 'Estado', payment: 'Forma de pago',
    from: 'Emisor', to: 'Cliente', taxId: 'NIF/CIF', sku: 'Ref.', item: 'Descripción', qty: 'Cant.', price: 'Precio', discount: 'Dto.', vat: 'IVA', net: 'Base',
    vatSummary: 'Desglose de IVA', base: 'Base imponible', totalVat: 'Total IVA', total: 'TOTAL', notes: 'Observaciones', page: 'Página',
    CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia',
    DRAFT: 'BORRADOR', SENT: 'Enviado', ACCEPTED: 'Aceptado', REJECTED: 'Rechazado', EXPIRED: 'Caducado', ISSUED: 'Emitida', PAID: 'Pagada', REFUNDED: 'REEMBOLSADA',
  },
  en: {
    QUOTE: 'QUOTE', INVOICE: 'INVOICE', CORRECTIVE: 'CORRECTIVE INVOICE', corrects: 'Corrects', reason: 'Reason for correction', number: 'Number', date: 'Date', validUntil: 'Valid until', status: 'Status', payment: 'Payment',
    from: 'From', to: 'Bill to', taxId: 'Tax ID', sku: 'Ref.', item: 'Description', qty: 'Qty', price: 'Price', discount: 'Disc.', vat: 'VAT', net: 'Net',
    vatSummary: 'VAT breakdown', base: 'Taxable base', totalVat: 'Total VAT', total: 'TOTAL', notes: 'Notes', page: 'Page',
    CASH: 'Cash', CARD: 'Card', TRANSFER: 'Bank transfer',
    DRAFT: 'DRAFT', SENT: 'Sent', ACCEPTED: 'Accepted', REJECTED: 'Rejected', EXPIRED: 'Expired', ISSUED: 'Issued', PAID: 'Paid', REFUNDED: 'REFUNDED',
  },
}
const WATERMARK = new Set(['DRAFT', 'REFUNDED', 'EXPIRED', 'REJECTED'])
const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#e2e8f0'
const ACCENT = '#312e81'
const LEFT = 48
const RIGHT = 547
const BOTTOM = 770
const COLUMNS = [
  ['sku', LEFT, 76, 'left'], ['item', 126, 165, 'left'], ['qty', 293, 34, 'right'], ['price', 329, 62, 'right'],
  ['discount', 393, 38, 'right'], ['vat', 433, 36, 'right'], ['net', 471, 76, 'right'],
]

export const pdfLanguage = (value) => (value === 'en' ? 'en' : 'es')

/** The built-in PDF fonts cover Western European text only; anything else becomes "?". */
const clean = (value) => String(value ?? '').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ€–—‘’“”•]/g, '?')

function formatters(lang) {
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', useGrouping: 'always' })
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'Europe/Madrid' })
  return {
    money: (value) => money.format(Number(value || 0)).replace(/ /g, ' '),
    percent: (value) => `${percent.format(Number(value || 0))}%`,
    date: (value) => (value ? date.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00Z` : value)) : '-'),
  }
}

/** Totals per VAT rate, as Spanish invoices must show them. */
export function vatBreakdown(lines) {
  const rates = new Map()
  for (const line of lines) {
    const key = Number(line.tax_rate)
    const entry = rates.get(key) || { rate: key, base: 0, tax: 0 }
    entry.base += Math.round(Number(line.net_eur) * 100)
    entry.tax += Math.round(Number(line.tax_eur) * 100)
    rates.set(key, entry)
  }
  return [...rates.values()].sort((a, b) => a.rate - b.rate).map((entry) => ({ rate: entry.rate, base: entry.base / 100, tax: entry.tax / 100 }))
}

function partyBlock(doc, x, heading, party, labels) {
  const top = doc.y
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(heading.toUpperCase(), x, top, { width: 235 })
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(clean(party.name || '-'), x, doc.y + 3, { width: 235 })
  doc.font('Helvetica').fontSize(9).fillColor(INK)
  if (party.address) doc.text(clean(party.address), x, doc.y + 1, { width: 235 })
  if (party.tax_id) doc.text(`${labels.taxId}: ${clean(party.tax_id)}`, x, doc.y + 1, { width: 235 })
  if (party.country) doc.text(clean(party.country), x, doc.y + 1, { width: 235 })
  if (party.contact) doc.text(clean(party.contact), x, doc.y + 1, { width: 235 })
  return doc.y
}

function tableHeader(doc, labels) {
  const y = doc.y
  doc.rect(LEFT, y, RIGHT - LEFT, 20).fill(ACCENT)
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
  for (const [key, x, width, align] of COLUMNS) doc.text(labels[key], x + 3, y + 6, { width: width - 6, align, lineBreak: false })
  doc.x = LEFT
  doc.y = y + 24
}

function watermark(doc, text) {
  doc.save()
  doc.rotate(-35, { origin: [297, 420] })
  doc.font('Helvetica-Bold').fontSize(70).fillColor('#94a3b8').opacity(0.18).text(text, 40, 385, { width: 520, align: 'center', lineBreak: false })
  doc.restore()
  doc.opacity(1)
  doc.x = LEFT
}

/**
 * @param data { kind: 'QUOTE'|'INVOICE', number, status, date, valid_until, payment_method,
 *               seller, buyer, lines, net_eur, tax_eur, total_eur, notes, lang }
 */
export function buildDocumentPdf(data) {
  const lang = pdfLanguage(data.lang)
  const labels = LABELS[lang]
  const f = formatters(lang)
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margins: { top: 44, left: LEFT, right: 48, bottom: 30 }, bufferPages: true,
      info: { Title: `${labels[data.kind]} ${clean(data.number)}`, Author: clean(data.seller?.name), Subject: labels[data.kind] },
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    const stamp = () => { if (WATERMARK.has(data.status)) watermark(doc, labels[data.status]) }
    stamp()

    doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT).text(clean(data.seller?.name || 'Grupo Global'), LEFT, 44, { width: 300 })
    doc.font('Helvetica-Bold').fontSize(data.kind === 'CORRECTIVE' ? 14 : 20).fillColor(INK).text(labels[data.kind], 340, 44, { width: RIGHT - 340, align: 'right' })
    doc.moveTo(LEFT, 92).lineTo(RIGHT, 92).lineWidth(1.5).strokeColor(ACCENT).stroke()

    const meta = [[labels.number, clean(data.number)], [labels.date, f.date(data.date)]]
    if (data.corrects_number) meta.push([labels.corrects, clean(data.corrects_number)])
    if (data.valid_until) meta.push([labels.validUntil, f.date(data.valid_until)])
    meta.push([labels.status, labels[data.status] || clean(data.status)])
    if (data.payment_method) meta.push([labels.payment, labels[data.payment_method] || clean(data.payment_method)])
    let metaY = 102
    for (const [key, value] of meta) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(key, 370, metaY, { width: 75 })
      doc.font('Helvetica-Bold').fillColor(INK).text(value, 445, metaY, { width: RIGHT - 445, align: 'right' })
      metaY += 14
    }

    doc.y = 102
    const sellerEnd = partyBlock(doc, LEFT, labels.from, data.seller || {}, labels)
    doc.y = Math.max(sellerEnd, metaY) + 12
    const buyerEnd = partyBlock(doc, LEFT, labels.to, data.buyer || {}, labels)
    doc.x = LEFT
    doc.y = Math.max(buyerEnd, metaY) + 16
    tableHeader(doc, labels)

    for (const line of data.lines) {
      doc.font('Helvetica').fontSize(8.5)
      const name = clean(line.name)
      const height = Math.max(doc.heightOfString(name, { width: 159 }), doc.heightOfString(clean(line.sku), { width: 70 })) + 8
      if (doc.y + height > BOTTOM) {
        doc.addPage()
        stamp()
        doc.y = 44
        tableHeader(doc, labels)
        doc.font('Helvetica').fontSize(8.5)
      }
      const y = doc.y
      const cells = {
        sku: clean(line.sku), item: name, qty: String(line.qty), price: f.money(line.unit_price_eur),
        discount: f.percent(line.discount_pct), vat: f.percent(line.tax_rate), net: f.money(line.net_eur),
      }
      doc.fillColor(INK)
      for (const [key, x, width, align] of COLUMNS) doc.text(cells[key], x + 3, y + 3, { width: width - 6, align })
      doc.moveTo(LEFT, y + height).lineTo(RIGHT, y + height).lineWidth(0.5).strokeColor(LINE).stroke()
      doc.x = LEFT
      doc.y = y + height + 1
    }

    const breakdown = vatBreakdown(data.lines)
    const needed = 62 + breakdown.length * 13
    if (doc.y + needed > BOTTOM) {
      doc.addPage()
      stamp()
      doc.y = 44
    }
    doc.y += 10
    const totalsTop = doc.y
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(labels.vatSummary.toUpperCase(), LEFT, totalsTop, { width: 230 })
    let rateY = totalsTop + 13
    doc.font('Helvetica').fontSize(8.5).fillColor(INK)
    for (const entry of breakdown) {
      doc.text(`${f.percent(entry.rate)}  ·  ${labels.base}: ${f.money(entry.base)}  ·  ${labels.vat}: ${f.money(entry.tax)}`, LEFT, rateY, { width: 270 })
      rateY += 13
    }
    const row = (label, value, y, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 9).fillColor(bold ? ACCENT : INK)
      doc.text(label, 345, y, { width: 95 })
      doc.text(f.money(value), 440, y, { width: RIGHT - 440, align: 'right' })
    }
    row(labels.base, data.net_eur, totalsTop)
    row(labels.totalVat, data.tax_eur, totalsTop + 14)
    doc.moveTo(345, totalsTop + 30).lineTo(RIGHT, totalsTop + 30).lineWidth(1).strokeColor(ACCENT).stroke()
    row(labels.total, data.total_eur, totalsTop + 36, true)
    doc.x = LEFT
    doc.y = Math.max(rateY, totalsTop + 56) + 10

    const noteText = data.correction_reason ? `${labels.reason}: ${data.correction_reason}` : data.notes
    if (noteText) {
      const text = clean(noteText)
      doc.font('Helvetica').fontSize(9)
      if (doc.y + doc.heightOfString(text, { width: RIGHT - LEFT }) + 18 > BOTTOM) {
        doc.addPage()
        stamp()
        doc.y = 44
      }
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(labels.notes.toUpperCase(), LEFT, doc.y, { width: RIGHT - LEFT })
      doc.font('Helvetica').fontSize(9).fillColor(INK).text(text, LEFT, doc.y + 3, { width: RIGHT - LEFT })
    }

    const range = doc.bufferedPageRange()
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index)
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      doc.text(`${clean(data.number)}  ·  ${labels.page} ${index + 1} / ${range.count}`, LEFT, 800, { width: RIGHT - LEFT, align: 'center', lineBreak: false })
    }
    doc.end()
  })
}
