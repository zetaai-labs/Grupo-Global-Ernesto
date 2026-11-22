import { STAFF_ROLES } from '../config/roles.js'
import { notifyRoles } from '../services/notification.service.js'
import { priceLine, totals } from '../services/commercial.service.js'

/** Business rules for ZYLAX modules. Every function runs inside the record's database transaction. */

export const httpError = (status, message) => Object.assign(new Error(message), { status })
export const lock = (client, key) => client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key])

export const ANNUAL_LEAVE_DAYS = 22
export const APPROVAL_LIMITS = { manager: 1000, finance: 10000 }
const SLA_HOURS = { P1: 4, P2: 8, P3: 24, P4: 72 }
const ONBOARDING_TASKS = [
  ['Create platform account and access', 'ACCESS', 0],
  ['Enable multi-factor authentication', 'ACCESS', 0],
  ['Prepare laptop and equipment', 'EQUIPMENT', 0],
  ['Sign Code of Ethics and NDA', 'POLICY', 1],
  ['Corporate welcome session', 'WELCOME', 1],
  ['Complete mandatory training', 'TRAINING', 7],
]

export function workingDays(start, end) {
  let days = 0
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cursor <= last) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) days += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export function requiredApprover(amount) {
  if (amount <= APPROVAL_LIMITS.manager) return 'manager'
  if (amount <= APPROVAL_LIMITS.finance) return 'finance'
  return 'admin'
}

const canApproveAmount = (role, amount) => {
  const needed = requiredApprover(amount)
  if (role === 'admin') return true
  if (needed === 'manager') return role === 'manager' || role === 'finance'
  return needed === 'finance' && role === 'finance'
}

const setSla = (draft) => {
  const hours = SLA_HOURS[draft.data.priority] || SLA_HOURS.P3
  draft.data.sla_due = new Date(Date.now() + hours * 3600000).toISOString()
}

const scoreInspection = (draft) => {
  const { items_total: total, items_passed: passed } = draft.data
  if (passed != null && total == null) throw httpError(400, 'Enter the number of items checked.')
  if (total != null && passed != null && passed > total) throw httpError(400, 'Items passed cannot exceed items checked.')
  draft.data.score = total ? Math.round(((passed || 0) / total) * 1000) / 10 : null
}

