const USER_STORAGE_KEY = 'user'

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY)
    return null
  }
}

export function getStoredToken() {
  const user = getStoredUser()
  return user?.token || user?.accessToken || null
}

export function setStoredUser(userData) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData))
}

export function clearStoredUser() {
  localStorage.removeItem(USER_STORAGE_KEY)
}

export function getAuthHeaders(userProp) {
  const token = userProp?.token || userProp?.accessToken || getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
