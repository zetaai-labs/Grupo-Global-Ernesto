// Countries offered on the registration form (ISO 3166-1 alpha-3) and the corridor each belongs to
// (Schema Document §2.2). Names are shown in the visitor's language by Intl.DisplayNames.
const EU = ['ESP', 'PRT', 'FRA', 'ITA', 'DEU', 'NLD', 'BEL', 'LUX', 'IRL', 'AUT', 'POL', 'CZE', 'SVK', 'HUN', 'ROU', 'BGR', 'GRC', 'CYP', 'MLT', 'HRV', 'SVN', 'DNK', 'SWE', 'FIN', 'EST', 'LVA', 'LTU']
const OTHER_EUROPE = ['GBR', 'CHE', 'NOR']
const GULF = ['ARE', 'SAU', 'QAT', 'KWT', 'BHR', 'OMN']
const LATAM = ['MEX', 'COL', 'ARG', 'BRA', 'CHL', 'PER', 'ECU', 'URY', 'PAN', 'CRI', 'DOM', 'VEN', 'BOL', 'PRY', 'GTM']

export const COUNTRY_CORRIDOR = {
  ...Object.fromEntries([...EU, ...OTHER_EUROPE].map((code) => [code, 'SPAIN_EU'])),
  IND: 'INDIA',
  ...Object.fromEntries(GULF.map((code) => [code, 'UAE_DUBAI'])),
  ...Object.fromEntries(LATAM.map((code) => [code, 'LATAM'])),
  USA: 'USA_CAN',
  CAN: 'USA_CAN',
  MAR: 'MOROCCO',
}

// ISO alpha-3 → alpha-2, only to look up the country's name in the browser's language.
const ALPHA2 = {
  ESP: 'ES', PRT: 'PT', FRA: 'FR', ITA: 'IT', DEU: 'DE', NLD: 'NL', BEL: 'BE', LUX: 'LU', IRL: 'IE', AUT: 'AT', POL: 'PL', CZE: 'CZ', SVK: 'SK',
  HUN: 'HU', ROU: 'RO', BGR: 'BG', GRC: 'GR', CYP: 'CY', MLT: 'MT', HRV: 'HR', SVN: 'SI', DNK: 'DK', SWE: 'SE', FIN: 'FI', EST: 'EE', LVA: 'LV',
  LTU: 'LT', GBR: 'GB', CHE: 'CH', NOR: 'NO', IND: 'IN', ARE: 'AE', SAU: 'SA', QAT: 'QA', KWT: 'KW', BHR: 'BH', OMN: 'OM', MEX: 'MX', COL: 'CO',
  ARG: 'AR', BRA: 'BR', CHL: 'CL', PER: 'PE', ECU: 'EC', URY: 'UY', PAN: 'PA', CRI: 'CR', DOM: 'DO', VEN: 'VE', BOL: 'BO', PRY: 'PY', GTM: 'GT',
  USA: 'US', CAN: 'CA', MAR: 'MA',
}

/** [{ code, name }] sorted by name in `language`, with Spain and India first. */
export function countryOptions(language = 'en') {
  let names
  try { names = new Intl.DisplayNames([language], { type: 'region' }) } catch { names = null }
  const named = Object.keys(COUNTRY_CORRIDOR).map((code) => ({ code, name: names?.of(ALPHA2[code]) || code }))
  const first = ['ESP', 'IND']
  return [
    ...first.map((code) => named.find((item) => item.code === code)),
    ...named.filter((item) => !first.includes(item.code)).sort((a, b) => a.name.localeCompare(b.name, language)),
  ]
}
