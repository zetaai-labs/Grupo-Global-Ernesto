import api from '../api/client'

/** Downloads an authenticated API response as a file. */
export async function downloadFromApi(url, fileName) {
  const response = await api.get(url, { responseType: 'blob' })
  const href = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(href)
}
