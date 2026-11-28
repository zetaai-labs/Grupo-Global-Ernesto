// Plain names for the short role codes stored in the database (Schema Document §3).
// Screens show these (translated with t) instead of codes such as "tech_admin".
export const ROLE_LABELS = {
  admin: 'Super Administrator',
  tech_admin: 'Technical Administrator',
  hr: 'HR Manager',
  finance: 'Finance Manager',
  manager: 'Manager / Delegate',
  employee: 'Employee / Delegate',
  partner: 'Partner company',
  client: 'Client company',
  supplier: 'Supplier / Vendor',
  investor: 'Confidential Investor',
}

/** The English label for a role code, for t(); unknown codes are returned unchanged. */
export const roleLabel = (role) => ROLE_LABELS[String(role || '').toLowerCase()] || role || ''
