import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import API from '../api'
import { resolveAssetUrl } from '../Functions/assetUrl'
import { clearGuestSession, getGuestSession, guestAuthHeader } from '../Public/guestSession'
import './BookingPortal.css'

const TODAY = new Date().toISOString().slice(0, 10)
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'UAE', 'Canada', 'Australia', 'Singapore', 'Germany', 'France', 'Saudi Arabia', 'Nepal', 'Bangladesh', 'Other']

// ── SIDE PANEL ────────────────────────────────────────────────────────────────
function FestivePanel({ side, theme }) {
  const isLeft = side === 'left'
  const img = isLeft ? theme.left_panel_image_url : theme.right_panel_image_url
  const title = isLeft ? theme.left_panel_title : theme.right_panel_title
  const sub = isLeft ? theme.left_panel_subtext : theme.right_panel_subtext
  const btn = isLeft ? theme.left_panel_btn_text : theme.right_panel_btn_text
  const url = isLeft ? theme.left_panel_btn_url : theme.right_panel_btn_url
  const bgFrom = isLeft ? (theme.left_panel_bg_from || theme.bg_gradient_from || '#001f5c') : (theme.right_panel_bg_from || theme.bg_gradient_from || '#001f5c')
  const bgTo = isLeft ? (theme.left_panel_bg_to || theme.bg_gradient_to || '#003580') : (theme.right_panel_bg_to || theme.bg_gradient_to || '#003580')
  const txtClr = isLeft ? (theme.left_panel_text_color || '#fff') : (theme.right_panel_text_color || '#fff')

  // nothing to show if no content configured
  if (!img && !title && !sub) return null

  return (
    <aside className={`bp-festival-panel bp-festival-${side}`}
      style={{ background: `linear-gradient(175deg, ${bgFrom} 0%, ${bgTo} 100%)` }}>
      {img && (
        <div className="bp-festival-art">
          <img src={resolveAssetUrl(img)} alt={title || 'Festival'} />
        </div>
      )}
      <div className="bp-festival-text" style={{ color: txtClr }}>
        {title && <div className="bp-festival-title">{title}</div>}
        {sub && <div className="bp-festival-sub">{sub}</div>}
        {btn && (
          <a
            href={url || '#'}
            target={url && url !== '#' ? '_blank' : undefined}
            rel="noreferrer"
            className="bp-festival-cta"
            style={{ background: theme.accent_color || '#FF6B00', color: '#fff' }}
          >
            {btn}
          </a>
        )}
      </div>
    </aside>
  )
}