export const rules = {
  performance: {
    async create(ctx, draft) {
      if (draft.assigned_to === ctx.user.sub) throw httpError(403, 'You cannot write your own performance log.')
    },
  },
  leave: {
    async create(ctx, draft) {
      const { start_date: start, end_date: end, leave_type: type } = draft.data
      const days = workingDays(start, end)
      if (!days) throw httpError(400, 'The selected period has no working days.')
      await lock(ctx.client, `zx-leave-${ctx.user.sub}`)
      const overlap = await ctx.client.query(
        `SELECT 1 FROM zx_records WHERE module = 'attendance' AND entity = 'leave' AND created_by = $1
         AND status IN ('SUBMITTED', 'APPROVED') AND (data->>'start_date')::date <= $3::date AND (data->>'end_date')::date >= $2::date LIMIT 1`,
        [ctx.user.sub, start, end],
      )
      if (overlap.rowCount) throw httpError(409, 'You already have leave in this period.')
      if (type === 'ANNUAL') {
        if (start.slice(0, 4) !== end.slice(0, 4)) throw httpError(400, 'Split annual leave that crosses two years.')
        const used = await ctx.client.query(
          `SELECT COALESCE(sum((data->>'days')::numeric), 0) AS days FROM zx_records
           WHERE module = 'attendance' AND entity = 'leave' AND created_by = $1 AND status IN ('SUBMITTED', 'APPROVED')
           AND data->>'leave_type' = 'ANNUAL' AND left(data->>'start_date', 4) = $2`,
          [ctx.user.sub, start.slice(0, 4)],
        )
        const left = ANNUAL_LEAVE_DAYS - Number(used.rows[0].days)
        if (days > left) throw httpError(409, `Only ${left} annual leave days remain.`)
      }
      draft.data.days = days
    },
  },

  emergency: {
    async afterCreate(ctx, record) {
      ctx.after.push(() => notifyRoles(STAFF_ROLES, {
        type: 'security', title: `EMERGENCY: ${record.title}`, body: `${record.data.location}. Please check in now.`, link: '/intranet/zylax/safety',
      }))
    },
  },

  muster: {
    async create(ctx, draft) {
      const { rows } = await ctx.client.query(`SELECT status FROM zx_records WHERE record_id = $1 FOR SHARE`, [draft.data.emergency])
      if (rows[0]?.status !== 'ACTIVE') throw httpError(409, 'This emergency is no longer active.')
      if (draft.data.state === 'NEEDS_HELP') {
        ctx.after.push(() => notifyRoles(['admin', 'hr', 'manager'], {
          type: 'security', title: `${ctx.user.name} needs help`, body: draft.data.location || 'Location not given.', link: '/intranet/zylax/safety',
        }))
      }
    },
  },

  sla: { create: async (_ctx, draft) => setSla(draft) },

  approval: {
    async create(_ctx, draft) {
      draft.data.required_level = requiredApprover(draft.data.amount_eur)
    },
    async transition(ctx, record, to) {
      if (to === 'APPROVED' && !canApproveAmount(ctx.user.role, Number(record.data.amount_eur))) {
        throw httpError(403, `This amount needs approval from: ${record.data.required_level}.`)
      }
    },
  },

  stockMove: {
    async create(ctx, draft) {
      const { product, qty, direction } = draft.data
      const sign = direction === 'IN' ? 1 : -1
      const result = await ctx.client.query(
        'UPDATE zx_products SET stock_qty = stock_qty + $2, updated_at = now() WHERE product_id = $1 AND stock_qty + $2 >= 0',
        [product, sign * qty],
      )
      if (!result.rowCount) throw httpError(409, 'Not enough stock for this movement.')
    },
  },

  bid: {
    async create(ctx, draft) {
      await lock(ctx.client, `zx-bid-${draft.data.tender}-${draft.customer_org_id}`)
      const { rows } = await ctx.client.query(
        `SELECT status, (data->>'deadline')::date < CURRENT_DATE AS closed FROM zx_records WHERE record_id = $1 FOR SHARE`,
        [draft.data.tender],
      )
      if (rows[0]?.status !== 'OPEN' || rows[0].closed) throw httpError(409, 'This tender is not open for bids.')
      const existing = await ctx.client.query(
        `SELECT 1 FROM zx_records WHERE module = 'procurement' AND entity = 'bids' AND customer_org_id = $1
         AND data->>'tender' = $2 AND status = 'SUBMITTED' LIMIT 1`,
        [draft.customer_org_id, draft.data.tender],
      )
      if (existing.rowCount) throw httpError(409, 'Your company already has an active bid on this tender.')
    },
    async transition(ctx, record, to) {
      if (to !== 'AWARDED') return
      const { rows } = await ctx.client.query('SELECT record_id, title, status FROM zx_records WHERE record_id = $1 FOR UPDATE', [record.data.tender])
      if (rows[0]?.status !== 'OPEN') throw httpError(409, 'This tender has already been closed.')
    },
    async afterTransition(ctx, record, _from, to) {
      if (to !== 'AWARDED') return
      const tender = (await ctx.client.query('SELECT title FROM zx_records WHERE record_id = $1', [record.data.tender])).rows[0]
      await ctx.client.query(`UPDATE zx_records SET status = 'AWARDED', updated_at = now() WHERE record_id = $1`, [record.data.tender])
      await ctx.client.query(
        `UPDATE zx_records SET status = 'REJECTED', updated_at = now()
         WHERE module = 'procurement' AND entity = 'bids' AND data->>'tender' = $1 AND status = 'SUBMITTED' AND record_id <> $2`,
        [record.data.tender, record.record_id],
      )
      await ctx.insert('procurement', 'purchase_orders', {
        title: `PO: ${tender.title}`.slice(0, 255),
        customer_org_id: record.customer_org_id,
        data: { supplier: record.customer_org_id, amount_eur: record.data.amount_eur, tender: record.data.tender },
      })
    },
  },

  onboardingPlan: {
    async afterCreate(ctx, record) {
      for (const [title, area, offset] of ONBOARDING_TASKS) {
        const due = new Date(`${record.data.start_date}T00:00:00Z`)
        due.setUTCDate(due.getUTCDate() + offset)
        await ctx.insert('onboarding', 'tasks', {
          title,
          assigned_to: area === 'POLICY' || area === 'TRAINING' ? record.assigned_to : ctx.user.sub,
          data: {
            plan: record.record_id, area, due_date: due.toISOString().slice(0, 10),
            owner: area === 'POLICY' || area === 'TRAINING' ? record.assigned_to : ctx.user.sub,
          },
        })
      }
    },
  },

  inspection: {
    create: async (_ctx, draft) => scoreInspection(draft),
    update: async (_ctx, draft) => scoreInspection(draft),
    async transition(_ctx, record, to) {
      if (to === 'SUBMITTED' && !record.data.items_total) throw httpError(409, 'Record the inspection results before submitting.')
    },
  },

  siteReport: {
    async afterCreate(ctx, record) {
      if (record.data.progress_pct == null) return
      await ctx.client.query(
        `UPDATE zx_records SET data = jsonb_set(data, '{progress_pct}', to_jsonb($2::numeric)), updated_at = now() WHERE record_id = $1`,
        [record.data.site, record.data.progress_pct],
      )
    },
  },

  spaceCapacity: {
    async create(ctx, draft) {
      const { rows } = await ctx.client.query('SELECT data FROM zx_records WHERE record_id = $1', [draft.data.space])
      if (draft.data.attendees > Number(rows[0]?.data?.capacity || 0)) throw httpError(409, 'Too many attendees for this space.')
    },
    async update(ctx, draft) {
      return this.create(ctx, draft)
    },
  },
}

