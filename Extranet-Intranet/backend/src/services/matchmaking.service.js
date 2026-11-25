import { query } from '../config/database.js'
import { CORRIDORS } from '../config/roles.js'

/**
 * B2B matchmaking (Technical Spec §2.2): every person becomes a vector built from their
 * organisation's sectors, the sector committees they joined, the events they registered for,
 * their corridor and their organisation type. Suggestions rank other people by cosine
 * similarity of interests, plus bonuses for complementary roles (a client meets a vendor,
 * an investor meets a project owner) and for bilateral corridors (Spain ↔ India, …).
 * Every suggestion comes with the reasons that produced it.
 */

const WEIGHTS = { orgSector: 1.0, investorSector: 1.0, committeeSector: 0.8, committee: 0.6, event: 0.4 }
const SIMILARITY_SHARE = 0.6
const COMPLEMENT_BONUS = 0.25
const CORRIDOR_BONUS = 0.15

// Organisation types that usually have something to offer each other.
const COMPLEMENTS = new Set([
  'CLIENT:VENDOR', 'CLIENT:STRATEGIC_PARTNER', 'CLIENT:BUSINESS_UNIT',
  'INVESTOR:STRATEGIC_PARTNER', 'INVESTOR:BUSINESS_UNIT', 'INVESTOR:DELEGATION_NODE',
  'VENDOR:BUSINESS_UNIT', 'STRATEGIC_PARTNER:BUSINESS_UNIT', 'DELEGATION_NODE:BUSINESS_UNIT',
])
export const complementary = (a, b) => Boolean(a && b && a !== b && (COMPLEMENTS.has(`${a}:${b}`) || COMPLEMENTS.has(`${b}:${a}`)))

const humanize = (code) => String(code || '').replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
const CORRIDOR_NAMES = Object.fromEntries(CORRIDORS)
const SECTOR_NAMES = { FINTECH: 'Fintech', REAL_ESTATE: 'Real estate', HEALTHCARE: 'Healthcare', CYBERSECURITY: 'Cybersecurity', CROSS_BORDER_TRADE: 'Cross-border trade' }
const sectorName = (code) => SECTOR_NAMES[code] || humanize(code)
const corridorName = (code) => CORRIDOR_NAMES[code] || humanize(code)

/** Sparse vector: Map of dimension → weight. */
export function cosine(a, b) {
  let dot = 0
  for (const [key, value] of a) if (b.has(key)) dot += value * b.get(key)
  if (!dot) return 0
  const norm = (v) => Math.sqrt([...v.values()].reduce((sum, x) => sum + x * x, 0))
  return dot / (norm(a) * norm(b))
}

/** Profiles (vector + facts) for the given user ids. */
async function profiles(userIds) {
  if (!userIds.length) return new Map()
  const { rows } = await query(
    `SELECT u.id, u.name, u.video_bio_url, u.org_id, o.legal_name AS organisation, o.org_type, o.sectors,
            COALESCE(o.region_corridor, rg.code) AS corridor,
            (SELECT array_agg(DISTINCT v.sector_focus) FROM investors_vault v WHERE v.org_id = u.org_id) AS investor_sectors,
            (SELECT json_agg(json_build_object('id', c.committee_id, 'name', c.name, 'sector', c.sector))
             FROM community_committee_members m JOIN community_committees c ON c.committee_id = m.committee_id WHERE m.user_id = u.id) AS committees,
            (SELECT array_agg(DISTINCT r.data->>'event') FROM zx_records r
             WHERE r.module = 'events' AND r.entity = 'registrations' AND r.created_by = u.id AND r.status IN ('CONFIRMED', 'COMPLETED')) AS events
     FROM users u
     LEFT JOIN organizations o ON o.org_id = u.org_id
     LEFT JOIN regions rg ON rg.id = u.region_id
     WHERE u.id = ANY($1::int[]) AND u.status = 'active' AND NOT u.processing_opposed`,
    [userIds],
  )
  const out = new Map()
  for (const row of rows) {
    const vector = new Map()
    const add = (key, weight) => vector.set(key, Math.max(vector.get(key) || 0, weight))
    for (const sector of row.sectors || []) add(`sector:${sector}`, WEIGHTS.orgSector)
    for (const sector of row.investor_sectors || []) if (sector) add(`sector:${sector}`, WEIGHTS.investorSector)
    for (const committee of row.committees || []) {
      add(`sector:${committee.sector}`, WEIGHTS.committeeSector)
      add(`committee:${committee.id}`, WEIGHTS.committee)
    }
    for (const event of row.events || []) if (event) add(`event:${event}`, WEIGHTS.event)
    out.set(row.id, { ...row, vector, committees: row.committees || [] })
  }
  return out
}

