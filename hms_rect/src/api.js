import axios from "axios";
import { domain } from "./Functions/domain";
import { store } from "./Redux/store.jsx";
import { logout } from "./Redux/authSlice.jsx";

// Build a stable API v1 base once and normalize all caller URLs against it.
const buildApiBase = () => {
  let base = import.meta.env.VITE_API_BASE_URL_API || domain
  base = base.replace(/\/$/, '')
  if (/\/api\/v1$/.test(base)) return `${base}/`
  if (/\/api$/.test(base)) return `${base}/v1/`
  return `${base}/api/v1/`
}

const normalizeApiUrl = (url) => {
  if (typeof url !== 'string') return url
  let next = url

  if (next.startsWith('/api/v1/')) next = next.slice('/api/v1/'.length)
  else if (next.startsWith('/api/')) next = next.slice('/api/'.length)
  else if (next.startsWith('api/v1/')) next = next.slice('api/v1/'.length)
  else if (next.startsWith('api/')) next = next.slice('api/'.length)

  if (next.startsWith('/')) next = next.replace(/^\/+/, '')
  return next
}

const attachCommonInterceptors = (client) => {
  client.interceptors.request.use((config) => {
    config.url = normalizeApiUrl(config.url)
    return config
  })

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.response?.status === 401) {
        // Prevent redirecting if it's a login request, so the component can show the error
        const url = error?.config?.url || '';
        if (!url.includes('login') && !url.includes('public/')) {
          store.dispatch(logout())
          window.location.href = "/"
        }
      }
      return Promise.reject(error)
    }
  )
}

export const createApiClient = (token) => {
  const client = axios.create({ baseURL: buildApiBase() })
  if (token) {
    client.defaults.headers.common.Authorization = `Bearer ${token}`
  }
  attachCommonInterceptors(client)
  return client
}

const api = createApiClient()

// Note: Logout on 401 is centralized here for consistent session behavior.

export const getWithAuth = (url, token, config = {}) =>
  api.get(url, { ...config, headers: { Authorization: `Bearer ${token}`, ...(config.headers || {}) } });

export const postWithAuth = (url, data, token, config = {}) =>
  api.post(url, data, { ...config, headers: { Authorization: `Bearer ${token}`, ...(config.headers || {}) } });

export const putWithAuth = (url, data, token, config = {}) =>
  api.put(url, data, { ...config, headers: { Authorization: `Bearer ${token}`, ...(config.headers || {}) } });

export const patchWithAuth = (url, data, token, config = {}) =>
  api.patch(url, data, { ...config, headers: { Authorization: `Bearer ${token}`, ...(config.headers || {}) } });

export const deleteWithAuth = (url, token, config = {}) =>
  api.delete(url, { ...config, headers: { Authorization: `Bearer ${token}`, ...(config.headers || {}) } });

export default api;
