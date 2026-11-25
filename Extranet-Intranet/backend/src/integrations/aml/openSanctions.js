/**
 * Automatic AML screening through the OpenSanctions matching API (sanctions, PEPs and other risk lists).
 * Screens the company and its directors / beneficial owners in one request.
 * Off unless AML_PROVIDER=opensanctions and OPENSANCTIONS_API_KEY are set. Each query is a paid API call,
 * and commercial use of the data needs an OpenSanctions licence.
 * Docs: https://www.opensanctions.org/docs/api/request/ and /docs/api/response/
 */

const API_URL = 'https://api.opensanctions.org/match/default'
const TIMEOUT_MS = 15000
const MAX_MATCHES_KEPT = 5
export const CHECKS = ['SANCTIONS', 'PEP', 'ADVERSE_MEDIA']

/** ISO 3166 alpha-3 to the lowercase alpha-2 codes the API matches on. Unknown countries are simply left out. */
const COUNTRIES = {
  ESP: 'es', PRT: 'pt', FRA: 'fr', DEU: 'de', ITA: 'it', NLD: 'nl', BEL: 'be', IRL: 'ie', AUT: 'at', GRC: 'gr', POL: 'pl',
  SWE: 'se', DNK: 'dk', FIN: 'fi', LUX: 'lu', CZE: 'cz', ROU: 'ro', HUN: 'hu', BGR: 'bg', HRV: 'hr', SVK: 'sk', SVN: 'si',
  EST: 'ee', LVA: 'lv', LTU: 'lt', CYP: 'cy', MLT: 'mt', GBR: 'gb', CHE: 'ch', NOR: 'no', IND: 'in', ARE: 'ae', MAR: 'ma',
  USA: 'us', CAN: 'ca', MEX: 'mx', COL: 'co', ARG: 'ar', BRA: 'br', CHL: 'cl', PER: 'pe', SAU: 'sa', QAT: 'qa', CHN: 'cn',
}
const countryCode = (value) => COUNTRIES[String(value || '').toUpperCase()]

export const amlConfigured = () => process.env.AML_PROVIDER === 'opensanctions' && Boolean(process.env.OPENSANCTIONS_API_KEY?.trim())

export function amlThreshold() {
  const value = Number(process.env.AML_MATCH_THRESHOLD || 0.7)
  return value >= 0.5 && value <= 1 ? value : 0.7
}

/** Which of the three screening checks a list entry belongs to, by its OpenSanctions topics. */
export function categoriesFor(topics = []) {
  const found = new Set()
  for (const topic of topics) {
    if (topic === 'sanction' || topic.startsWith('sanction.')) found.add('SANCTIONS')
    else if (topic === 'role.pep' || topic === 'role.rca') found.add('PEP')
    else if (topic.startsWith('crime') || topic.startsWith('reg.') || ['debarment', 'corp.disqual', 'wanted'].includes(topic)) found.add('ADVERSE_MEDIA')
  }
  return [...found]
}

function companyQuery(org) {
  const properties = { name: [String(org.legal_name).trim()] }
  if (countryCode(org.country)) properties.jurisdiction = [countryCode(org.country)]
  const registration = String(org.tax_id || '').trim()
  if (registration && !/^(DEMO|TO-BE)/i.test(registration)) properties.registrationNumber = [registration]
  return { schema: 'Company', properties }
}

function personQuery(person) {
  const properties = { name: [String(person.full_name).trim()] }
  if (countryCode(person.nationality)) properties.nationality = [countryCode(person.nationality)]
  if (person.birth_year) properties.birthDate = [String(person.birth_year)]
  return { schema: 'Person', properties }
}

/** One request body: the company under "org" and each person under "p<index>". */
export function buildQuery(org, people = []) {
  const queries = { org: companyQuery(org) }
  people.forEach((person, index) => { queries[`p${index}`] = personQuery(person) })
  return { queries }
}

const clear = () => ({ SANCTIONS: 'CLEAR', PEP: 'CLEAR', ADVERSE_MEDIA: 'CLEAR' })

function evaluate(results, threshold, subject) {
  const outcome = { ...clear(), matches: [] }
  for (const entry of results) {
    if (entry?.match !== true && !(Number(entry?.score) >= threshold)) continue
    const topics = Array.isArray(entry.properties?.topics) ? entry.properties.topics.map(String) : []
    const categories = categoriesFor(topics)
    for (const category of categories) outcome[category] = 'HIT'
    if (outcome.matches.length < MAX_MATCHES_KEPT) {
      outcome.matches.push({
        id: String(entry.id || '').slice(0, 100), name: String(entry.caption || '').slice(0, 200),
        score: Math.round(Number(entry.score || 0) * 100) / 100, categories, topics: topics.slice(0, 10), subject,
      })
    }
  }
  return outcome
}

const unreachable = () => Object.assign(new Error('The screening service could not be reached. Nothing was recorded.'), { status: 503 })

/**
 * Screens a company and its people. Throws when the service cannot answer, so nothing is recorded as CLEAR by mistake.
 * @returns {{ SANCTIONS, PEP, ADVERSE_MEDIA, matches, threshold, people: Array<{ person_id, SANCTIONS, PEP, ADVERSE_MEDIA, matches }> }}
 */
export async function screenParties(org, people = []) {
  if (!amlConfigured()) throw Object.assign(new Error('Automatic screening is not configured.'), { status: 503 })
  const threshold = amlThreshold()
  let body
  try {
    const response = await fetch(`${API_URL}?threshold=${threshold}`, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${process.env.OPENSANCTIONS_API_KEY.trim()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(buildQuery(org, people)),
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`status ${response.status}`)
    body = await response.json()
  } catch {
    throw unreachable()
  }
  const answer = (key) => body?.responses?.[key]?.results
  if (!Array.isArray(answer('org')) || people.some((_, index) => !Array.isArray(answer(`p${index}`)))) throw unreachable()

  const company = evaluate(answer('org'), threshold, org.legal_name)
  const total = { ...company, matches: [...company.matches], threshold, people: [] }
  people.forEach((person, index) => {
    const result = evaluate(answer(`p${index}`), threshold, person.full_name)
    total.people.push({ person_id: person.person_id, ...result })
    for (const check of CHECKS) if (result[check] === 'HIT') total[check] = 'HIT'
    total.matches.push(...result.matches)
  })
  total.matches = total.matches.slice(0, MAX_MATCHES_KEPT * 3)
  return total
}

/** The company alone. Kept for callers that screen without people. */
export const screenOrganization = (org) => screenParties(org, [])
