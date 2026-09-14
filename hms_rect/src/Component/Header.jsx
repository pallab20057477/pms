import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { logout, setActiveHotel, login, setUser } from '../Redux/authSlice'
import { getWithAuth, postWithAuth } from '../api'
import MiniLogo from '../assets/dist/img/mini-logo.png'
import Logo from '../assets/dist/img/logo.png'
import './HeaderModern.css'

export default function Header({ onToggleSidebar, sidebarCollapsed }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const token = useSelector(s => s.auth.accesstoken)
  const activeHotelId = useSelector(s => s.auth.activeHotelId)
  const role = useSelector(s => s.auth.role)
  const user = useSelector(s => s.auth.user)

  const [hotels, setHotels] = useState([])
  const [loadingHotels, setLoadingHotels] = useState(false)
  const [hotelMenuOpen, setHotelMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const hotelMenuRef = useRef(null)
  const userMenuRef = useRef(null)

  // Direct, smooth sidebar toggle handler
  const handleSidebarToggle = (e) => {
    e.preventDefault()
    if (onToggleSidebar) {
      onToggleSidebar()
    } else if (typeof document !== 'undefined') {
      document.body.classList.toggle('sidebar-collapse')
    }
  }

  // Close menus on outside click
  useEffect(() => {
    function handleOutsideClick(e) {
      if (hotelMenuRef.current && !hotelMenuRef.current.contains(e.target)) {
        setHotelMenuOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // Load current user profile from backend
  useEffect(() => {
    async function loadUser() {
      if (!token) return
      try {
        const res = await getWithAuth('/me', token)
        const userData = res.data && res.data.data ? res.data.data : res.data
        if (userData && (userData.id || userData.username || userData.email || userData.name)) {
          dispatch(setUser(userData))
        }
      } catch (e) {
        // Silently preserve cached user profile
      }
    }
    loadUser()
  }, [token, dispatch])

  // Load hotels list
  useEffect(() => {
    async function load() {
      if (!token) {
        setHotels([])
        return
      }
      setLoadingHotels(true)
      try {
        const res = await getWithAuth('/hotels', token)
        const data = res.data && res.data.data ? res.data.data : res.data
        const hotelList = Array.isArray(data) ? data : []
        setHotels(hotelList)
        const active = hotelList.find(h => h.id === Number(activeHotelId))
        if (active) dispatch(setActiveHotel(active))
      } catch (e) {
        console.error('Failed to load hotels in Header:', e)
        setHotels([])
      } finally {
        setLoadingHotels(false)
      }
    }
    load()
  }, [token, activeHotelId, dispatch])

  const handleLogout = (e) => {
    if (e) e.preventDefault()
    dispatch(logout())
    navigate('/')
  }

  const switchHotel = async (id) => {
    if (!token) return
    try {
      const r = await postWithAuth('/hotels/switch', { hotel_id: id }, token)
      const body = r.data
      if (body && body.token) {
        dispatch(login({ token: body.token, activeHotelId: id }))
        const sel = hotels.find(h => h.id === id)
        if (sel) dispatch(setActiveHotel(sel))
        setHotelMenuOpen(false)
        navigate('/dashboard')
      }
    } catch (err) {
      console.error('Failed to switch hotel:', err)
    }
  }

  const activeHotel = hotels.find(h => h.id === Number(activeHotelId))
  const isPremium = activeHotel?.subscription_tier === 'premium'

  // Calculate proper user display name
  const rawName = (user?.name && user.name.trim()) || (user?.username && user.username.trim()) || ''
  const emailName = user?.email ? user.email.split('@')[0] : ''
  const displayName = rawName || emailName || (role === 'super_admin' ? 'Super Admin' : 'Admin')

  // Subtitle / role / email
  const displaySubtitle = user?.email || (role === 'super_admin' ? 'Super Administrator' : (role === 'staff' ? 'Staff Member' : 'Property Administrator'))

  // Dynamic user initials (e.g. "John Doe" -> "JD", "Pallab" -> "PA", "admin" -> "AD")
  const getInitials = () => {
    if (user?.name && user.name.trim()) {
      const parts = user.name.trim().split(/\s+/).filter(Boolean)
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      }
      return parts[0].slice(0, 2).toUpperCase()
    }
    if (user?.username && user.username.trim()) {
      return user.username.trim().slice(0, 2).toUpperCase()
    }
    if (user?.email) {
      return user.email.split('@')[0].slice(0, 2).toUpperCase()
    }
    return role === 'super_admin' ? 'SA' : 'AD'
  }

  const userInitial = getInitials()

  return (
    <header className="main-header header-pro-root">
      {/* ── Brand Logo ── */}
      <Link to="/dashboard" className="logo header-pro-logo">
        <span className="logo-mini">
          <img src={MiniLogo} alt="HMS" />
        </span>
        <span className="logo-lg">
          <img src={Logo} alt="StaySync HMS" />
        </span>
      </Link>

      {/* ── Top Navigation Bar ── */}
      <nav className="navbar navbar-static-top header-pro-navbar">
        {/* Left Side: Sidebar Toggle & Property Badge */}
        <div className="header-pro-left">
          <a
            href="#"
            className="sidebar-toggle header-pro-toggle"
            data-toggle="offcanvas"
            role="button"
            onClick={handleSidebarToggle}
            title="Toggle Sidebar Navigation"
          >
            <span className="sr-only">Toggle navigation</span>
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </a>

          {/* Active Property Pill / Selector */}
          <div className="header-property-select-wrap" ref={hotelMenuRef}>
            <button
              type="button"
              className={`header-property-btn ${!activeHotel ? 'is-warning' : ''}`}
              onClick={() => setHotelMenuOpen(v => !v)}
              aria-expanded={hotelMenuOpen}
              aria-label="Switch active property"
            >
              <div className="header-property-icon-box">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
              </div>

              <div className="header-property-details">
                <div className="header-property-name">
                  {activeHotel ? activeHotel.name : (loadingHotels ? 'Loading property…' : 'Select Property')}
                </div>
                <div className="header-property-meta">
                  {activeHotel ? (activeHotel.city ? `${activeHotel.city}` : 'Live Console') : 'Click to choose'}
                </div>
              </div>

              <svg className={`header-property-arrow ${hotelMenuOpen ? 'open' : ''}`} viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Property Switcher Dropdown */}
            {hotelMenuOpen && (
              <div className="header-dropdown-menu header-property-dropdown" role="menu">
                <div className="header-dropdown-header">
                  <span className="header-dropdown-title">Properties & Branches</span>
                  <span className="header-dropdown-badge">{hotels.length} Available</span>
                </div>

                <div className="header-property-list">
                  {loadingHotels ? (
                    <div className="header-property-empty">Loading properties…</div>
                  ) : hotels.length === 0 ? (
                    <div className="header-property-empty">
                      <p>No properties found in your account.</p>
                      <button
                        type="button"
                        className="header-dropdown-primary-btn"
                        onClick={() => {
                          setHotelMenuOpen(false)
                          navigate('/hotels/new')
                        }}
                      >
                        + Register First Hotel
                      </button>
                    </div>
                  ) : (
                    hotels.map(h => {
                      const isActive = Number(activeHotelId) === h.id
                      return (
                        <button
                          key={h.id}
                          type="button"
                          className={`header-property-item ${isActive ? 'is-active' : ''}`}
                          onClick={() => switchHotel(h.id)}
                        >
                          <div className="header-property-item-left">
                            <span className="header-property-item-dot" />
                            <div>
                              <div className="header-property-item-name">{h.name}</div>
                              <div className="header-property-item-sub">
                                {h.city ? `${h.city}, ${h.state || 'India'}` : (h.property_type || 'Hotel')}
                              </div>
                            </div>
                          </div>

                          <div className="header-property-item-right">
                            {h.subscription_tier === 'premium' && (
                              <span className="header-plan-pill-mini">Premium</span>
                            )}
                            {isActive && (
                              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="header-check-icon">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>

                <div className="header-dropdown-footer">
                  <button
                    type="button"
                    className="header-add-property-link"
                    onClick={() => {
                      setHotelMenuOpen(false)
                      navigate('/hotels/new')
                    }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    <span>Add New Property</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Quick Action + System Status + User Menu */}
        <div className="header-pro-right">
          {/* Quick Action: New Booking */}
          <button
            type="button"
            className="header-quick-action-btn"
            onClick={() => navigate('/booking/create')}
            title="Create a new guest booking"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>New Booking</span>
          </button>

          {/* Tier Badge */}
          {isPremium && (
            <div className="header-tier-indicator" title="Active Subscription: Premium Tier">
              <span className="header-tier-star">★</span>
              <span>Premium</span>
            </div>
          )}

          {/* User Profile & Account Dropdown */}
          <div className="header-user-menu-wrap" ref={userMenuRef}>
            <button
              type="button"
              className="header-user-btn"
              onClick={() => setUserMenuOpen(v => !v)}
              aria-expanded={userMenuOpen}
              aria-label="User profile options"
            >
              <div className="header-user-avatar">
                {userInitial}
              </div>
              <div className="header-user-meta">
                <span className="header-user-title">{displayName}</span>
                <span className="header-user-status">Online</span>
              </div>
              <svg className={`header-user-arrow ${userMenuOpen ? 'open' : ''}`} viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Profile Dropdown */}
            {userMenuOpen && (
              <div className="header-dropdown-menu header-user-dropdown" role="menu">
                <div className="header-user-dropdown-head">
                  <div className="header-user-dropdown-avatar">{userInitial}</div>
                  <div className="header-user-dropdown-info">
                    <div className="header-user-dropdown-name">{displayName}</div>
                    <div className="header-user-dropdown-email">{displaySubtitle}</div>
                  </div>
                </div>

                <div className="header-user-dropdown-links">
                  <button
                    type="button"
                    className="header-user-dropdown-link"
                    onClick={() => {
                      setUserMenuOpen(false)
                      navigate('/settings')
                    }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                    <span>Account Settings</span>
                  </button>

                  <button
                    type="button"
                    className="header-user-dropdown-link"
                    onClick={() => {
                      setUserMenuOpen(false)
                      navigate('/activity/logs')
                    }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                    </svg>
                    <span>Audit Logs</span>
                  </button>
                </div>

                <div className="header-dropdown-footer">
                  <button
                    type="button"
                    className="header-user-logout-btn"
                    onClick={handleLogout}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                      <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}
