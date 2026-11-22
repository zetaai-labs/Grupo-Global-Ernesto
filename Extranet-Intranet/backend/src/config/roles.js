/**
 * Single source of truth for roles (Schema Document §3 — RBAC).
 * Internal role names stay short (used in the database and tokens); each maps to
 * the document's role code and authority level.
 */
export const ROLE_DEFINITIONS = {
  admin: { code: 'ROLE_SUPER_ADMIN', level: '0', label: 'Super Administrator / Presidency' },
  tech_admin: { code: 'ROLE_TECH_ADMIN', level: '1', label: 'Technical Administrator' },
  hr: { code: 'ROLE_HR_MGR', level: '2', label: 'Human Resources Manager' },
  finance: { code: 'ROLE_FINANCE_MGR', level: '2', label: 'Finance Manager' },
  manager: { code: 'ROLE_EMPLOYEE_DELEGATE', level: '3', label: 'Manager / Delegate' },
  employee: { code: 'ROLE_EMPLOYEE_DELEGATE', level: '3', label: 'Employee / International Delegate' },
  partner: { code: 'ROLE_CLIENT_PARTNER', level: '4', label: 'Partner Company' },
  client: { code: 'ROLE_CLIENT_PARTNER', level: '4', label: 'Client Company' },
  supplier: { code: 'ROLE_CLIENT_PARTNER', level: '4', label: 'Supplier / Vendor' },
  investor: { code: 'ROLE_INVESTOR_VAULT', level: '0-S', label: 'Confidential Investor' },
}

/** Internal staff (Intranet). */
export const STAFF_ROLES = ['admin', 'tech_admin', 'hr', 'finance', 'manager', 'employee']
/** External accounts (Extranet). */
export const EXTERNAL_ROLES = ['partner', 'client', 'supplier', 'investor']
/** External companies that folders can be shared with. */
export const SHARE_RECIPIENT_ROLES = ['partner', 'client', 'supplier', 'investor']
/** System administration: backups, audit log, user accounts (Super + Tech Admin). */
export const SYSTEM_ADMIN_ROLES = ['admin', 'tech_admin']
/** Who may add and suspend accounts. HR is limited to HR_MANAGED_ROLES. */
export const ACCOUNT_MANAGER_ROLES = [...SYSTEM_ADMIN_ROLES, 'hr']
/** Personnel HR manages (Schema Document §3). Privileged and external accounts stay outside HR's reach. */
export const HR_MANAGED_ROLES = ['manager', 'employee']
/** Roles that may approve AutoFlow steps. */
export const APPROVER_ROLES = ['admin', 'manager', 'hr']
/** Roles that receive operational alerts (uploads, KYC submissions…). */
export const OPERATIONS_ROLES = ['admin', 'manager']
/** Technical Spec §3.1: MFA is mandatory for SuperAdmin, Tech, Finance and HR accounts. */
export const MFA_REQUIRED_ROLES = ['admin', 'tech_admin', 'hr', 'finance']

export function roleCode(role) {
  return ROLE_DEFINITIONS[String(role || '').toLowerCase()]?.code || null
}

export function isStaff(role) {
  return STAFF_ROLES.includes(String(role || '').toLowerCase())
}

export function isExternal(role) {
  return EXTERNAL_ROLES.includes(String(role || '').toLowerCase())
}

export function isSystemAdmin(role) {
  return SYSTEM_ADMIN_ROLES.includes(String(role || '').toLowerCase())
}

/**
 * Operational corridors (Schema Document §2.2 / organizations.region_corridor).
 * GLOBAL is headquarters-level access across all corridors.
 */
export const CORRIDORS = [
  ['GLOBAL', 'Global (all corridors)'],
  ['SPAIN_EU', 'Spain / European Union'],
  ['INDIA', 'India'],
  ['UAE_DUBAI', 'UAE / Dubai'],
  ['LATAM', 'Latin America'],
  ['USA_CAN', 'United States & Canada'],
  ['MOROCCO', 'Morocco'],
]

/** Compliance Office: KYC/KYB screening and approval decisions. */
export const COMPLIANCE_ROLES = ['admin', 'hr']
/** Roles that may read the organisation registry. */
export const REGISTRY_READ_ROLES = ['admin', 'tech_admin', 'hr', 'manager']

/** ZYLAX commercial: who may read, sell, and manage the catalog, distributors and order fulfilment. */
export const COMMERCIAL_READ_ROLES = ['admin', 'manager', 'employee', 'finance']
export const COMMERCIAL_SELL_ROLES = ['admin', 'manager', 'employee']
export const COMMERCIAL_MANAGE_ROLES = ['admin', 'manager']
/** External companies that can receive quotes and place orders. */
export const COMMERCIAL_CUSTOMER_ROLES = ['client', 'partner']
