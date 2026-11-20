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
