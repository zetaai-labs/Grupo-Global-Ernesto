export function paginate(items = [], page = 1, pageSize = 10) {
  const start = Math.max(0, page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length }
}
