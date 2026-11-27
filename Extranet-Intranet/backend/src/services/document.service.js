import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import * as fontkit from 'fontkit'

/**
 * Branded PDF quotes and invoices in Spanish, English, Russian and Arabic.
 * Fonts: Noto Sans (Latin + Cyrillic) and Noto Sans Arabic, bundled in assets/fonts (SIL OFL 1.1).
 * Arabic documents are mirrored (right-to-left layout) and Arabic words are placed right to left.
 */

const LABELS = {
  es: {
    QUOTE: 'PRESUPUESTO', INVOICE: 'FACTURA', CORRECTIVE: 'FACTURA RECTIFICATIVA', corrects: 'Rectifica a', reason: 'Motivo de la rectificación', number: 'Número', date: 'Fecha', validUntil: 'Válido hasta', status: 'Estado', payment: 'Forma de pago',
    from: 'Emisor', to: 'Cliente', taxId: 'NIF/CIF', sku: 'Ref.', item: 'Descripción', qty: 'Cant.', price: 'Precio', discount: 'Dto.', vat: 'IVA', net: 'Base',
    vatSummary: 'Desglose de IVA', base: 'Base imponible', totalVat: 'Total IVA', total: 'TOTAL', notes: 'Observaciones', page: 'Página', walkIn: 'Cliente de mostrador',
    CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', PAYPAL: 'PayPal',
    DRAFT: 'BORRADOR', SENT: 'Enviado', ACCEPTED: 'Aceptado', REJECTED: 'Rechazado', EXPIRED: 'Caducado', ISSUED: 'Emitida', PAID: 'Pagada', REFUNDED: 'REEMBOLSADA', CANCELLED: 'ANULADA',
  },
  en: {
    QUOTE: 'QUOTE', INVOICE: 'INVOICE', CORRECTIVE: 'CORRECTIVE INVOICE', corrects: 'Corrects', reason: 'Reason for correction', number: 'Number', date: 'Date', validUntil: 'Valid until', status: 'Status', payment: 'Payment',
    from: 'From', to: 'Bill to', taxId: 'Tax ID', sku: 'Ref.', item: 'Description', qty: 'Qty', price: 'Price', discount: 'Disc.', vat: 'VAT', net: 'Net',
    vatSummary: 'VAT breakdown', base: 'Taxable base', totalVat: 'Total VAT', total: 'TOTAL', notes: 'Notes', page: 'Page', walkIn: 'Walk-in customer',
    CASH: 'Cash', CARD: 'Card', TRANSFER: 'Bank transfer', PAYPAL: 'PayPal',
    DRAFT: 'DRAFT', SENT: 'Sent', ACCEPTED: 'Accepted', REJECTED: 'Rejected', EXPIRED: 'Expired', ISSUED: 'Issued', PAID: 'Paid', REFUNDED: 'REFUNDED', CANCELLED: 'CANCELLED',
  },
  ru: {
    QUOTE: 'ПРЕДЛОЖЕНИЕ', INVOICE: 'СЧЁТ', CORRECTIVE: 'КОРРЕКТИРОВОЧНЫЙ СЧЁТ', corrects: 'Исправляет', reason: 'Причина исправления', number: 'Номер', date: 'Дата', validUntil: 'Действует до', status: 'Статус', payment: 'Оплата',
    from: 'Продавец', to: 'Покупатель', taxId: 'ИНН', sku: 'Арт.', item: 'Описание', qty: 'Кол.', price: 'Цена', discount: 'Скид.', vat: 'НДС', net: 'Сумма',
    vatSummary: 'НДС по ставкам', base: 'Налоговая база', totalVat: 'Итого НДС', total: 'ИТОГО', notes: 'Примечания', page: 'Стр.', walkIn: 'Розничный покупатель',
    CASH: 'Наличные', CARD: 'Карта', TRANSFER: 'Банковский перевод', PAYPAL: 'PayPal',
    DRAFT: 'ЧЕРНОВИК', SENT: 'Отправлено', ACCEPTED: 'Принято', REJECTED: 'Отклонено', EXPIRED: 'Истекло', ISSUED: 'Выставлен', PAID: 'Оплачен', REFUNDED: 'ВОЗВРАТ', CANCELLED: 'АННУЛИРОВАН',
  },
  ar: {
    QUOTE: 'عرض سعر', INVOICE: 'فاتورة', CORRECTIVE: 'فاتورة تصحيحية', corrects: 'تصحح', reason: 'سبب التصحيح', number: 'الرقم', date: 'التاريخ', validUntil: 'صالح حتى', status: 'الحالة', payment: 'طريقة الدفع',
    from: 'المُصدِر', to: 'العميل', taxId: 'الرقم الضريبي', sku: 'المرجع', item: 'الوصف', qty: 'الكمية', price: 'السعر', discount: 'الخصم', vat: 'الضريبة', net: 'الصافي',
    vatSummary: 'تفاصيل ضريبة القيمة المضافة', base: 'الوعاء الضريبي', totalVat: 'إجمالي الضريبة', total: 'الإجمالي', notes: 'ملاحظات', page: 'صفحة', walkIn: 'عميل مباشر',
    CASH: 'نقدًا', CARD: 'بطاقة', TRANSFER: 'تحويل بنكي', PAYPAL: 'PayPal',
    DRAFT: 'مسودة', SENT: 'مُرسل', ACCEPTED: 'مقبول', REJECTED: 'مرفوض', EXPIRED: 'منتهي الصلاحية', ISSUED: 'صادرة', PAID: 'مدفوعة', REFUNDED: 'مستردة', CANCELLED: 'ملغاة',
  },
  fr: {
    QUOTE: 'DEVIS', INVOICE: 'FACTURE', CORRECTIVE: 'FACTURE RECTIFICATIVE', corrects: 'Rectifie', reason: 'Motif de la rectification', number: 'Numéro', date: 'Date', validUntil: 'Valable jusqu’au', status: 'Statut', payment: 'Paiement',
    from: 'Émetteur', to: 'Client', taxId: 'N° fiscal', sku: 'Réf.', item: 'Description', qty: 'Qté', price: 'Prix', discount: 'Rem.', vat: 'TVA', net: 'HT',
    vatSummary: 'Détail de la TVA', base: 'Base imposable', totalVat: 'Total TVA', total: 'TOTAL', notes: 'Remarques', page: 'Page', walkIn: 'Client de passage',
    CASH: 'Espèces', CARD: 'Carte', TRANSFER: 'Virement', PAYPAL: 'PayPal',
    DRAFT: 'BROUILLON', SENT: 'Envoyé', ACCEPTED: 'Accepté', REJECTED: 'Refusé', EXPIRED: 'Expiré', ISSUED: 'Émise', PAID: 'Payée', REFUNDED: 'REMBOURSÉE', CANCELLED: 'ANNULÉE',
  },
}
const WATERMARK = new Set(['DRAFT', 'REFUNDED', 'EXPIRED', 'REJECTED', 'CANCELLED'])
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

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts')
const FONTS = {
  regular: path.join(FONT_DIR, 'NotoSans-Regular.ttf'),
  bold: path.join(FONT_DIR, 'NotoSans-Bold.ttf'),
  arRegular: path.join(FONT_DIR, 'NotoSansArabic-Regular.ttf'),
  arBold: path.join(FONT_DIR, 'NotoSansArabic-Bold.ttf'),
}
let coverage = null
const fontsForCoverage = () => {
  coverage ||= { latin: fontkit.openSync(FONTS.regular), arabic: fontkit.openSync(FONTS.arRegular) }
  return coverage
}

