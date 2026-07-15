import { getAuthHeaders, getStoredToken, clearStoredUser } from './auth'

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : 'http://localhost:3001'

/**
 * Unified API client with:
 * - Automatic auth headers
 * - JSON parsing
 * - Error normalization
 * - 401/403 auto-logout
 * - Request timeout
 */
export async function apiClient(endpoint, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    timeout = 30000,
    requireAuth = true,
    ...rest
  } = options

  // Build headers
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  }

  if (requireAuth) {
    const authHeaders = getAuthHeaders()
    Object.assign(requestHeaders, authHeaders)
  }

  // Build request
  const config = {
    method,
    headers: requestHeaders,
    ...rest,
  }

  if (body && typeof body === 'object') {
    config.body = JSON.stringify(body)
  } else if (body) {
    config.body = body
  }

  // Timeout controller
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  config.signal = controller.signal

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config)
    clearTimeout(timeoutId)

    // Handle 401/403
    if (response.status === 401 || response.status === 403) {
      const isAuthEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/register')
      if (!isAuthEndpoint) {
        let shouldLogout = response.status === 401
        if (response.status === 403) {
          try {
            const clone = response.clone()
            const data = await clone.json()
            const errMsg = (data?.error || '').toLowerCase()
            if (errMsg.includes('token') || errMsg.includes('expired') || errMsg.includes('auth')) {
              shouldLogout = true
            }
          } catch {}
        }
        if (shouldLogout) {
          clearStoredUser()
          window.location.href = '/login'
          throw new Error('Session expired. Please log in again.')
        }
      }
    }

    // Parse response
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Request failed`)
    }

    return data
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw err
  }
}

// Convenience methods
export const api = {
  get: (endpoint, opts) => apiClient(endpoint, { method: 'GET', ...opts }),
  post: (endpoint, body, opts) => apiClient(endpoint, { method: 'POST', body, ...opts }),
  put: (endpoint, body, opts) => apiClient(endpoint, { method: 'PUT', body, ...opts }),
  patch: (endpoint, body, opts) => apiClient(endpoint, { method: 'PATCH', body, ...opts }),
  delete: (endpoint, opts) => apiClient(endpoint, { method: 'DELETE', ...opts }),
}

export { API_BASE }
export default api
