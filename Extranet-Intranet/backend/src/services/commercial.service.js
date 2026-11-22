/** Money maths for quotes and orders. Everything is calculated in whole cents to avoid rounding drift. */
const cents = (value) => Math.round(Number(value) * 100)
const euros = (value) => (value / 100).toFixed(2)

export function priceLine({ qty, unit_price_eur, discount_pct = 0, tax_rate = 0 }) {
  const net = Math.round((qty * cents(unit_price_eur) * (10000 - cents(discount_pct))) / 10000)
  const tax = Math.round((net * cents(tax_rate)) / 10000)
  return { net_cents: net, tax_cents: tax, net_eur: euros(net), tax_eur: euros(tax) }
}

export function totals(lines) {
  const net = lines.reduce((sum, line) => sum + line.net_cents, 0)
  const tax = lines.reduce((sum, line) => sum + line.tax_cents, 0)
  return { net_eur: euros(net), tax_eur: euros(tax), total_eur: euros(net + tax) }
}

/** Allowed order status moves. Delivered and cancelled orders are final. */
export const ORDER_TRANSITIONS = {
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
}

/** Highest discount a role may give by hand; an agreed distributor discount is always allowed. */
export function maxDiscount(role, distributorDiscount = 0) {
  const limit = ['admin', 'manager'].includes(role) ? 50 : 10
  return Math.max(limit, Number(distributorDiscount) || 0)
}