function explain(me, other) {
  const reasons = []
  const mySectors = new Set([...me.vector.keys()].filter((k) => k.startsWith('sector:')))
  const shared = [...other.vector.keys()].filter((k) => k.startsWith('sector:') && mySectors.has(k)).map((k) => sectorName(k.slice(7)))
  if (shared.length) reasons.push({ code: 'SECTOR', text: `Same sector: ${shared.slice(0, 3).join(', ')}`, template: 'Same sector: {list}', params: { list: shared.slice(0, 3) } })
  const myCommittees = new Set(me.committees.map((c) => c.id))
  const sharedCommittees = other.committees.filter((c) => myCommittees.has(c.id)).map((c) => c.name)
  if (sharedCommittees.length) reasons.push({ code: 'COMMITTEE', text: `Both in ${sharedCommittees.slice(0, 2).join(', ')}`, template: 'Both in {list}', params: { list: sharedCommittees.slice(0, 2) } })
  if (complementary(me.org_type, other.org_type)) reasons.push({ code: 'COMPLEMENT', text: `${humanize(me.org_type)} ↔ ${humanize(other.org_type)}`, template: '{a} ↔ {b}', params: { a: humanize(me.org_type), b: humanize(other.org_type) } })
  if (me.corridor && other.corridor && me.corridor !== other.corridor && me.corridor !== 'GLOBAL' && other.corridor !== 'GLOBAL') {
    reasons.push({ code: 'CORRIDOR', text: `${corridorName(me.corridor)} ↔ ${corridorName(other.corridor)} corridor`, template: '{a} ↔ {b} corridor', params: { a: corridorName(me.corridor), b: corridorName(other.corridor) } })
  }
  return reasons
}

/**
 * Ranks `candidateIds` for `userId`. People from the same organisation and people the user has
 * already met (an accepted B2B meeting) are left out.
 */
export async function suggest(userId, candidateIds, limit = 8) {
  const ids = [...new Set(candidateIds.filter((id) => id !== userId))]
  const all = await profiles([userId, ...ids])
  const me = all.get(userId)
  if (!me) return []
  const met = await query(
    `SELECT DISTINCT CASE WHEN requester_id = $1 THEN recipient_id ELSE requester_id END AS other
     FROM b2b_meetings WHERE status = 'ACCEPTED' AND $1 IN (requester_id, recipient_id)`,
    [userId],
  )
  const alreadyMet = new Set(met.rows.map((row) => row.other))
  const results = []
  for (const id of ids) {
    const other = all.get(id)
    if (!other || alreadyMet.has(id) || (me.org_id && other.org_id === me.org_id)) continue
    const similarity = cosine(me.vector, other.vector)
    const complement = complementary(me.org_type, other.org_type) ? COMPLEMENT_BONUS : 0
    const corridor = me.corridor && other.corridor && me.corridor !== other.corridor && me.corridor !== 'GLOBAL' && other.corridor !== 'GLOBAL' ? CORRIDOR_BONUS : 0
    const score = SIMILARITY_SHARE * similarity + complement + corridor
    if (score <= 0) continue
    results.push({
      user_id: id, name: other.name, organisation: other.organisation, video_bio_url: other.video_bio_url,
      score: Math.round(Math.min(1, score) * 100), reasons: explain(me, other),
    })
  }
  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit)
}
