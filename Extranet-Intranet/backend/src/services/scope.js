import { isExternal } from '../config/roles.js'

/**
 * Appends a region predicate to a query for non-global users.
 * Base SQL should end with a WHERE clause (use `WHERE 1=1` when needed).
 */
export function withRegion(req, baseSql, params = [], alias = '') {
  const region = req.user?.region
  if (!region || region === 'GLOBAL') return { sql: baseSql, params }

  const column = alias ? `${alias}.region` : 'region'
  return {
    sql: `${baseSql} AND (${column} = 'GLOBAL' OR ${column} = $${params.length + 1})`,
    params: [...params, region],
  }
}

/**
 * Organisations whose private data a user may reach (Schema Document §2.1).
 * null = unrestricted: the Super Admin and staff of the parent entity.
 * Business-unit and external users reach their own organisation and its parent.
 */
export function organisationScope(user) {
  if (user.role === 'admin') return null
  if (user.org_type === 'PARENT' && !isExternal(user.role)) return null
  return [user.org_id, user.parent_org_id].filter(Boolean)
}

/** SQL: the row's organisation column is group-wide (NULL) or inside the array parameter. */
export function orgPredicate(column, parameter) {
  return `(${parameter}::uuid[] IS NULL OR ${column} IS NULL OR ${column} = ANY(${parameter}::uuid[]))`
}
