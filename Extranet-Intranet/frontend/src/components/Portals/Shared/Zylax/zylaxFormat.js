export const humanize = (value) => {
  const text = String(value || '').replaceAll('_', ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))

export const errorText = (error, fallback) => error.response?.data?.message || fallback

const GOOD = ['APPROVED', 'DONE', 'CLOSED', 'COMPLETED', 'CONFIRMED', 'PAID', 'WON', 'DELIVERED', 'RESOLVED', 'ACCEPTED', 'AWARDED', 'SIGNED', 'SAFE', 'RELEASED', 'QUOTED']
const BAD = ['REJECTED', 'CANCELLED', 'DECLINED', 'LOST', 'TERMINATED', 'VOID', 'RETIRED', 'WITHDRAWN', 'RETURNED']
const WARN = ['WAITLISTED', 'WAITING', 'EXPIRED', 'REPAIR', 'INVESTIGATING']

export function statusTone(status) {
  if (GOOD.includes(status)) return 'zx-accepted'
  if (BAD.includes(status)) return 'zx-rejected'
  if (WARN.includes(status)) return 'zx-expired'
  if (['DRAFT', 'ARCHIVED', 'BACKLOG'].includes(status)) return ''
  return 'zx-sent'
}

export function formatValue(field, value, labels = {}, t = (text) => text) {
  if (value === undefined || value === null || value === '') return '—'
  switch (field.type) {
    case 'money': return euro(value)
    case 'percent': return `${value}%`
    case 'boolean': return t(value ? 'Yes' : 'No')
    case 'datetime': return new Date(value).toLocaleString()
    case 'select': return t(humanize(value))
    case 'user': case 'org': case 'product': case 'ref': return labels?.[value] || '—'
    default: return String(value)
  }
}

/** Converts a stored value into what the matching HTML input expects. */
export function toInputValue(field, value) {
  if (value === undefined || value === null) return ''
  if (field.type === 'datetime') {
    const date = new Date(value)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  return value
}
