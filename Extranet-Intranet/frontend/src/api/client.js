import axios from 'axios'
import { getToken, clearSession } from './auth'
import { translate } from '../i18n'
import { requireConsent } from '../components/Portals/Shared/privacy/consentEvents'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

// One place that attaches the JWT to every outgoing request.
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Server errors carry a reference that support can find in the logs (X-Request-Id).
    const data = error.response?.data
    if (error.response?.status === 500 && data && typeof data === 'object' && data.request_id) {
      data.message = `${translate('Something went wrong on the server.')} ${translate('Reference: {ref}', { ref: data.request_id })}`
    }
    if (error.response?.status === 403 && data?.code === 'CONSENT_REQUIRED') requireConsent()
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      clearSession()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

export default api
