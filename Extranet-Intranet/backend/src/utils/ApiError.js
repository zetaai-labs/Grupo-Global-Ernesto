export async function listApiError() {
  return []
}

export async function getApiErrorById(id) {
  return { id, status: 'template' }
}

export default { list: listApiError, getById: getApiErrorById }