export default function BookingPortal() {
  const navigate = useNavigate()
  const location = useLocation()
  const { hotelCode } = useParams()

  const [hotels, setHotels] = useState([])
  const [hotel, setHotel] = useState(null)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [pageError, setPageError] = useState('')
  const [theme, setTheme] = useState(null)
  const [ribbonOff, setRibbonOff] = useState(false)
  const [showTrust, setShowTrust] = useState(false)
  const [guestSession, setGuestSession] = useState(() => getGuestSession())
  const [matchedGuest, setMatchedGuest] = useState(false)

  const [form, setForm] = useState({
    check_in: TODAY, check_out: TOMORROW, room_id: '',
    first_name: '', last_name: '', guest_email: '', guest_phone: '',
    total_guests: '1', country: 'India', purpose: 'Leisure',
    arrival_time: "I don't know", special_requests: '', companions: [],
    pay_mode: 'hotel',
  })

  const nights = useMemo(() => { const d = Math.ceil((new Date(form.check_out) - new Date(form.check_in)) / 86400000); return d > 0 ? d : 1 }, [form.check_in, form.check_out])
  const F = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const applyGuestProfile = useCallback((profile) => {
    if (!profile) return
    const nameParts = String(profile.name || '').trim().split(/\s+/)
    setForm(prev => ({
      ...prev,
      first_name: nameParts[0] || prev.first_name,
      last_name: nameParts.slice(1).join(' ') || prev.last_name,
      guest_email: profile.email || prev.guest_email,
      guest_phone: profile.phone || prev.guest_phone,
    }))
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try { const r = await API.get('/api/public/hotels'); setHotels(r.data.hotels || []) } catch { setHotels([]) }
    finally { setLoading(false) }
  }, [])

  const checkAvail = useCallback(async (h = hotel) => {
    if (!h?.id) return
    setChecking(true); setResult(null)
    try {
      const r = await API.get('/api/public/availability', { params: { hotel_id: h.public_token || h.id, check_in: form.check_in, check_out: form.check_out, guests: form.total_guests } })
      const items = Array.isArray(r?.data?.available_rooms) ? r.data.available_rooms : []
      setRooms(items)
      if (!items.some(x => String(x.id) === String(form.room_id))) setForm(p => ({ ...p, room_id: '' }))
    } catch { setRooms([]) }
    finally { setChecking(false) }
  }, [hotel, form.check_in, form.check_out, form.total_guests, form.room_id])

  const loadHotel = useCallback(async code => {
    setLoading(true)
    const p = String(code || '').trim()
    if (!p) { setHotel(null); await loadAll(); return }
    try {
      const r = await API.get(`/api/public/hotels/${p}`)
      const h = r?.data?.hotel || null
      setHotel(h); setHotels(h ? [h] : [])
      setForm(prev => ({
        ...prev,
        room_id: '',
        pay_mode: Number(h?.advance_payment_percent || 0) > 0 ? 'online' : 'hotel',
      }))
      setPageError('')
      if (h) {
        checkAvail(h)
        try { const tr = await API.get(`/api/public/hotels/${h.id}/theme`); setTheme(tr?.data?.theme || null) } catch { setTheme(null) }
      }
    } catch (err) {
      if ([403, 404].includes(err?.response?.status)) { setPageError(err?.response?.data?.error || 'Unavailable.'); setHotel(null); setHotels([]) }
      else { setHotel(null); await loadAll() }
    } finally { setLoading(false) }
  }, [loadAll])

  useEffect(() => { hotelCode ? loadHotel(hotelCode) : loadAll() }, [hotelCode])

  useEffect(() => {
    const refreshSession = () => setGuestSession(getGuestSession())
    window.addEventListener('public-guest-session', refreshSession)
    window.addEventListener('storage', refreshSession)
    return () => {
      window.removeEventListener('public-guest-session', refreshSession)
      window.removeEventListener('storage', refreshSession)
    }
  }, [])

  useEffect(() => {
    if (!guestSession.token) return
    applyGuestProfile(guestSession.user)
  }, [guestSession.token, guestSession.user, applyGuestProfile])

  useEffect(() => {
    if (!hotel?.id || !guestSession.token) { setMatchedGuest(false); return }
    let active = true
    API.get('/api/public/auth/hotel-guest-profile', {
      params: { hotel_id: hotel.id }, headers: guestAuthHeader(guestSession.token),
    }).then((r) => {
      if (!active) return
      const profile = r?.data?.guest
      setMatchedGuest(Boolean(r?.data?.matched_guest))
      applyGuestProfile(profile)
    }).catch(() => { if (active) setMatchedGuest(false) })
    return () => { active = false }
  }, [hotel?.id, guestSession.token, applyGuestProfile])

  const roomTypes = useMemo(() => {
    const m = new Map()
    rooms.forEach(r => {
      const t = typeof r.room_type === 'object' ? (r.room_type?.name || 'Standard') : (r.room_type || 'Standard')
      if (!m.has(t)) m.set(t, { type: t, price: r.base_price, count: 1, rooms: [r], image: r.primary_image || r.image || 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=800' })
      else { const e = m.get(t); e.count++; e.rooms.push(r) }
    })
    return Array.from(m.values())
  }, [rooms])

  const selRoom = rooms.find(r => String(r.id) === String(form.room_id))
  const selType = selRoom ? (typeof selRoom.room_type === 'object' ? selRoom.room_type?.name : selRoom.room_type) || 'Standard' : null
  const pickRoom = rt => { if (rt.rooms.length) setForm(p => ({ ...p, room_id: String(rt.rooms[0].id) })) }

  const setGuests = e => {
    const v = parseInt(e.target.value) || 1
    setForm(prev => {
      let c = [...prev.companions]
      if (v > 1) { c.length = v - 1; for (let i = 0; i < c.length; i++) { if (!c[i]) c[i] = '' } } else c = []
      return { ...prev, total_guests: String(v), companions: c }
    })
  }
  const setComp = (i, v) => setForm(p => { const c = [...p.companions]; c[i] = v; return { ...p, companions: c } })

  const submit = async e => {
    e.preventDefault()
    if (!guestSession.token) {
      navigate(`/guest/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    if (!hotel?.id || !form.room_id) { setResult({ ok: false, msg: 'Please select a room first.' }); return }
    setSubmitting(true); setResult(null)
    try {
      const extra = []
      if (form.arrival_time && form.arrival_time !== "I don't know") extra.push(`Arrival: ${form.arrival_time}`)
      if (form.country) extra.push(`Country: ${form.country}`)
      if (form.purpose) extra.push(`Purpose: ${form.purpose}`)
      if (form.special_requests) extra.push(form.special_requests)

      const res = await API.post('/api/public/bookings', {
        hotel_id: Number(hotel.id), room_id: Number(form.room_id),
        check_in: form.check_in, check_out: form.check_out,
        guest_name: `${form.first_name} ${form.last_name}`.trim(),
        guest_phone: form.guest_phone.trim(), guest_email: form.guest_email.trim(),
        total_guests: Math.max(1, Number(form.total_guests)),
        special_requests: extra.join(' | '),
        companion_details: JSON.stringify(form.companions.filter(c => c.trim())),
        idempotency_key: `${hotel.id}-${form.room_id}-${form.check_in}-${form.check_out}-${Date.now()}`,
      }, { headers: guestAuthHeader(guestSession.token) })

      const bookingId = res?.data?.id
      const bookingCode = res?.data?.booking_code || '-'

      const advPercent = Number(hotel?.advance_payment_percent || 0)
      const isOnlineRequired = advPercent > 0 || (form.pay_mode === 'online' && hotel?.feature_online_payment)

      if (isOnlineRequired) {
        // Online Gateway Payment Trigger
        const gateway = hotel?.payment_gateway || 'razorpay'
        const roomObj = rooms.find(r => String(r.id) === String(form.room_id))
        const roomPrice = roomObj?.base_price || 1000
        const subtotal = roomPrice * nights
        const taxVal = subtotal * (hotel.tax_percent || 0) / 100
        const grandTotal = subtotal + taxVal

        const payableAmount = advPercent > 0 ? Math.round((grandTotal * advPercent) / 100) : grandTotal

        if (gateway === 'phonepe') {
          try {
            const ppRes = await API.post('/api/public/payments/phonepe/initiate', {
              booking_id: bookingId,
              amount: payableAmount,
              hotel_id: Number(hotel.id),
              redirect_url: `${window.location.origin}/guest/bookings/${bookingCode}`,
            }, { headers: guestAuthHeader(guestSession.token) })
            const redirectUrl = ppRes?.data?.instrument_response?.redirect_info?.url || ppRes?.data?.redirect_url
            if (redirectUrl) {
              window.open(redirectUrl, '_blank')
            }
          } catch { /* proceed with booking confirmation code display */ }
        } else if (gateway === 'razorpay') {
          try {
            await API.post('/api/public/payments/razorpay/create-order', {
              booking_id: bookingId,
              amount: payableAmount,
              hotel_id: Number(hotel.id),
            }, { headers: guestAuthHeader(guestSession.token) })
          } catch { /* proceed with booking confirmation */ }
        }
      }

      setResult({ ok: true, code: bookingCode, msg: `Booking Confirmed! Code: ${bookingCode}` })
      setForm(p => ({ ...p, special_requests: '', room_id: '', companions: Array(p.companions.length).fill('') }))
      checkAvail()
    } catch (err) { setResult({ ok: false, msg: err?.response?.data?.error || 'Booking failed. Please try again.' }) }
    finally { setSubmitting(false) }
  }

  // Determine if festival panels should show
  const hasFestivePanels = theme && (
    theme.left_panel_image_url || theme.left_panel_title ||
    theme.right_panel_image_url || theme.right_panel_title
  )

  // Safe theme vars - never pass empty/null values to CSS variables
  const themeVars = theme ? {
    ...(theme.primary_color ? { '--p': theme.primary_color } : {}),
    ...(theme.bg_gradient_to ? { '--p3': theme.bg_gradient_to } : {}),
    ...(theme.accent_color ? { '--accent': theme.accent_color } : {}),
    ...(theme.accent_color ? { '--accent2': theme.accent_color } : {}),
  } : {}

  // ── LOADING ──
  if (hotelCode && loading) return (
    <div className="bp-page" style={themeVars}>
      <div className="bp-full-center">
        <div className="bp-loader"><div className="bp-spin" /><h2>Finding your perfect stay…</h2><p>Searching for the best available rooms.</p></div>
      </div>
    </div>
  )

  // ── ERROR ──
  if (hotelCode && !loading && !hotel) return (
    <div className="bp-page" style={themeVars}>
      <div className="bp-full-center">
        <div className="bp-err-box">
          <div className="bp-err-icon">🔒</div>
          <h2>Booking Unavailable</h2>
          <p>{pageError || 'This booking link is invalid or has expired. Please contact the hotel directly.'}</p>
          <button className="bp-err-btn" onClick={() => { setPageError(''); loadAll(); window.history.pushState({}, '', '/book') }}>
            <i className="fa-solid fa-arrow-left" /> Browse Hotels
          </button>
        </div>
      </div>
    </div>
  )

  // ── HOTEL BOOKING PAGE ──
  if (hotelCode && hotel) {
    const sub = selRoom ? selRoom.base_price * nights : 0
    const tax = selRoom ? sub * (hotel?.tax_percent || 0) / 100 : 0
    const total = sub + tax
    return (
      <div className="bp-page" style={themeVars}>

        {/* ── TOP RIBBON ── */}
        {theme && !ribbonOff && (theme.banner_headline || theme.banner_subtext || theme.banner_image_url) && (
          <div
            className={`bp-ribbon${theme.banner_image_url ? ' has-image' : ''}`}
            style={{ background: `linear-gradient(135deg, ${theme.bg_gradient_from || '#001f5c'}, ${theme.bg_gradient_to || '#003580'})` }}
          >
            {/* Image rendered as <img> - far more reliable than background-image div */}
            {theme.banner_image_url && (
              <img
                src={resolveAssetUrl(theme.banner_image_url)}
                alt=""
                className="bp-ribbon-bg-img"
              />
            )}
            {/* Dark scrim so text is readable over any image */}
            <div className="bp-ribbon-overlay" />
            <div className="bp-ribbon-inner">
              {theme.banner_headline && (
                <span className="bp-ribbon-title" style={{ color: theme.text_on_banner || '#fff' }}>
                  {theme.banner_headline}
                </span>
              )}
              {theme.banner_headline && theme.banner_subtext && <span className="bp-ribbon-sep">•</span>}
              {theme.banner_subtext && (
                <span className="bp-ribbon-sub" style={{ color: theme.text_on_banner || '#fff' }}>
                  {theme.banner_subtext}
                </span>
              )}
            </div>
            <button className="bp-ribbon-close" onClick={() => setRibbonOff(true)}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        )}

        {/* ── STICKY HEADER ── */}
        <header className="bp-header">
          <div className="bp-hdr-inner">
            <div className="bp-hdr-left">
              {hotel.logo
                ? <img src={resolveAssetUrl(hotel.logo)} alt={hotel.name} className="bp-hdr-logo" />
                : <div className="bp-hdr-icon"><i className="fa-solid fa-hotel" /></div>}
              <div>
                <div className="bp-hdr-name">{hotel.name}</div>
                {hotel.city && <div className="bp-hdr-loc"><i className="fa-solid fa-location-dot" />{hotel.city}{hotel.state ? `, ${hotel.state}` : ''}</div>}
              </div>
            </div>
            <div className="bp-hdr-right">
              {guestSession.user ? (
                <>
                  <button className="bp-hdr-badge bp-hdr-badge-btn" onClick={() => navigate('/guest')}>
                    <i className="fa-solid fa-user" />{guestSession.user.name || 'My bookings'}
                  </button>
                  <button className="bp-hdr-badge bp-hdr-badge-btn" onClick={() => { clearGuestSession(); setGuestSession({ token: null, user: null }) }}>
                    Sign out
                  </button>
                </>
              ) : (
                <button className="bp-hdr-badge bp-hdr-badge-btn" onClick={() => navigate(`/guest/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)}>
                  <i className="fa-solid fa-right-to-bracket" />Sign in
                </button>
              )}
              <button className="bp-hdr-badge bp-hdr-badge-btn" onClick={() => setShowTrust(true)}>
                <i className="fa-solid fa-shield-halved" />Trust &amp; Security
              </button>
              <div className="bp-hdr-badge"><i className="fa-solid fa-lock" />Secure connection</div>
            </div>
          </div>
        </header>

        {/* ── FESTIVE LAYOUT WRAPPER - left panel · main · right panel ── */}
        <div className={`bp-festive-layout${hasFestivePanels ? ' has-panels' : ''}`}>

          {/* LEFT PANEL */}
          {hasFestivePanels && <FestivePanel side="left" theme={theme} />}

          {/* ── MAIN BOOKING CONTENT ── */}
          <div className="bp-main-col">

            {/* Hero */}
            <div className="bp-hero-wrap">
              <div className="bp-hero">
                {hotel.cover_image && (
                  <img
                    src={resolveAssetUrl(hotel.cover_image)}
                    alt={hotel.name}
                    className="bp-hero-photo-img"
                  />
                )}
                <div className="bp-hero-shade" />
                <div className="bp-hero-content">
                  <div className="bp-hero-name">{hotel.name}</div>
                  <div className="bp-hero-row">
                    {hotel.address && <div className="bp-hero-addr"><i className="fa-solid fa-location-dot" />{hotel.address}</div>}
                    <div className="bp-hero-stars">{[1, 2, 3, 4, 5].map(i => <i key={i} className="fa-solid fa-star" />)}</div>
                    <span className="bp-hero-pill"><i className="fa-solid fa-building-shield" />Direct hotel booking</span>
                    {Number(hotel.avg_rating) > 0 && <div className="bp-hero-rating"><span className="score">{Number(hotel.avg_rating).toFixed(1)}</span><span className="cnt">guest rating</span></div>}
                  </div>
                </div>
              </div>

              {/* Overlapping search bar */}
              <div className="bp-search-float">
                <div className="bp-search-card">
                  <div className="bp-sf">
                    <label>CHECK-IN DATE</label>
                    <input type="date" className="bp-search-input" min={TODAY} value={form.check_in} onChange={e => F('check_in', e.target.value)} />
                    {nights > 0 && <span className="bp-sf-nights"><i className="fa-solid fa-moon" />{nights} Night{nights > 1 ? 's' : ''}</span>}
                  </div>
                  <div className="bp-sf">
                    <label>CHECK-OUT DATE</label>
                    <input type="date" className="bp-search-input" min={form.check_in || TODAY} value={form.check_out} onChange={e => F('check_out', e.target.value)} />
                  </div>
                  <div className="bp-sf">
                    <label>GUESTS</label>
                    <select className="bp-search-input" value={form.total_guests} onChange={setGuests}>
                      {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} Guest{n > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                  <button className="bp-search-go" onClick={() => checkAvail()} disabled={checking}>
                    {checking
                      ? <><i className="fa-solid fa-circle-notch fa-spin" />Searching…</>
                      : <><i className="fa-solid fa-magnifying-glass" />Check Availability</>}
                  </button>
                </div>
              </div>
            </div>

            {/* 2-col body */}
            <div className="bp-body">

              {/* LEFT CONTENT COL */}
              <div className="bp-col-left">

                {/* Steps */}
                <div className="bp-steps">
                  <div className={`bp-step ${!form.room_id ? 'active' : 'done'}`}>
                    <div className="bp-step-num">{!form.room_id ? '1' : <i className="fa-solid fa-check" />}</div>
                    <div className="bp-step-info"><span className="bp-step-ttl">Select Room</span><span className="bp-step-sub">Choose your room type</span></div>
                  </div>
                  <div className={`bp-step ${form.room_id ? 'active' : ''}`}>
                    <div className="bp-step-num">2</div>
                    <div className="bp-step-info"><span className="bp-step-ttl">Guest Details</span><span className="bp-step-sub">Your information</span></div>
                  </div>
                  <div className="bp-step">
                    <div className="bp-step-num">3</div>
                    <div className="bp-step-info"><span className="bp-step-ttl">Confirm</span><span className="bp-step-sub">Review &amp; complete</span></div>
                  </div>
                </div>

                {/* Room Cards */}
                <div className="bp-card">
                  <div className="bp-card-head">
                    <h2><i className="fa-solid fa-bed" />Available Rooms</h2>
                    {!checking && roomTypes.length > 0 && <span className="sub">{roomTypes.length} type{roomTypes.length > 1 ? 's' : ''} available</span>}
                  </div>
                  {checking ? (
                    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text3)' }}>
                      <div className="bp-spin" style={{ margin: '0 auto 14px' }} /><p>Checking room availability…</p>
                    </div>
                  ) : roomTypes.length === 0 ? (
                    <div className="bp-no-rooms">
                      <i className="fa-solid fa-bed" /><h3>No rooms available</h3>
                      <p>Try adjusting your dates or number of guests.</p>
                    </div>
                  ) : (
                    <div className="bp-rooms">
                      {roomTypes.map((rt, idx) => {
                        const isSel = selType === rt.type
                        return (
                          <div key={idx} className={`bp-room${isSel ? ' sel' : ''}`} onClick={() => pickRoom(rt)}>
                            <div className="bp-room-img">
                              <img src={resolveAssetUrl(rt.image)} alt={rt.type} loading="lazy" />
                              <span className="bp-room-badge ok"><i className="fa-solid fa-circle-check" />{rt.count} room{rt.count !== 1 ? 's' : ''} available</span>
                            </div>
                            <div className="bp-room-body">
                              <div className="bp-room-name">{rt.type}</div>
                              <div className="bp-room-stats">
                                <span className="bp-room-live"><i className="fa-solid fa-bed" />{rt.count} currently available</span>
                                {Number(hotel.avg_rating) > 0 && <span className="bp-room-reviews"><i className="fa-solid fa-star" />{Number(hotel.avg_rating).toFixed(1)} guest rating</span>}
                              </div>
                              <div className="bp-amenities">
                                <span className="bp-amenity"><i className="fa-solid fa-wifi" />Free WiFi</span>
                                <span className="bp-amenity"><i className="fa-solid fa-circle-info" />Hotel policies apply</span>
                                {Number(hotel?.advance_payment_percent || 0) > 0 ? (
                                  <span className="bp-amenity" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                                    <i className="fa-solid fa-shield-check" />{hotel.advance_payment_percent}% Advance
                                  </span>
                                ) : (
                                  <span className="bp-amenity"><i className="fa-solid fa-wallet" />Pay at Hotel</span>
                                )}
                                <span className="bp-amenity"><i className="fa-solid fa-snowflake" />AC Room</span>
                              </div>
                              <div className="bp-room-foot">
                                <div className="bp-price">
                                  <div className="bp-price-main">
                                    <span className="bp-price-sym">₹</span>
                                    <span className="bp-price-val">{rt.price}</span>
                                  </div>
                                  <div className="bp-price-per">per night before taxes · {nights} night{nights > 1 ? 's' : ''}</div>
                                </div>
                                <button type="button" className={`bp-room-btn${isSel ? ' sel' : ''}`} onClick={e => { e.stopPropagation(); pickRoom(rt) }}>
                                  {isSel ? <><i className="fa-solid fa-circle-check" />Selected</> : 'Select Room'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Guest Form */}
                <form onSubmit={submit}>
                  <div className="bp-card">
                    <div className="bp-card-head"><h2><i className="fa-solid fa-user-pen" />Guest Information</h2></div>
                    {!guestSession.token && (
                      <div className="bp-signin-card">
                        <div><strong>Sign in to continue</strong><p>Your booking history and details stay in one place. Google sign-in or email sign-in works without OTP.</p></div>
                        <button type="button" onClick={() => navigate(`/guest/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)}>Sign in</button>
                      </div>
                    )}
                    <div className="bp-form-body">
                      {matchedGuest && <div className="bp-returning-note"><i className="fa-solid fa-circle-check" />Your saved guest details for this hotel have been filled in. Please review them before confirming.</div>}
                      <div className="bp-form-grid">
                        <div className="bp-f"><label>First Name<span className="bp-req">*</span></label><input type="text" required disabled={!guestSession.token} placeholder="Rajesh" value={form.first_name} onChange={e => F('first_name', e.target.value)} /></div>
                        <div className="bp-f"><label>Last Name<span className="bp-req">*</span></label><input type="text" required disabled={!guestSession.token} placeholder="Kumar" value={form.last_name} onChange={e => F('last_name', e.target.value)} /></div>
                        <div className="bp-f"><label>Email Address<span className="bp-req">*</span></label><input type="email" required disabled placeholder="rajesh@email.com" value={form.guest_email} onChange={e => F('guest_email', e.target.value)} /></div>
                        <div className="bp-f"><label>Mobile Number<span className="bp-req">*</span></label><input type="tel" required placeholder="+91 98765 43210" value={form.guest_phone} onChange={e => F('guest_phone', e.target.value)} /></div>
                        <div className="bp-f"><label>Country</label><select value={form.country} onChange={e => F('country', e.target.value)}>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select></div>
                        <div className="bp-f"><label>Estimated Arrival</label><select value={form.arrival_time} onChange={e => F('arrival_time', e.target.value)}>{["I don't know", "12:00 PM - 2:00 PM", "2:00 PM - 4:00 PM", "4:00 PM - 6:00 PM", "6:00 PM - 8:00 PM", "After 8:00 PM"].map(t => <option key={t}>{t}</option>)}</select></div>
                        <div className="bp-f full"><label>Purpose of Visit</label>
                          <div className="bp-purpose-row">
                            {['Leisure', 'Business'].map(p => (
                              <label key={p} className={`bp-purpose-opt${form.purpose === p ? ' on' : ''}`}>
                                <input type="radio" name="purpose" value={p} checked={form.purpose === p} onChange={e => F('purpose', e.target.value)} />
                                <i className={`fa-solid ${p === 'Leisure' ? 'fa-umbrella-beach' : 'fa-briefcase'}`} />{p}
                              </label>
                            ))}
                          </div>
                        </div>
                        {form.companions.map((c, i) => (
                          <div className="bp-f" key={i}><label>Companion {i + 1}</label><input type="text" placeholder={`Companion ${i + 1} name`} value={c} onChange={e => setComp(i, e.target.value)} /></div>
                        ))}
                        <div className="bp-f full"><label>Special Requests <span style={{ fontWeight: 400, opacity: .6 }}>(Optional)</span></label><textarea placeholder="Early check-in, ground floor, dietary needs, honeymoon setup…" value={form.special_requests} onChange={e => F('special_requests', e.target.value)} /></div>
                      </div>

                      {/* Online vs Pay at Hotel selection */}
                      {(hotel?.feature_online_payment || Number(hotel?.advance_payment_percent || 0) > 0) && (
                        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                          {Number(hotel?.advance_payment_percent || 0) > 0 ? (
                            <div style={{ background: '#f0fdf4', border: '1.5px solid #22c55e', borderRadius: 10, padding: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, color: '#15803d', fontWeight: 700, fontSize: 14 }}>
                                <i className="fa-solid fa-shield-check" style={{ fontSize: 20, color: '#16a34a' }} />
                                <span>Mandatory {hotel.advance_payment_percent}% Advance Online Deposit Required</span>
                              </div>
                              <p style={{ margin: 0, fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
                                {selRoom ? (
                                  <>To confirm your booking at <strong>{hotel.name}</strong>, a mandatory <strong>{hotel.advance_payment_percent}% deposit of ₹{Math.round((total * hotel.advance_payment_percent) / 100)}</strong> must be paid online via <strong>{hotel.payment_gateway === 'phonepe' ? 'PhonePe' : 'Razorpay'}</strong>. The remaining balance of <strong>₹{Math.max(0, Math.round(total - (total * hotel.advance_payment_percent / 100)))}</strong> is payable at check-in.</>
                                ) : (
                                  <>A mandatory {hotel.advance_payment_percent}% online deposit is required to confirm room bookings at {hotel.name}. Please select a room above to continue.</>
                                )}
                              </p>
                            </div>
                          ) : (
                            <div>
                              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy-900)', display: 'block', marginBottom: 8 }}>
                                <i className="fa-solid fa-credit-card" style={{ marginRight: 6, color: 'var(--brand)' }} />Select Payment Option:
                              </label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <label style={{
                                  display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px',
                                  border: form.pay_mode === 'hotel' ? '2px solid #00875A' : '1px solid #cbd5e1',
                                  borderRadius: 8, cursor: 'pointer',
                                  background: form.pay_mode === 'hotel' ? '#f0fdf4' : '#ffffff',
                                  color: form.pay_mode === 'hotel' ? '#00875A' : '#475569'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                                    <input type="radio" name="pay_mode" value="hotel" checked={form.pay_mode === 'hotel'} onChange={() => F('pay_mode', 'hotel')} />
                                    <i className="fa-solid fa-hotel" style={{ color: '#00875A', fontSize: 15 }} /> Pay at Hotel
                                  </div>
                                  <span style={{ fontSize: 11.5, opacity: 0.8, paddingLeft: 24 }}>Pay 100% at check-in on arrival</span>
                                </label>

                                <label style={{
                                  display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px',
                                  border: form.pay_mode === 'online' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                  borderRadius: 8, cursor: 'pointer',
                                  background: form.pay_mode === 'online' ? '#f0f9ff' : '#ffffff',
                                  color: form.pay_mode === 'online' ? '#0284c7' : '#475569'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                                    <input type="radio" name="pay_mode" value="online" checked={form.pay_mode === 'online'} onChange={() => F('pay_mode', 'online')} />
                                    <i className={`fa-solid ${hotel.payment_gateway === 'phonepe' ? 'fa-mobile-screen-button' : 'fa-bolt'}`} style={{ color: hotel.payment_gateway === 'phonepe' ? '#7c3aed' : '#0284c7', fontSize: 15 }} />
                                    Pay Online ({hotel.payment_gateway === 'phonepe' ? 'PhonePe' : 'Razorpay'})
                                  </div>
                                  <span style={{ fontSize: 11.5, opacity: 0.8, paddingLeft: 24 }}>Continue with the hotel&apos;s configured payment partner</span>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="bp-form-foot">
                      {!form.room_id && <div className="bp-no-room-warn"><i className="fa-solid fa-triangle-exclamation" />Please select a room type above to continue.</div>}
                      <button type="submit" className="bp-submit" disabled={submitting || !form.room_id}>
                        {submitting
                          ? <><i className="fa-solid fa-circle-notch fa-spin" />Processing…</>
                          : !guestSession.token
                            ? <><i className="fa-solid fa-right-to-bracket" />Sign in to continue</>
                            : <><i className="fa-solid fa-calendar-check" />
                              {Number(hotel?.advance_payment_percent || 0) > 0 && selRoom
                                ? `Pay ₹${Math.round((total * hotel.advance_payment_percent) / 100)} Advance Online`
                                : form.pay_mode === 'online'
                                  ? `Pay ₹${total.toFixed(0)} Online Now`
                                  : 'Confirm Booking'} - {nights} Night{nights > 1 ? 's' : ''}
                            </>}
                      </button>
                      <div className="bp-enc">
                        <i className="fa-solid fa-lock" />100% Secure &amp; Encrypted &nbsp;·&nbsp;{' '}
                        {Number(hotel?.advance_payment_percent || 0) > 0 && selRoom
                          ? `Pay ₹${Math.round((total * hotel.advance_payment_percent) / 100)} today, balance ₹${Math.max(0, Math.round(total - (total * hotel.advance_payment_percent / 100)))} at check-in`
                          : form.pay_mode === 'online'
                            ? 'Payment handled by the hotel payment partner'
                            : 'No payment required today'}
                      </div>
                      {result && (
                        <div className={`bp-alert ${result.ok ? 'ok' : 'err'}`}>
                          <i className={`fa-solid ${result.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
                          <div>
                            {result.ok
                              ? <><strong>Booking confirmed.</strong><br />Your confirmation code: <strong style={{ fontFamily: 'monospace', fontSize: 16 }}>{result.code}</strong><br /><button type="button" className="bp-result-link" onClick={() => navigate('/guest')}>View my bookings</button></>
                              : result.msg}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </form>
              </div>

              {/* RIGHT SUMMARY COL */}
              <div className="bp-col-right">
                <div className="bp-sum">
                  <div className="bp-sum-head">
                    <div className="bp-sum-eyebrow">Booking Summary</div>
                    <div className="bp-sum-hotel">{hotel.name}</div>
                    <div className="bp-sum-stars">{[1, 2, 3, 4, 5].map(i => <i key={i} className="fa-solid fa-star" />)}</div>
                  </div>
                  <div className="bp-sum-body">
                    <div className="bp-date-row">
                      <div className="bp-date-cell"><div className="bp-date-lbl">Check-in</div><div className="bp-date-val">{form.check_in}</div></div>
                      <div className="bp-date-mid"><i className="fa-solid fa-arrow-right" /><span>{nights}N</span></div>
                      <div className="bp-date-cell"><div className="bp-date-lbl">Check-out</div><div className="bp-date-val">{form.check_out}</div></div>
                    </div>
                    <div className="bp-row"><span className="l">Guests</span><span className="v">{form.total_guests} Guest{Number(form.total_guests) > 1 ? 's' : ''}</span></div>
                    <div className="bp-row"><span className="l">Duration</span><span className="v">{nights} Night{nights > 1 ? 's' : ''}</span></div>
                    <hr className="bp-div" />
                    {selRoom ? (
                      <>
                        <div className="bp-row"><span className="l">Room</span><span className="v" style={{ fontSize: 12.5 }}>{selType}</span></div>
                        <div className="bp-row"><span className="l">Room × {nights}</span><span className="v">₹{sub.toFixed(0)}</span></div>
                        <div className="bp-row"><span className="l">Tax ({hotel?.tax_percent || 0}%)</span><span className="v">₹{tax.toFixed(0)}</span></div>
                        <hr className="bp-div" />
                        <div className="bp-total-box"><span className="bp-total-lbl">Total Amount</span><span className="bp-total-val">₹{total.toFixed(0)}</span></div>

                        {Number(hotel?.advance_payment_percent || 0) > 0 ? (
                          <div style={{ marginTop: 10, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#166534' }}>
                              <span><i className="fa-solid fa-shield-check" style={{ marginRight: 4 }} />Advance Online ({hotel.advance_payment_percent}%):</span>
                              <span>₹{Math.round((total * hotel.advance_payment_percent) / 100)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginTop: 4 }}>
                              <span>Balance Due at Check-in:</span>
                              <span>₹{Math.max(0, Math.round(total - (total * hotel.advance_payment_percent / 100)))}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="bp-total-note">Taxes shown are based on the hotel&apos;s configured rate.</p>
                        )}
                      </>
                    ) : (
                      <div className="bp-sum-empty"><i className="fa-regular fa-hand-pointer" /><p>Select a room above to see the full price breakdown.</p></div>
                    )}
                  </div>
                </div>

                <div className="bp-pay-trust">
                  <i className={`fa-solid ${Number(hotel?.advance_payment_percent || 0) > 0 ? 'fa-shield-halved' : 'fa-wallet'}`} />
                  <div>
                    <strong>{Number(hotel?.advance_payment_percent || 0) > 0 ? `${hotel.advance_payment_percent}% Advance Deposit Required` : 'No Payment Required Today'}</strong>
                    <p>
                      {Number(hotel?.advance_payment_percent || 0) > 0
                        ? selRoom
                          ? `Pay ₹${Math.round((total * hotel.advance_payment_percent) / 100)} (${hotel.advance_payment_percent}%) online today to secure your room. The remaining ₹${Math.max(0, Math.round(total - (total * hotel.advance_payment_percent / 100)))} is paid at check-in.`
                          : `A mandatory ${hotel.advance_payment_percent}% online advance payment is required to confirm your booking.`
                        : 'Pay directly at the hotel on arrival. No card details needed right now.'}
                    </p>
                  </div>
                </div>

                <div className="bp-policy">
                  <h4><i className="fa-solid fa-circle-info" />Hotel Policies</h4>
                  <div className="bp-pol-item"><i className="fa-solid fa-id-card" />Government ID required at check-in</div>
                  <div className="bp-pol-item"><i className="fa-solid fa-receipt" />Cancellation and check-in terms are set by the hotel.</div>
                  <div className="bp-pol-item"><i className="fa-solid fa-phone" />Contact the hotel for policy questions before booking.</div>
                </div>
              </div>
            </div>
          </div>{/* /bp-main-col */}

          {/* RIGHT PANEL */}
          {hasFestivePanels && <FestivePanel side="right" theme={theme} />}

        </div>{/* /bp-festive-layout */}

        <footer className="bp-footer">
          <div className="bp-footer-in">
            <div className="bp-footer-brand">{hotel.name}</div>
            <div className="bp-footer-trust">
              <div className="bp-footer-tag"><i className="fa-solid fa-lock" />Secure connection</div>
              <div className="bp-footer-tag"><i className="fa-solid fa-building-shield" />Direct hotel booking</div>
              <div className="bp-footer-tag"><i className="fa-solid fa-receipt" />Hotel policies shown before payment</div>
            </div>
            <div className="bp-footer-note">© {new Date().getFullYear()} {hotel.name} · All rights reserved · Powered by HMS</div>
          </div>
        </footer>

        {/* Trust Modal */}
        {showTrust && (
          <div className="bp-modal-overlay" onClick={() => setShowTrust(false)}>
            <div className="bp-modal" onClick={e => e.stopPropagation()}>
              <div className="bp-modal-header">
                <h3><i className="fa-solid fa-shield-halved" /> Trust &amp; Security</h3>
                <button className="bp-modal-close" onClick={() => setShowTrust(false)}><i className="fa-solid fa-xmark" /></button>
              </div>
              <div className="bp-modal-body">
                <p className="bp-modal-text">You are booking directly with this hotel. Your account keeps your booking history and uses the hotel&apos;s configured payment process when payment is required.</p>
                <ul className="bp-modal-list">
                  {['Direct hotel booking link', 'Sign-in required before a booking is created', 'Your account stores your booking history', 'Payment is requested only when the hotel requires it', 'Hotel cancellation and check-in terms apply'].map(item => (
                    <li key={item}><i className="fa-solid fa-circle-check" />{item}</li>
                  ))}
                </ul>
              </div>
              <div className="bp-modal-footer">
                <button className="bp-modal-btn" onClick={() => setShowTrust(false)}>Got it</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── BROWSE PAGE ──
  return (
    <div className="bp-page">
      <div className="bp-browse-hero">
        <div className="bp-browse-hero-inner">
          <h1>Find Your Perfect Stay</h1>
          <p>Browse participating hotels and book directly through their official booking links.</p>
        </div>
      </div>
      <div className="bp-browse-body">
        {loading ? (
          <div className="bp-loader" style={{ padding: '60px 0', textAlign: 'center' }}>
            <div className="bp-spin" style={{ margin: '0 auto 16px' }} /><p>Loading hotels…</p>
          </div>
        ) : hotels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
            <i className="fa-solid fa-hotel" style={{ fontSize: 52, display: 'block', marginBottom: 16, opacity: .25 }} /><p>No hotels available.</p>
          </div>
        ) : (
          <div className="bp-hotels-grid">
            {hotels.map(h => (
              <div key={h.id} className="bp-h-card" onClick={() => navigate(`/book/${h.public_token || h.id}`)}>
                <div className="bp-h-card-img">
                  <img src={resolveAssetUrl(h.cover_image) || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=600'} alt={h.name} loading="lazy" />
                </div>
                <div className="bp-h-card-body">
                  <h3>{h.name}</h3>
                  <div className="bp-h-card-loc"><i className="fa-solid fa-location-dot" />{h.city}, {h.state}</div>
                  <div className="bp-h-card-cta">
                    <div className="bp-room-meta"><i className="fa-solid fa-building-shield" />Official booking link</div>
                    <button className="bp-h-btn">View Rooms <i className="fa-solid fa-arrow-right" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
