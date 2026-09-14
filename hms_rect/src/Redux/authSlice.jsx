import { createSlice } from "@reduxjs/toolkit";

function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

function isTokenValid(token) {
  if (!token) return false
  const payload = decodeJwtPayload(token)
  if (!payload || !payload.exp) return false
  return payload.exp * 1000 > Date.now()
}

function isSuperAdminToken(token) {
  if (!token) return false
  const payload = decodeJwtPayload(token)
  return payload && payload.admin_id === 0
}

// Extract features directly from JWT payload - single source of truth
function featuresFromToken(token) {
  if (!token) return null
  const payload = decodeJwtPayload(token)
  if (!payload || !payload.features) return null
  return {
    online_payment:   payload.features.online_payment   ?? false,
    reports:          payload.features.reports          ?? true,
    staff_payroll:    payload.features.staff_payroll    ?? false,
    housekeeping:     payload.features.housekeeping     ?? true,
    email_notify:     payload.features.email_notify     ?? false,
    seasonal_pricing: payload.features.seasonal_pricing ?? false,
    channel_manager:  payload.features.channel_manager  ?? true,
  }
}

function tierFromToken(token) {
  if (!token) return 'free'
  const payload = decodeJwtPayload(token)
  return payload?.subscription_tier || 'free'
}

const storedToken = localStorage.getItem("access_token")
const storedHotelId = localStorage.getItem("active_hotel_id")
const storedRole = localStorage.getItem("role")
const storedUser = localStorage.getItem("user")
let parsedUser = null
try {
  parsedUser = storedUser ? JSON.parse(storedUser) : null
} catch {
  parsedUser = null
}

if (storedToken && !isTokenValid(storedToken)) {
  localStorage.removeItem("access_token")
  localStorage.removeItem("active_hotel_id")
  localStorage.removeItem("role")
  localStorage.removeItem("user")
}

const validToken = isTokenValid(storedToken) ? storedToken : null

const authSlice = createSlice({
    name: "auth",
    initialState: {
        accesstoken: validToken,
        isLogin: Boolean(validToken),
        activeHotelId: validToken && storedHotelId ? Number(storedHotelId) : null,
        role: validToken ? (storedRole || (isSuperAdminToken(validToken) ? 'super_admin' : 'admin')) : null,
        user: validToken ? parsedUser : null,
        // Features come directly from JWT - no separate storage needed
        hotelFeatures: featuresFromToken(validToken),
        subscriptionTier: tierFromToken(validToken),
    },
    reducers: {
        login: (state, action) => {
            const payload = action.payload
            if (typeof payload === 'string') {
                state.accesstoken = payload
                state.role = isSuperAdminToken(payload) ? 'super_admin' : 'admin'
            } else if (payload && typeof payload === 'object') {
                state.accesstoken = payload.token || null
                state.role = payload.role || (isSuperAdminToken(payload.token) ? 'super_admin' : 'admin')
                if (payload.activeHotelId) {
                    state.activeHotelId = payload.activeHotelId
                    localStorage.setItem('active_hotel_id', String(payload.activeHotelId))
                }
                if (payload.user) {
                    state.user = payload.user
                    localStorage.setItem('user', JSON.stringify(payload.user))
                }
            }
            state.isLogin = isTokenValid(state.accesstoken)
            if (state.isLogin) {
                localStorage.setItem("access_token", state.accesstoken)
                localStorage.setItem("role", state.role)
                state.hotelFeatures = featuresFromToken(state.accesstoken)
                state.subscriptionTier = tierFromToken(state.accesstoken)
            } else {
                state.accesstoken = null
                state.role = null
                state.user = null
                state.hotelFeatures = null
                state.subscriptionTier = null
                localStorage.removeItem("access_token")
                localStorage.removeItem("role")
                localStorage.removeItem("user")
            }
        },
        setUser: (state, action) => {
            state.user = action.payload
            if (action.payload) {
                localStorage.setItem('user', JSON.stringify(action.payload))
            } else {
                localStorage.removeItem('user')
            }
        },
        logout: (state) => {
            state.accesstoken = null
            state.isLogin = false
            state.activeHotelId = null
            state.role = null
            state.user = null
            state.hotelFeatures = null
            state.subscriptionTier = null
            localStorage.removeItem("access_token")
            localStorage.removeItem("token")
            localStorage.removeItem('active_hotel_id')
            localStorage.removeItem('login_time')
            localStorage.removeItem('role')
            localStorage.removeItem('user')
        },
        setActiveHotel: (state, action) => {
            if (action.payload && action.payload.id) {
                state.activeHotelId = action.payload.id
                localStorage.setItem('active_hotel_id', String(action.payload.id))
                
                // Always sync tier and features with the freshest database state when hotel is loaded
                if (action.payload.subscription_tier) {
                    state.subscriptionTier = action.payload.subscription_tier
                }
                state.hotelFeatures = {
                    online_payment:   action.payload.feature_online_payment ?? false,
                    reports:          action.payload.feature_reports ?? true,
                    staff_payroll:    action.payload.feature_staff_payroll ?? false,
                    housekeeping:     action.payload.feature_housekeeping ?? true,
                    email_notify:     action.payload.feature_email_notify ?? false,
                    seasonal_pricing: action.payload.feature_seasonal_pricing ?? false,
                    channel_manager:  action.payload.feature_channel_manager ?? true,
                }
            }
        }
    }
})

export const { login, logout, setActiveHotel, setUser } = authSlice.actions
export default authSlice.reducer