/** RFQ automation: turns a request into a priced draft quote, applying any agreed distributor discount. */
export async function convertRfq(ctx, record) {
  if (!['NEW', 'REVIEWING'].includes(record.status)) throw httpError(409, 'This request has already been processed.')
  const org = await ctx.client.query('SELECT verification_status FROM organizations WHERE org_id = $1', [record.customer_org_id])
  if (org.rows[0]?.verification_status !== 'VERIFIED') throw httpError(409, 'The customer must pass KYC/KYB verification first.')
  const { rows } = await ctx.client.query('SELECT product_id, sku, name, unit_price_eur, tax_rate, active FROM zx_products WHERE product_id = $1', [record.data.product])
  const product = rows[0]
  if (!product?.active) throw httpError(409, 'This product is no longer available.')
  const partner = await ctx.client.query(`SELECT discount_pct FROM zx_distributors WHERE org_id = $1 AND status = 'ACTIVE'`, [record.customer_org_id])
  const discount = Number(partner.rows[0]?.discount_pct || 0)
  const line = priceLine({ qty: record.data.qty, unit_price_eur: product.unit_price_eur, discount_pct: discount, tax_rate: product.tax_rate })
  const sum = totals([line])
  const quote = await ctx.client.query(
    `INSERT INTO zx_quotes (quote_number, customer_org_id, valid_until, notes, net_eur, tax_eur, total_eur, owner_org_id, created_by)
     VALUES ('Q-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('zx_quote_seq')::text, 5, '0'), $1, CURRENT_DATE + 30, $2, $3, $4, $5, $6, $7)
     RETURNING quote_id, quote_number`,
    [record.customer_org_id, `From request ${record.ref_no}.`, sum.net_eur, sum.tax_eur, sum.total_eur, ctx.user.org_id || null, ctx.user.sub],
  )
  await ctx.client.query(
    `INSERT INTO zx_quote_lines (quote_id, product_id, sku, name, qty, unit_price_eur, discount_pct, tax_rate, net_eur, tax_eur)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [quote.rows[0].quote_id, product.product_id, product.sku, product.name, record.data.qty, product.unit_price_eur, discount, product.tax_rate, line.net_eur, line.tax_eur],
  )
  await ctx.client.query(
    `UPDATE zx_records SET status = 'QUOTED', data = data || $2::jsonb, updated_at = now() WHERE record_id = $1`,
    [record.record_id, JSON.stringify({ quote_number: quote.rows[0].quote_number, quote_id: quote.rows[0].quote_id })],
  )
  return { to: 'QUOTED', message: quote.rows[0].quote_number }
}

export const actions = { convertRfq }
