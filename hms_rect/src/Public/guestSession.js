const TOKEN_KEY = 'public_guest_token'
const USER_KEY = 'public_guest_user'

function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

export function isGuestTokenValid(token) {
  if (!token) return false
  const payload = decodeJwtPayload(token)
  return Boolean(payload?.exp && payload.exp * 1000 > Date.now() && payload.role === 'guest')
}

export function getGuestSession() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!isGuestTokenValid(token)) {
    clearGuestSession()
    return { token: null, user: null }
  }
  try {
    return {
      token,
      user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
    }
  } catch {
    return { token, user: null }
  }
}

export function setGuestSession(payload) {
  const token = payload?.token
  const user = payload?.user || null
  if (!isGuestTokenValid(token)) return false
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event('public-guest-session'))
  return true
}

export function clearGuestSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.dispatchEvent(new Event('public-guest-session'))
}

export function guestAuthHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

let cachedGoogleClientId = null
export async function getGoogleClientId() {
  if (cachedGoogleClientId !== null) return cachedGoogleClientId
  try {
    const res = await fetch('/api/public/config')
    if (res.ok) {
      const data = await res.json()
      cachedGoogleClientId = data.google_client_id || ''
      return cachedGoogleClientId
    }
  } catch (err) {
    console.error('Failed to fetch public config', err)
  }
  // Fallback to env if API fails
  cachedGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.VITE_PUBLIC_GOOGLE_CLIENT_ID || ''
  return cachedGoogleClientId
}
