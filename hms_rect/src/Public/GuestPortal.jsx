import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'
import { clearGuestSession, getGuestSession, guestAuthHeader, setGuestSession } from './guestSession'
import './GuestPortal.css'

const statusLabel = {
  reserved: 'Confirmed',
  checked_in: 'In House',
  checkedout: 'Completed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function GuestPortal() {
  const navigate = useNavigate()
  const [{ token, user }, setSessionState] = useState(getGuestSession)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
  })

  useEffect(() => {
    if (!token) {
      // /guest/login is disabled — redirect to booking portal which has the login modal
      navigate('/book', { replace: true })
      return
    }

    let alive = true
    async function load() {
      setLoading(true)
      try {
        const headers = guestAuthHeader(token)
        const [meRes, bookingsRes] = await Promise.all([
          api.get('/api/public/auth/me', { headers }),
          api.get('/api/public/auth/my-bookings', { headers }),
        ])
        if (!alive) return
        const nextUser = meRes.data
        setGuestSession({ token, user: nextUser })
        setSessionState({ token, user: nextUser })
        setProfile({ name: nextUser?.name || '', phone: nextUser?.phone || '' })
        setBookings(Array.isArray(bookingsRes.data?.bookings) ? bookingsRes.data.bookings : [])
      } catch {
        clearGuestSession()
        // /guest/login is disabled — redirect to booking portal
        navigate('/book', { replace: true })
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [token, navigate])

  const saveProfile = async (e) => {
    e.preventDefault()
    if (!token) return
    setSaving(true)
    setMessage('')
    try {
      const res = await api.put('/api/public/auth/profile', profile, {
        headers: guestAuthHeader(token),
      })
      setGuestSession({ token, user: res.data })
      setSessionState({ token, user: res.data })
      setMessage('Profile updated successfully.')
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Unable to update profile.')
    } finally {
      setSaving(false)
    }
  }

  const logout = () => {
    clearGuestSession()
    navigate('/book', { replace: true })
  }

  if (loading) {
    return (
      <div className="guest-page">
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#666', fontSize: '14px' }}>Loading your trips...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="guest-page">
      {/* HEADER */}
      <header className="guest-topbar">
        <Link to="/book" className="guest-brand">
          StaySync
        </Link>
        <nav className="guest-nav">
          <Link to="/book">Search Hotels</Link>
          <span style={{ color: '#ccc' }}>|</span>
          <button type="button" onClick={logout}>Log Out</button>
        </nav>
      </header>

      {/* DASHBOARD LAYOUT */}
      <main className="guest-dashboard">

        {/* OVERVIEW HEADER */}
        <section className="guest-overview-panel">
          <div className="guest-overview-info">
            <h1>Hi, {user?.name?.split(' ')[0] || 'Guest'}</h1>
            <p>Manage your hotel reservations and account details securely.</p>
          </div>
          <div className="guest-security-badge">
            ✓ Verified Account
          </div>
        </section>

        {/* TWO COLUMNS: TRIPS & PROFILE */}
        <section className="guest-layout">

          {/* TRIPS COLUMN */}
          <div className="guest-card">
            <div className="guest-card-header">
              <h2>My Trips</h2>
              <span>{bookings.length} Bookings</span>
            </div>

            {bookings.length === 0 ? (
              <div className="guest-empty">
                <h3>No Trips Found</h3>
                <p>Looks like you haven't made any bookings yet.</p>
                <Link to="/book" className="gb-btn-primary" style={{ display: 'inline-block' }}>Start Booking</Link>
              </div>
            ) : (
              <div className="guest-booking-list">
                {bookings.map((booking) => {
                  const rawStatus = String(booking.status || '').toLowerCase()
                  let statusClass = 'upcoming'
                  if (rawStatus === 'completed' || rawStatus === 'checkedout') statusClass = 'completed'
                  if (rawStatus === 'cancelled') statusClass = 'cancelled'

                  return (
                    <article className="guest-booking-row" key={booking.id || booking.booking_code}>
                      <div className="gb-hotel-info">
                        <span className="gb-code">Booking ID: {booking.booking_code}</span>
                        <h3 className="gb-name">{booking.hotel_name}</h3>
                        <span className="gb-room">{booking.room_type || 'Standard Room'}</span>
                      </div>

                      <div className="gb-dates">
                        <span><strong>Check In:</strong> {formatDate(booking.check_in_date)}</span>
                        <span><strong>Check Out:</strong> {formatDate(booking.check_out_date)}</span>
                      </div>

                      <div className="gb-meta">
                        <span className="gb-price">{money(booking.total_amount)}</span>
                        <span className={`gb-status ${statusClass}`}>
                          {statusLabel[rawStatus] || booking.status || 'Confirmed'}
                        </span>
                      </div>

                      <div className="gb-actions">
                        <Link to={`/guest/bookings/${booking.booking_code}`} className="gb-btn-primary">
                          Manage Trip
                        </Link>
                        <Link to={`/book/${booking.hotel_id}`} className="gb-btn-secondary">
                          Book Again
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {/* PROFILE COLUMN */}
          <aside className="guest-card">
            <div className="guest-card-header">
              <h2>Profile Details</h2>
            </div>
            <form className="guest-profile-form" onSubmit={saveProfile}>
              <div className="guest-form-group">
                <label>Full Name</label>
                <input required value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
              </div>

              <div className="guest-form-group">
                <label>Email Address</label>
                <input value={user?.email || ''} disabled />
              </div>

              <div className="guest-form-group">
                <label>Mobile Number</label>
                <input required value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" />
              </div>

              <button type="submit" className="guest-btn-submit" disabled={saving}>
                {saving ? 'Saving...' : 'Update Profile'}
              </button>

              {message && <div className="guest-form-message">{message}</div>}
            </form>
          </aside>

        </section>
      </main>
    </div>
  )
}
