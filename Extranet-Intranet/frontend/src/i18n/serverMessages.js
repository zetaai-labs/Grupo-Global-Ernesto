import { getLanguage, translate } from './index'

/**
 * Translates text produced by the server (errors and notifications).
 * Fixed messages use the dictionary; messages with a value in them use the patterns below.
 */
const humanize = (value) => {
  const text = String(value || '').replaceAll('_', ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1)
const status = (value) => lower(translate(humanize(value)))

const PATTERNS = [
  [/^(.+) is required\.$/, (m) => `${translate(m[1])}: campo obligatorio.`],
  [/^(.+) is not valid\.$/, (m) => `${translate(m[1])}: valor no válido.`],
  [/^(.+): selected value is not available\.$/, (m) => `${translate(m[1])}: el valor seleccionado no está disponible.`],
  [/^This (.+) is already registered\.$/, (m) => `Este dato ya está registrado (${lower(translate(m[1].charAt(0).toUpperCase() + m[1].slice(1)))}).`],
  [/^Already booked for this time \((.+)\)\.$/, (m) => `Ya está reservado para ese horario (${m[1]}).`],
  [/^Your maximum discount is (.+)%\.$/, (m) => `Tu descuento máximo es del ${m[1]} %.`],
  [/^Not enough stock for (.+)\.$/, (m) => `No hay stock suficiente de ${m[1]}.`],
  [/^An order cannot move from (\w+) to (\w+)\.$/, (m) => `Un pedido no puede pasar de ${status(m[1])} a ${status(m[2])}.`],
  [/^Already invoiced: (.+)\.$/, (m) => `Ya facturado: ${m[1]}.`],
  [/^Only (.+) annual leave days remain\.$/, (m) => `Solo quedan ${m[1]} días de vacaciones.`],
  [/^This amount needs approval from: (\w+)\.$/, (m) => `Este importe requiere la aprobación de: ${({ manager: 'responsable', finance: 'Finanzas', admin: 'Superadministrador' })[m[1]] || m[1]}.`],
  [/^New quote (.+)$/, (m) => `Nuevo presupuesto ${m[1]}`],
  [/^Quote (.+) declined$/, (m) => `Presupuesto ${m[1]} rechazado`],
  [/^Order (.+) confirmed$/, (m) => `Pedido ${m[1]} confirmado`],
  [/^Order (.+): (.+)$/, (m) => `Pedido ${m[1]}: ${status(m[2])}`],
  [/^From quote (.+)\.$/, (m) => `Del presupuesto ${m[1]}.`],
  [/^From request (.+)\.$/, (m) => `De la solicitud ${m[1]}.`],
  [/^New comment on (.+)$/, (m) => `Nuevo comentario en ${m[1]}`],
  [/^EMERGENCY: (.+)$/, (m) => `EMERGENCIA: ${m[1]}`],
  [/^(.+) needs help$/, (m) => `${m[1]} necesita ayuda`],
  [/^(.+)\. Please check in now\.$/, (m) => `${m[1]}. Registra tu estado ahora.`],
  [/^(ZX-[A-Z0-9]+-\d+): (.+)$/, (m) => `${m[1]}: ${status(m[2])}`],
  [/^(.+): your place is confirmed$/, (m) => `${translate(m[1])}: tu plaza está confirmada`],
  [/^(.+): (.+)$/, (m) => (translate(m[1]) !== m[1] ? `${translate(m[1])}: ${m[2]}` : null)],
]

export function translateServer(text) {
  if (!text || getLanguage() !== 'es') return text
  const exact = translate(text)
  if (exact !== text) return exact
  for (const [pattern, build] of PATTERNS) {
    const match = String(text).match(pattern)
    if (!match) continue
    const result = build(match)
    if (result) return result
  }
  return text
}