export const PDF_LANGUAGES = ['es', 'en', 'ru', 'ar', 'fr']
/** Language of the document: Spanish by default. */
export const pdfLanguage = (value) => (PDF_LANGUAGES.includes(value) ? value : 'es')
export const walkInName = (lang) => LABELS[pdfLanguage(lang)].walkIn

const isArabicCode = (code) => (code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)
  || (code >= 0x08a0 && code <= 0x08ff) || (code >= 0xfb50 && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff)
export const hasArabic = (text) => [...String(text)].some((ch) => isArabicCode(ch.codePointAt(0)))

/** Normalises spaces and replaces characters neither font can draw with "?". */
export function clean(value) {
  const { latin, arabic } = fontsForCoverage()
  let out = ''
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0)
    if (code === 0x09 || code === 0x0a || code === 0x0d) { out += ch; continue }
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue
    if (code === 0xa0 || code === 0x202f || code === 0x2009) { out += ' '; continue }
    if (code >= 0x200b && code <= 0x200f) continue
    out += latin.hasGlyphForCodePoint(code) || arabic.hasGlyphForCodePoint(code) ? ch : '?'
  }
  return out
}

function formatters(lang) {
  // Arabic documents use Western digits, as is usual for invoices in euros.
  const locale = { es: 'es-ES', en: 'en-GB', ru: 'ru-RU', ar: 'en-GB' }[lang]
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', useGrouping: 'always' })
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'Europe/Madrid' })
  return {
    money: (value) => clean(money.format(Number(value || 0))),
    percent: (value) => `${clean(percent.format(Number(value || 0)))}%`,
    date: (value) => (value ? clean(date.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00Z` : value))) : '-'),
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

/**
 * Draws text with the right font. In an RTL document every x position and alignment is mirrored.
 * Text containing Arabic is split into runs (Arabic words / Latin sequences) placed right to left.
 */
function createWriter(doc, rtl) {
  doc.registerFont('gg-regular', FONTS.regular)
  doc.registerFont('gg-bold', FONTS.bold)
  doc.registerFont('gg-ar', FONTS.arRegular)
  doc.registerFont('gg-ar-bold', FONTS.arBold)
  let weight = 'regular'
  const latinFont = () => (weight === 'bold' ? 'gg-bold' : 'gg-regular')
  const arabicFont = () => (weight === 'bold' ? 'gg-ar-bold' : 'gg-ar')
  const mx = (x, width = 0) => (rtl ? LEFT + RIGHT - x - width : x)
  const flip = (align) => (rtl ? ({ left: 'right', right: 'left' }[align] || align) : align)

  // Token kinds: 'ar' (has Arabic letters), 'ltr' (other letters or digits), 'n' (punctuation only).
  const kindOf = (word) => (hasArabic(word) ? 'ar' : /[\p{L}\p{N}]/u.test(word) ? 'ltr' : 'n')

  /** Logical runs: each Arabic word alone; left-to-right words (and punctuation between them) joined. */
  function runsOf(text) {
    const words = text.split(/\s+/).filter(Boolean)
    const kinds = words.map(kindOf)
    const runs = []
    words.forEach((word, index) => {
      const kind = kinds[index]
      const last = runs[runs.length - 1]
      if (kind === 'ltr' && last?.kind === 'ltr') { last.text += ` ${word}`; return }
      if (kind === 'n' && last?.kind === 'ltr') {
        const next = kinds.slice(index + 1).find((k) => k !== 'n')
        if (next === 'ltr' || next === undefined) { last.text += ` ${word}`; return }
      }
      runs.push({ kind, text: word })
    })
    for (const run of runs) run.width = doc.font(run.kind === 'ar' ? arabicFont() : latinFont()).widthOfString(run.text)
    return runs
  }

  /** Visual left-to-right order of a line's runs for the document direction. */
  function visualOrder(runs) {
    if (rtl) return [...runs].reverse()
    // Left-to-right paragraph: only stretches of Arabic words (and punctuation inside them) are reversed.
    const out = []
    let stretch = []
    const flush = () => { out.push(...stretch.reverse()); stretch = [] }
    runs.forEach((run, index) => {
      const insideArabic = run.kind === 'n' && stretch.length && runs.slice(index + 1).find((r) => r.kind !== 'n')?.kind === 'ar'
      if (run.kind === 'ar' || insideArabic) stretch.push(run)
      else { flush(); out.push(run) }
    })
    flush()
    return out
  }

  function mixedLines(text, width) {
    const space = doc.font(latinFont()).widthOfString(' ')
    const lines = []
    for (const paragraph of text.split(/\r?\n/)) {
      let line = []
      let used = 0
      for (const run of runsOf(paragraph)) {
        const add = (line.length ? space : 0) + run.width
        if (line.length && width && used + add > width) {
          lines.push({ runs: line, width: used })
          line = []
          used = 0
        }
        used += (line.length ? space : 0) + run.width
        line.push(run)
      }
      lines.push({ runs: line, width: used })
    }
    return { lines, space }
  }

  function drawMixed(text, x, y, width, align) {
    const { lines, space } = mixedLines(text, width)
    const lineHeight = doc.font(arabicFont()).currentLineHeight(true)
    let lineY = y
    for (const line of lines) {
      let cursor = align === 'center' ? x + (width - line.width) / 2 : align === 'right' ? x + width - line.width : x
      for (const run of visualOrder(line.runs)) {
        doc.font(run.kind === 'ar' ? arabicFont() : latinFont()).text(run.text, cursor, lineY, { lineBreak: false })
        cursor += run.width + space
      }
      lineY += lineHeight
    }
    doc.x = x
    doc.y = lineY
  }

  const api = {
    style(nextWeight, size, color) {
      weight = nextWeight
      doc.fontSize(size)
      if (color) doc.fillColor(color)
      return api
    },
    text(value, x, y, { width = RIGHT - x, align = 'left', lineBreak = true } = {}) {
      const text = clean(value)
      const ax = mx(x, width)
      const al = flip(align)
      if (hasArabic(text)) drawMixed(text, ax, y, width, al)
      else doc.font(latinFont()).text(text, ax, y, { width, align: al, lineBreak })
      doc.x = mx(x, width)
      return api
    },
    height(value, width) {
      const text = clean(value)
      if (!hasArabic(text)) return doc.font(latinFont()).heightOfString(text, { width })
      return mixedLines(text, width).lines.length * doc.font(arabicFont()).currentLineHeight(true)
    },
    hline(x1, x2, y, lineWidth, color) {
      doc.moveTo(mx(x1), y).lineTo(mx(x2), y).lineWidth(lineWidth).strokeColor(color).stroke()
      return api
    },
  }
  return api
}

function partyBlock(doc, w, x, heading, party, labels) {
  const top = doc.y
  w.style('bold', 8, MUTED).text(heading.toUpperCase(), x, top, { width: 235 })
  w.style('bold', 10, INK).text(party.name || '-', x, doc.y + 3, { width: 235 })
  w.style('regular', 9, INK)
  if (party.address) w.text(party.address, x, doc.y + 1, { width: 235 })
  if (party.tax_id) w.text(`${labels.taxId}: ${party.tax_id}`, x, doc.y + 1, { width: 235 })
  if (party.country) w.text(party.country, x, doc.y + 1, { width: 235 })
  if (party.contact) w.text(party.contact, x, doc.y + 1, { width: 235 })
  return doc.y
}

function tableHeader(doc, w, labels) {
  const y = doc.y
  doc.rect(LEFT, y, RIGHT - LEFT, 20).fill(ACCENT)
  w.style('bold', 8, '#ffffff')
  for (const [key, x, width, align] of COLUMNS) w.text(labels[key], x + 3, y + 5, { width: width - 6, align, lineBreak: false })
  doc.x = LEFT
  doc.y = y + 24
}

function watermark(doc, w, text) {
  doc.save()
  doc.rotate(-35, { origin: [297, 420] })
  doc.opacity(0.18)
  w.style('bold', 70, '#94a3b8').text(text, 40, 380, { width: 520, align: 'center', lineBreak: false })
  doc.restore()
  doc.opacity(1)
  doc.x = LEFT
}

/**
 * @param data { kind: 'QUOTE'|'INVOICE'|'CORRECTIVE', number, status, date, valid_until, payment_method,
 *               seller, buyer, lines, net_eur, tax_eur, total_eur, notes, lang }
 */
export function buildDocumentPdf(data) {
  const lang = pdfLanguage(data.lang)
  const labels = LABELS[lang]
  const f = formatters(lang)
  const rtl = lang === 'ar'
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margins: { top: 44, left: LEFT, right: 48, bottom: 30 }, bufferPages: true, lang: { es: 'es-ES', en: 'en-GB', ru: 'ru-RU', ar: 'ar' }[lang],
      info: { Title: `${labels[data.kind]} ${clean(data.number)}`, Author: clean(data.seller?.name), Subject: labels[data.kind] },
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    const w = createWriter(doc, rtl)

    const stamp = () => { if (WATERMARK.has(data.status)) watermark(doc, w, labels[data.status]) }
    stamp()

    w.style('bold', 13, ACCENT).text(data.seller?.name || 'Grupo Global', LEFT, 44, { width: 290 })
    w.style('bold', data.kind === 'CORRECTIVE' || lang === 'ru' ? 14 : 20, INK).text(labels[data.kind], 340, 44, { width: RIGHT - 340, align: 'right' })
    w.hline(LEFT, RIGHT, 92, 1.5, ACCENT)

    const meta = [[labels.number, data.number], [labels.date, f.date(data.date)]]
    if (data.corrects_number) meta.push([labels.corrects, data.corrects_number])
    if (data.valid_until) meta.push([labels.validUntil, f.date(data.valid_until)])
    meta.push([labels.status, labels[data.status] || data.status])
    if (data.payment_method) meta.push([labels.payment, labels[data.payment_method] || data.payment_method])
    let metaY = 102
    for (const [key, value] of meta) {
      w.style('regular', 9, MUTED).text(key, 350, metaY, { width: 90 })
      w.style('bold', 9, INK).text(value, 440, metaY, { width: RIGHT - 440, align: 'right' })
      metaY += 14
    }

    doc.y = 102
    const sellerEnd = partyBlock(doc, w, LEFT, labels.from, data.seller || {}, labels)
    doc.y = Math.max(sellerEnd, metaY) + 12
    const buyerEnd = partyBlock(doc, w, LEFT, labels.to, data.buyer || {}, labels)
    doc.x = LEFT
    doc.y = Math.max(buyerEnd, metaY) + 16
    tableHeader(doc, w, labels)

    for (const line of data.lines) {
      w.style('regular', 8.5, INK)
      const height = Math.max(w.height(line.name, 159), w.height(line.sku, 70)) + 8
      if (doc.y + height > BOTTOM) {
        doc.addPage()
        stamp()
        doc.y = 44
        tableHeader(doc, w, labels)
        w.style('regular', 8.5, INK)
      }
      const y = doc.y
      const cells = {
        sku: line.sku, item: line.name, qty: String(line.qty), price: f.money(line.unit_price_eur),
        discount: f.percent(line.discount_pct), vat: f.percent(line.tax_rate), net: f.money(line.net_eur),
      }
      for (const [key, x, width, align] of COLUMNS) w.text(cells[key], x + 3, y + 3, { width: width - 6, align })
      w.hline(LEFT, RIGHT, y + height, 0.5, LINE)
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
    w.style('bold', 8, MUTED).text(labels.vatSummary.toUpperCase(), LEFT, totalsTop, { width: 270 })
    let rateY = totalsTop + 13
    w.style('regular', 8.5, INK)
    for (const entry of breakdown) {
      w.text(`${f.percent(entry.rate)}  ·  ${labels.base}: ${f.money(entry.base)}  ·  ${labels.vat}: ${f.money(entry.tax)}`, LEFT, rateY, { width: 280 })
      rateY += 13
    }
    const row = (label, value, y, bold = false) => {
      w.style(bold ? 'bold' : 'regular', bold ? 12 : 9, bold ? ACCENT : INK)
      w.text(label, 340, y, { width: 100 })
      w.text(f.money(value), 440, y, { width: RIGHT - 440, align: 'right' })
    }
    row(labels.base, data.net_eur, totalsTop)
    row(labels.totalVat, data.tax_eur, totalsTop + 14)
    w.hline(340, RIGHT, totalsTop + 30, 1, ACCENT)
    row(labels.total, data.total_eur, totalsTop + 36, true)
    doc.x = LEFT
    doc.y = Math.max(rateY, totalsTop + 56) + 10

    const noteText = data.correction_reason ? `${labels.reason}: ${data.correction_reason}` : data.notes
    if (noteText) {
      w.style('regular', 9, INK)
      if (doc.y + w.height(noteText, RIGHT - LEFT) + 18 > BOTTOM) {
        doc.addPage()
        stamp()
        doc.y = 44
      }
      w.style('bold', 8, MUTED).text(labels.notes.toUpperCase(), LEFT, doc.y, { width: RIGHT - LEFT })
      w.style('regular', 9, INK).text(noteText, LEFT, doc.y + 3, { width: RIGHT - LEFT })
    }

    const range = doc.bufferedPageRange()
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index)
      w.style('regular', 7.5, MUTED).text(`${data.number}  ·  ${labels.page} ${index + 1} / ${range.count}`, LEFT, 800, { width: RIGHT - LEFT, align: 'center', lineBreak: false })
    }
    doc.end()
  })
}
