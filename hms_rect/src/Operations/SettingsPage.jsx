import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { login as setAuthLogin } from '../Redux/authSlice.jsx'
import { getWithAuth, postWithAuth, putWithAuth, deleteWithAuth } from '../api'
import toast from 'react-hot-toast'
import './SettingsOTA.css'

const TODAY_STR = new Date().toISOString().slice(0, 10)
const NEXT_30_DAYS_STR = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

export default function SettingsPage() {
  const dispatch = useDispatch()
  const token = useSelector((state) => state.auth.accesstoken)
  const activeHotelId = useSelector((state) => state.auth.activeHotelId)
  const [tab, setTab] = useState('profile')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState({ profile: false, password: false, system: false, hotel: false, offer: false, pricing: false, roomOccupancy: false, taxRate: false, export: false, publicUrl: false })
  // Tax Rates
  const [taxRates, setTaxRates] = useState([])
  const [taxRateForm, setTaxRateForm] = useState({ account: '', type: '', category: '', amount: '', description: '' })
  const [editingTaxRate, setEditingTaxRate] = useState(null)

  // Notifications
  const [emailStatus, setEmailStatus] = useState(null)
  const [emailStats, setEmailStats] = useState(null)
  const [testEmailAddr, setTestEmailAddr] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  // Export
  const [exportForm, setExportForm] = useState({ type: 'bookings', date_from: TODAY_STR, date_to: NEXT_30_DAYS_STR })
  const [exporting, setExporting] = useState(false)

  const [profile, setProfile] = useState({ name: '', email: '', phone: '', profile_photo: '', username: '' })
  const [password, setPassword] = useState({ current_password: '', new_password: '', confirm: '' })
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false })
  const [system, setSystem] = useState({
    included_guests: 1,
    extra_guest_charge_per_night: 500,
    checkout_time: '11:00',
    checkin_time: '14:00',
    late_checkout_grace_minutes: 30,
    late_checkout_hourly_charge: 0,
    allow_late_checkout: true,
    default_offer_enabled: false,
    default_offer_name: 'Special Offer',
    default_offer_percent: 0,
    invoice_prefix: 'INV',
    company_name: '',
    currency: 'INR',
    date_format: 'DD-MM-YYYY',
    time_zone: 'Asia/Kolkata',
  })
  const [hotel, setHotel] = useState({
    name: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    gst_number: '',
    tax_type: 'GST',
    tax_percent: 18,
    tax_name: '', // For custom tax name when 'Other' is selected
    logo: '',
    feature_channel_manager: true,
  })
  const [pricingRows, setPricingRows] = useState([])
  const [pricingMeta, setPricingMeta] = useState({ occasion: '', reason: '', valid_from: TODAY_STR, valid_to: NEXT_30_DAYS_STR })
  const [roomOccupancyDefaults, setRoomOccupancyDefaults] = useState({ included_guests: 1, extra_guest_charge_per_night: 500 })
  const [roomTypeOccupancyRows, setRoomTypeOccupancyRows] = useState([])
  const [publicUrl, setPublicUrl] = useState({
    enabled: true,
    base_url: '',
    booking_path: '/booking/create',
    append_hotel_id: true,
    campaign_tag: '',
  })

  const setError = (text) => toast.error(text)
  const setSuccess = (text) => toast.success(text)

  const publicUrlStorageKey = useMemo(
    () => `settings_public_url_${activeHotelId || 'default'}`,
    [activeHotelId]
  )
  const encodedHotelCode = useMemo(() => {
    if (!activeHotelId) return ''
    try {
      return btoa(String(activeHotelId)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    } catch {
      return String(activeHotelId)
    }
  }, [activeHotelId])

  const getCurrentRuleLabel = (row) => {
    const currentPct = Number(row?.current_adjustment_percent || 0)
    const avgPrice = Math.max(0, Number(row?.avg_price || 0))
    if (currentPct !== 0) {
      const finalAvg = Math.max(0, avgPrice * (1 + currentPct / 100))
      return `${currentPct.toFixed(2)}% (${row.current_valid_from || '-'} to ${row.current_valid_to || '-'}) | Final Avg ₹ ${finalAvg.toFixed(2)}`
    }
    return `No active % rule | Current Avg ₹ ${avgPrice.toFixed(2)}`
  }

  const loadOfferSettings = useCallback(async () => {
    try {
      const res = await getWithAuth('/settings/offer', token)
      return res?.data || {}
    } catch (e) {
      if (e?.response?.status === 404) {
        const res = await getWithAuth('/settings/system', token)
        return {
          default_offer_enabled: !!res?.data?.default_offer_enabled,
          default_offer_name: res?.data?.default_offer_name || 'Special Offer',
          default_offer_percent: Number(res?.data?.default_offer_percent || 0),
        }
      }
      throw e
    }
  }, [token])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [pRes, sRes, oRes, hRes, prRes, roRes, trRes, esRes, estRes] = await Promise.allSettled([
      getWithAuth('/settings/profile', token),
      getWithAuth('/settings/system', token),
      loadOfferSettings(),
      getWithAuth('/settings/hotel', token),
      getWithAuth('/settings/pricing', token),
      getWithAuth('/settings/room-occupancy', token),
      getWithAuth('/taxrates', token),
      Promise.resolve({}), // getWithAuth('/email/status', token),
      Promise.resolve({}), // getWithAuth('/email/statistics', token),
    ])

    if (pRes.status === 'fulfilled' && pRes.value?.data && typeof pRes.value.data === 'object') {
      setProfile((prev) => ({ ...prev, ...pRes.value.data }))
    }
    if (sRes.status === 'fulfilled' && sRes.value?.data && typeof sRes.value.data === 'object') {
      setSystem((prev) => ({ ...prev, ...sRes.value.data }))
    }
    if (oRes.status === 'fulfilled' && oRes.value && typeof oRes.value === 'object') {
      setSystem((prev) => ({ ...prev, ...oRes.value }))
    }
    if (hRes.status === 'fulfilled' && hRes.value?.data && typeof hRes.value.data === 'object') {
      const hd = hRes.value.data
      setHotel((prev) => ({ ...prev, ...hd }))
      setPublicUrl((prev) => ({
        ...prev,
        enabled: hd.booking_enabled ?? true,
        base_url: hd.booking_base_url || import.meta.env.VITE_PUBLIC_WEBSITE_URL || 'http://localhost:5173',
        booking_path: hd.booking_path || '/book',
        campaign_tag: hd.booking_campaign_tag || '',
        public_token: hd.public_token || '',
        advance_payment_percent: hd.advance_payment_percent ?? 0,
      }))
    }
    if (prRes.status === 'fulfilled') {
      const items = Array.isArray(prRes.value?.data?.items) ? prRes.value.data.items : []
      const map = {}
      const byType = {}
      for (const it of items) {
        const rt = typeof it.room_type === 'object' ? (it.room_type?.name || '') : String(it.room_type || '')
        const key = rt.trim().toLowerCase()
        if (!key) continue
        byType[key] = { ...it, room_type: rt.trim() }
      }
      for (const it of items) {
        const rt = typeof it.room_type === 'object' ? (it.room_type?.name || '') : String(it.room_type || '')
        const key = rt.trim().toLowerCase()
        if (!key) continue
        map[key] = {
          room_type: rt.trim(),
          count: Number(it.count || 0),
          avg_price: Number(it.avg_price || 0),
          percentage: '',
        }
      }
      const ordered = Object.values(map).sort((a, b) => a.room_type.localeCompare(b.room_type))
      setPricingRows((prev) => {
        const prevByType = {}
        for (const row of prev) {
          prevByType[String(row.room_type || '').trim().toLowerCase()] = row
        }
        return ordered.map((x) => {
          const key = String(x.room_type || '').trim().toLowerCase()
          const source = byType[key] || {}
          const existing = prevByType[key]
          const currentAdjustmentPercent = Number(source.current_adjustment_percent || 0)
          return {
            ...x,
            current_adjustment_percent: currentAdjustmentPercent,
            current_valid_from: source.current_valid_from || '',
            current_valid_to: source.current_valid_to || '',
            percentage: existing ? existing.percentage : String(currentAdjustmentPercent || ''),
            adjustment_mode: existing?.adjustment_mode || 'percent',
          }
        })
      })
    }

    if (roRes.status === 'fulfilled') {
      const defaults = roRes.value?.data?.defaults || {}
      const items = Array.isArray(roRes.value?.data?.items) ? roRes.value.data.items : []
      setRoomOccupancyDefaults({
        included_guests: Math.max(1, Number(defaults.included_guests || 1)),
        extra_guest_charge_per_night: Math.max(0, Number(defaults.extra_guest_charge_per_night || 0)),
      })
      setRoomTypeOccupancyRows(items.map((row) => {
        const rt = typeof row.room_type === 'object' ? (row.room_type?.name || '') : String(row.room_type || '')
        return {
          room_type: rt.trim(),
          rooms_count: Number(row.rooms_count || 0),
          mixed_overrides: !!row.mixed_overrides,
          override_enabled: !!row.override_enabled,
          included_guests_override: row.included_guests_override == null ? '' : String(row.included_guests_override),
          extra_guest_charge_per_night_override: row.extra_guest_charge_per_night_override == null ? '' : String(row.extra_guest_charge_per_night_override),
        }
      }))
    }

    if ([pRes, sRes, oRes, hRes, prRes, roRes].some((x) => x.status === 'rejected')) {
      setError('Some settings failed to load. Please refresh or check your active hotel selection.')
    }
    if (trRes.status === 'fulfilled') setTaxRates(Array.isArray(trRes.value?.data) ? trRes.value.data : [])
    if (esRes.status === 'fulfilled') setEmailStatus(esRes.value?.data || null)
    if (estRes.status === 'fulfilled') setEmailStats(estRes.value?.data || null)
    setLoading(false)
  }, [token, loadOfferSettings])

  useEffect(() => {
    if (!token) return
    const raf = requestAnimationFrame(() => {
      loadAll().catch(() => { })
    })
    return () => cancelAnimationFrame(raf)
  }, [token, loadAll])

  const generatedPublicUrl = useMemo(() => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''
    const fallbackOrigin = currentOrigin.includes(':5174')
      ? currentOrigin.replace(':5174', ':5173')
      : currentOrigin
    const base = String(publicUrl.base_url || fallbackOrigin).trim().replace(/\/+$/, '')
    // Use public_token for security, fallback to encoded hotel ID if no token
    const tokenOrCode = publicUrl.public_token || hotel?.public_token || encodedHotelCode || String(activeHotelId || '')
    const path = `/${String(publicUrl.booking_path || '/book').trim().replace(/^\/+/, '')}/${tokenOrCode}`
    const params = new URLSearchParams()

    if (publicUrl.campaign_tag.trim()) {
      params.set('campaign', publicUrl.campaign_tag.trim())
    }

    const query = params.toString()
    return `${base}${path}${query ? `?${query}` : ''}`
  }, [activeHotelId, encodedHotelCode, publicUrl, hotel?.public_token])

  async function saveProfile() {
    setSaving((s) => ({ ...s, profile: true }))
    try {
      await putWithAuth('/settings/profile', profile, token)
      setSuccess('Profile updated successfully.')
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to update profile')
    }
    setSaving((s) => ({ ...s, profile: false }))
  }

  async function savePassword() {
    if (password.new_password !== password.confirm) {
      setError('New password and confirmation must match.')
      return
    }
    if ((password.new_password || '').length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }
    setSaving((s) => ({ ...s, password: true }))
    try {
      await putWithAuth('/settings/profile/password', {
        current_password: password.current_password,
        new_password: password.new_password,
      }, token)
      setPassword({ current_password: '', new_password: '', confirm: '' })
      setSuccess('Password updated successfully.')
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to update password')
    }
    setSaving((s) => ({ ...s, password: false }))
  }

  async function saveSystem() {
    setSaving((s) => ({ ...s, system: true }))
    try {
      await putWithAuth('/settings/system', system, token)
      setSuccess('System settings updated successfully.')
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to update system settings')
    }
    setSaving((s) => ({ ...s, system: false }))
  }

  async function saveHotel() {
    setSaving((s) => ({ ...s, hotel: true }))
    try {
      const { logo, ...hotelPayload } = hotel
      await putWithAuth('/settings/hotel', hotelPayload, token)
      // Refresh token so feature-based access control updates immediately.
      if (activeHotelId) {
        const switchRes = await postWithAuth('/hotels/switch', { hotel_id: Number(activeHotelId) }, token)
        if (switchRes?.data?.token) {
          dispatch(setAuthLogin({ token: switchRes.data.token, role: 'admin', activeHotelId: Number(activeHotelId) }))
        }
      }
      setSuccess('Hotel settings updated successfully.')
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to update hotel settings')
    }
    setSaving((s) => ({ ...s, hotel: false }))
  }

  async function saveOffer() {
    setSaving((s) => ({ ...s, offer: true }))
    try {
      const payload = {
        default_offer_enabled: !!system.default_offer_enabled,
        default_offer_name: system.default_offer_name,
        default_offer_percent: Number(system.default_offer_percent || 0),
      }
      try {
        await putWithAuth('/settings/offer', payload, token)
      } catch (e) {
        if (e?.response?.status === 404) {
          await putWithAuth('/settings/system', {
            included_guests: Math.max(1, Number(system.included_guests || 1)),
            extra_guest_charge_per_night: Math.max(0, Number(system.extra_guest_charge_per_night || 0)),
            checkout_time: String(system.checkout_time || '11:00'),
            checkin_time: String(system.checkin_time || '14:00'),
            late_checkout_grace_minutes: Math.max(0, Number(system.late_checkout_grace_minutes ?? 30)),
            late_checkout_hourly_charge: Math.max(0, Number(system.late_checkout_hourly_charge ?? 0)),
            allow_late_checkout: !!system.allow_late_checkout,
            default_offer_enabled: !!system.default_offer_enabled,
            default_offer_name: system.default_offer_name,
            default_offer_percent: Number(system.default_offer_percent || 0),
            invoice_prefix: system.invoice_prefix,
            company_name: system.company_name,
            currency: system.currency,
            date_format: system.date_format,
            time_zone: system.time_zone,
          }, token)
        } else {
          throw e
        }
      }
      setSuccess('Offer settings updated successfully.')
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to update offer settings')
    }
    setSaving((s) => ({ ...s, offer: false }))
  }

  async function saveRoomOccupancyPricing() {

    const invalidRow = roomTypeOccupancyRows.find((row) => {
      if (!row.override_enabled) return false
      const included = Number(row.included_guests_override)
      const extra = Number(row.extra_guest_charge_per_night_override)
      if (!Number.isFinite(included) || included < 1 || included > 10) return true
      if (!Number.isFinite(extra) || extra < 0) return true
      return false
    })

    if (invalidRow) {
      setError(`Invalid occupancy override in room type ${invalidRow.room_type}. Included guests must be 1-10 and extra charge must be >= 0.`)
      return
    }

    const payload = {
      items: roomTypeOccupancyRows.map((row) => ({
        room_type: row.room_type,
        override_enabled: !!row.override_enabled,
        included_guests_override: row.override_enabled ? Number(row.included_guests_override) : null,
        extra_guest_charge_per_night_override: row.override_enabled ? Number(row.extra_guest_charge_per_night_override) : null,
      })),
    }

    setSaving((s) => ({ ...s, roomOccupancy: true }))
    try {
      await putWithAuth('/settings/room-occupancy', payload, token)
      setSuccess('Room-type occupancy pricing updated successfully.')
      await loadAll()
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to update room-type occupancy pricing')
    }
    setSaving((s) => ({ ...s, roomOccupancy: false }))
  }

  async function savePublicUrlSettings() {
    setSaving((s) => ({ ...s, publicUrl: true }))
    try {
      const payload = {
        booking_enabled: !!publicUrl.enabled,
        booking_base_url: String(publicUrl.base_url || '').trim(),
        booking_path: '/book',
        booking_campaign_tag: String(publicUrl.campaign_tag || '').trim(),
        advance_payment_percent: Number(publicUrl.advance_payment_percent || 0),
      }
      await putWithAuth('/settings/hotel', payload, token)
      setSuccess('Public URL & Advance Payment settings saved successfully.')
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to save public URL settings')
    }
    setSaving((s) => ({ ...s, publicUrl: false }))
  }

  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(generatedPublicUrl)
      setSuccess('Public booking URL copied.')
    } catch {
      setError('Failed to copy public booking URL')
    }
  }

  function openPublicUrl() {
    window.open(generatedPublicUrl, '_blank', 'noopener,noreferrer')
  }

  async function regeneratePublicUrl() {
    if (!confirm('Are you sure? This will create a NEW public URL and the OLD one will stop working immediately.')) {
      return
    }
    setSaving((s) => ({ ...s, publicUrl: true }))
    try {
      if (!token) {
        toast.error('No login token found. Please login again.')
        return
      }
      const res = await postWithAuth('/hotels/regenerate-public-token', {}, token)
      if (res && res.data && res.data.public_token) {
        setPublicUrl((p) => ({ ...p, public_token: res.data.public_token }))
        setHotel((h) => ({ ...h, public_token: res.data.public_token }))
        toast.success('New public URL generated! Old URL is now invalid.')
      } else {
        throw new Error('Failed to regenerate URL')
      }
    } catch (e) {
      if (e?.response?.status === 401) {
        toast.error('Session expired. Please logout and login again.')
      } else {
        toast.error(e?.message || 'Failed to regenerate public URL')
      }
    } finally {
      setSaving((s) => ({ ...s, publicUrl: false }))
    }
  }

  async function applyRoomTypePricing() {
    const adjustments = pricingRows
      .map((r) => ({
        room_type: r.room_type,
        percentage: Number(r.percentage === '' ? r.current_adjustment_percent : r.percentage),
        changed: Number(r.percentage === '' ? r.current_adjustment_percent : r.percentage) !== Number(r.current_adjustment_percent || 0),
      }))
      .filter((r) => r.changed)
      .map(({ room_type, percentage }) => ({ room_type, percentage }))

    if (adjustments.length === 0) {
      setError('No room-type changes detected. Update at least one adjustment value.')
      return
    }

    if (!pricingMeta.valid_from || !pricingMeta.valid_to) {
      setError('Valid From and Valid To are required.')
      return
    }

    setSaving((s) => ({ ...s, pricing: true }))
    try {
      const res = await postWithAuth('/settings/pricing/adjust', {
        adjustments,
        valid_from: pricingMeta.valid_from,
        valid_to: pricingMeta.valid_to,
        occasion: pricingMeta.occasion,
        reason: pricingMeta.reason,
      }, token)

      const updated = Number(res?.data?.updated_rooms || 0)
      setSuccess(`Room pricing updated successfully for ${updated} room(s).`)
      setPricingMeta((prev) => ({ ...prev, occasion: '', reason: '' }))
      await loadAll()
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to apply room pricing adjustments')
    }
    setSaving((s) => ({ ...s, pricing: false }))
  }

  async function removeAllActivePricingRules() {
    const activeRows = pricingRows.filter((r) => Number(r.current_adjustment_percent || 0) !== 0)
    if (activeRows.length === 0) {
      setSuccess('There are no active pricing rules to remove.')
      return
    }

    setSaving((s) => ({ ...s, pricing: true }))
    try {
      await postWithAuth('/settings/pricing/adjust', {
        adjustments: activeRows.map((r) => ({ room_type: r.room_type, percentage: 0 })),
        valid_from: pricingMeta.valid_from || TODAY_STR,
        valid_to: pricingMeta.valid_to || TODAY_STR,
        occasion: pricingMeta.occasion,
        reason: pricingMeta.reason || 'Removed all active pricing rules',
      }, token)

      setSuccess('All active pricing rules were removed successfully.')
      await loadAll()
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to remove active pricing rules')
    }
    setSaving((s) => ({ ...s, pricing: false }))
  }

  async function removeSingleActivePricingRule(row) {

    const current = Number(row?.current_adjustment_percent || 0)
    if (current === 0) {
      setSuccess(`No active pricing rule to reset for ${row?.room_type || 'this room type'}.`)
      return
    }

    setSaving((s) => ({ ...s, pricing: true }))
    try {
      await postWithAuth('/settings/pricing/adjust', {
        adjustments: [{ room_type: row.room_type, percentage: 0 }],
        valid_from: pricingMeta.valid_from || TODAY_STR,
        valid_to: pricingMeta.valid_to || TODAY_STR,
        occasion: pricingMeta.occasion,
        reason: pricingMeta.reason || `Reset pricing rule for ${row.room_type}`,
      }, token)

      setSuccess(`Pricing rule reset for ${row.room_type}.`)
      await loadAll()
    } catch (e) {
      setError(e?.response?.data?.error || `Failed to reset pricing rule for ${row.room_type}`)
    }
    setSaving((s) => ({ ...s, pricing: false }))
  }

  function resetSinglePricingRow(row) {
    removeSingleActivePricingRule(row)
  }

  async function applySinglePricingRule(row) {

    const mode = row?.adjustment_mode === 'price' ? 'price' : 'percent'
    const rawValue = String(row?.percentage ?? '').trim()
    if (!rawValue) {
      setError(`Enter a valid ${mode === 'percent' ? 'adjustment %' : 'price value'} for ${row?.room_type || 'this room type'}.`)
      return
    }

    setSaving((s) => ({ ...s, pricing: true }))
    try {
      if (!pricingMeta.valid_from || !pricingMeta.valid_to) {
        setError('Valid From and Valid To are required.')
        setSaving((s) => ({ ...s, pricing: false }))
        return
      }

      if (mode === 'percent') {
        const nextPercentage = Number(rawValue)
        if (Number.isNaN(nextPercentage) || nextPercentage < -100 || nextPercentage > 100) {
          setError('Adjustment percentage must be between -100 and 100.')
          setSaving((s) => ({ ...s, pricing: false }))
          return
        }

        await postWithAuth('/settings/pricing/adjust', {
          adjustments: [{ room_type: row.room_type, percentage: nextPercentage }],
          valid_from: pricingMeta.valid_from,
          valid_to: pricingMeta.valid_to,
          occasion: pricingMeta.occasion,
          reason: pricingMeta.reason || `Activated pricing rule for ${row.room_type}`,
        }, token)

        setSuccess(`Pricing rule activated for ${row.room_type} (${nextPercentage.toFixed(2)}%).`)
      } else {
        const currentAvg = Number(row?.avg_price || 0)
        if (currentAvg <= 0) {
          setError(`Cannot apply ₹ adjustment for ${row?.room_type || 'this room type'} because current average base price is 0.`)
          setSaving((s) => ({ ...s, pricing: false }))
          return
        }

        let nextBasePrice = Number(rawValue)
        if ((rawValue.startsWith('+') || rawValue.startsWith('-')) && !Number.isNaN(Number(rawValue))) {
          nextBasePrice = currentAvg + Number(rawValue)
        }
        if (Number.isNaN(nextBasePrice) || nextBasePrice < 0) {
          setError(`Enter valid value for ${row?.room_type || 'this room type'}. Use absolute price (e.g. 2400) or delta (e.g. +200, -150).`)
          setSaving((s) => ({ ...s, pricing: false }))
          return
        }

        const nextPercentage = ((nextBasePrice - currentAvg) / currentAvg) * 100
        if (!Number.isFinite(nextPercentage) || nextPercentage < -100 || nextPercentage > 1000) {
          setError(`Calculated percentage for ${row?.room_type || 'this room type'} is out of allowed range.`)
          setSaving((s) => ({ ...s, pricing: false }))
          return
        }

        await postWithAuth('/settings/pricing/adjust', {
          adjustments: [{ room_type: row.room_type, percentage: nextPercentage }],
          valid_from: pricingMeta.valid_from,
          valid_to: pricingMeta.valid_to,
          occasion: pricingMeta.occasion,
          reason: pricingMeta.reason || `Activated price-based rule for ${row.room_type}`,
        }, token)

        setSuccess(`Price-based rule activated for ${row.room_type} (target ₹${nextBasePrice.toFixed(2)}, equivalent ${nextPercentage.toFixed(2)}%).`)
      }

      await loadAll()
    } catch (e) {
      setError(e?.response?.data?.error || `Failed to apply pricing for ${row?.room_type || 'this room type'}`)
    }
    setSaving((s) => ({ ...s, pricing: false }))
  }

  // ── Tax Rates ──────────────────────────────────────────────────────────────
  async function saveTaxRate(e) {
    e.preventDefault()
    setSaving((s) => ({ ...s, taxRate: true }))
    try {
      const payload = { ...taxRateForm, amount: Number(taxRateForm.amount || 0) }
      if (editingTaxRate) {
        await putWithAuth(`/taxrates/${editingTaxRate.id}`, payload, token)
        setSuccess('Tax rate updated.')
      } else {
        await postWithAuth('/taxrates', payload, token)
        setSuccess('Tax rate added.')
      }
      setTaxRateForm({ account: '', type: '', category: '', amount: '', description: '' })
      setEditingTaxRate(null)
      const res = await getWithAuth('/taxrates', token)
      setTaxRates(Array.isArray(res?.data) ? res.data : [])
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to save tax rate')
    }
    setSaving((s) => ({ ...s, taxRate: false }))
  }

  async function deleteTaxRate(id) {
    if (!window.confirm('Delete this tax rate?')) return
    try {
      await deleteWithAuth(`/taxrates/${id}`, token)
      setTaxRates((prev) => prev.filter((r) => r.id !== id))
      setSuccess('Tax rate deleted.')
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to delete tax rate')
    }
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  async function sendTestEmail() {
    if (!testEmailAddr.trim()) { setError('Enter a recipient email address.'); return }
    setSendingTest(true)
    try {
      // await postWithAuth('/email/test', { to: testEmailAddr.trim() }, token)
      setSuccess(`Test email functionality disabled for now.`)
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to send test email')
    }
    setSendingTest(false)
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  async function doExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ date_from: exportForm.date_from, date_to: exportForm.date_to })
      let endpoint = '/reports/summary'
      if (exportForm.type === 'bookings') endpoint = '/bookings'
      if (exportForm.type === 'payments') endpoint = '/reports/revenue'
      if (exportForm.type === 'guests') endpoint = '/guests'

      const res = await getWithAuth(`${endpoint}?${params}`, token)
      const data = exportForm.type === 'bookings'
        ? (res?.data?.items || [])
        : exportForm.type === 'guests'
          ? (Array.isArray(res?.data) ? res.data : res?.data?.items || [])
          : (Array.isArray(res?.data) ? res.data : [res?.data].filter(Boolean))

      if (!data.length) { setError('No data found for the selected range.'); setExporting(false); return }

      const headers = Object.keys(data[0])
      const csv = [
        headers.join(','),
        ...data.map((row) => headers.map((h) => {
          const val = row[h] == null ? '' : String(row[h]).replace(/"/g, '""')
          return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val
        }).join(','))
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${exportForm.type}_${exportForm.date_from}_${exportForm.date_to}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setSuccess(`Exported ${data.length} records as CSV.`)
    } catch (e) {
      setError(e?.response?.data?.error || 'Export failed')
    }
    setExporting(false)
  }

  return (
    <section className="ota-settings-page">
      <div className="ota-settings-header">
        <h3>Settings</h3>
        <p>Manage profile, system defaults, and active hotel configuration.</p>
      </div>

      <div className="ota-settings-layout">
        <nav className="ota-settings-sidebar">
          <button className={`ota-sidebar-link ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}><i className="fa-solid fa-user"></i> My Profile</button>
          <button className={`ota-sidebar-link ${tab === 'system' ? 'active' : ''}`} onClick={() => setTab('system')}><i className="fa-solid fa-sliders"></i> System Settings</button>
          <button className={`ota-sidebar-link ${tab === 'offer' ? 'active' : ''}`} onClick={() => setTab('offer')}><i className="fa-solid fa-tags"></i> Offer Settings</button>
          <button className={`ota-sidebar-link ${tab === 'pricing' ? 'active' : ''}`} onClick={() => setTab('pricing')}><i className="fa-solid fa-chart-line"></i> Pricing Strategy</button>
          <button className={`ota-sidebar-link ${tab === 'hotel' ? 'active' : ''}`} onClick={() => setTab('hotel')}><i className="fa-solid fa-hotel"></i> Hotel Settings</button>
          <button className={`ota-sidebar-link ${tab === 'taxrates' ? 'active' : ''}`} onClick={() => setTab('taxrates')}><i className="fa-solid fa-file-invoice-dollar"></i> Tax Rates</button>
          <button className={`ota-sidebar-link ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}><i className="fa-solid fa-list-check"></i> Rules</button>
          <button className={`ota-sidebar-link ${tab === 'roomsettings' ? 'active' : ''}`} onClick={() => setTab('roomsettings')}><i className="fa-solid fa-bed"></i> Room Settings</button>
          <button className={`ota-sidebar-link ${tab === 'publicurl' ? 'active' : ''}`} onClick={() => setTab('publicurl')}><i className="fa-solid fa-link"></i> Public URL</button>
        </nav>
        <div className="ota-settings-content">
          {loading ? <div className="ota-settings-card">Loading settings...</div> : null}

          {tab === 'profile' ? (
            <>
              <div className="ota-settings-card">
                <h4 style={{ marginTop: 0 }}>Profile Details</h4>
                <div className="ota-form-grid">
                  <div className="ota-form-group"><label>Username</label><input className="ota-form-control" value={profile.username || ''} readOnly /></div>
                  <div className="ota-form-group"><label>Name</label><input className="ota-form-control" value={profile.name || ''} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} /></div>
                  <div className="ota-form-group"><label>Email</label><input className="ota-form-control" value={profile.email || ''} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} /></div>
                  <div className="ota-form-group"><label>Phone</label><input className="ota-form-control" value={profile.phone || ''} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} /></div>
                </div>
                <div className="ota-actions" style={{ marginTop: 10 }}>
                  <button className="ota-btn ota-btn-primary" disabled={saving.profile} onClick={saveProfile}>{saving.profile ? 'Saving...' : 'Save Profile'}</button>
                </div>
              </div>

              <div className="ota-settings-card">
                <h4 style={{ marginTop: 0 }}>Change Password</h4>
                <div className="ota-form-grid">
                  <div className="ota-form-group"><label>Current Password</label>
                    <div className="pwd-wrapper">
                      <input className="ota-form-control" type={showPwd.current ? 'text' : 'password'} value={password.current_password} onChange={(e) => setPassword((p) => ({ ...p, current_password: e.target.value }))} />
                      <span onClick={() => setShowPwd((p) => ({ ...p, current: !p.current }))} style={{ padding: '0 10px', cursor: 'pointer', color: '#6b7280', fontSize: 14 }}>
                        <i className={`fa ${showPwd.current ? 'fa-eye-slash' : 'fa-eye'}`} />
                      </span>
                    </div>
                  </div>
                  <div className="ota-form-group"><label>New Password</label>
                    <div className="pwd-wrapper">
                      <input className="ota-form-control" type={showPwd.new ? 'text' : 'password'} value={password.new_password} onChange={(e) => setPassword((p) => ({ ...p, new_password: e.target.value }))} />
                      <span onClick={() => setShowPwd((p) => ({ ...p, new: !p.new }))} style={{ padding: '0 10px', cursor: 'pointer', color: '#6b7280', fontSize: 14 }}>
                        <i className={`fa ${showPwd.new ? 'fa-eye-slash' : 'fa-eye'}`} />
                      </span>
                    </div>
                  </div>
                  <div className="ota-form-group"><label>Confirm New Password</label>
                    <div className="pwd-wrapper">
                      <input className="ota-form-control" type={showPwd.confirm ? 'text' : 'password'} value={password.confirm} onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))} />
                      <span onClick={() => setShowPwd((p) => ({ ...p, confirm: !p.confirm }))} style={{ padding: '0 10px', cursor: 'pointer', color: '#6b7280', fontSize: 14 }}>
                        <i className={`fa ${showPwd.confirm ? 'fa-eye-slash' : 'fa-eye'}`} />
                      </span>
                    </div>
                  </div>
                </div>
                <div className="ota-actions" style={{ marginTop: 10 }}>
                  <button className="ota-btn ota-btn-warning" disabled={saving.password} onClick={savePassword}>{saving.password ? 'Updating...' : 'Change Password'}</button>
                </div>
              </div>
            </>
          ) : null}

          {tab === 'system' ? (
            <div className="ota-settings-card">
              <h4 style={{ marginTop: 0 }}>System Defaults</h4>
              <div className="ota-form-grid">
                <div className="ota-form-group"><label>Invoice Prefix</label><input className="ota-form-control" value={system.invoice_prefix || ''} onChange={(e) => setSystem((p) => ({ ...p, invoice_prefix: e.target.value }))} /></div>
                <div className="ota-form-group"><label>Company / Chain Name</label><input className="ota-form-control" value={system.company_name || ''} onChange={(e) => setSystem((p) => ({ ...p, company_name: e.target.value }))} /></div>
                <div className="ota-form-group"><label>Currency</label><input className="ota-form-control" value={system.currency || ''} onChange={(e) => setSystem((p) => ({ ...p, currency: e.target.value }))} /></div>
                <div className="ota-form-group"><label>Date Format</label>
                  <select
                    className="ota-form-control"
                    value={system.date_format || ''}
                    onChange={e => setSystem((p) => ({ ...p, date_format: e.target.value }))}
                  >
                    <option value="DD-MM-YYYY">DD-MM-YYYY (e.g. 31-12-2026)</option>
                    <option value="MM-DD-YYYY">MM-DD-YYYY (e.g. 12-31-2026)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-12-31)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 31/12/2026)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 12/31/2026)</option>
                    <option value="YYYY/MM/DD">YYYY/MM/DD (e.g. 2026/12/31)</option>
                  </select>
                </div>
                <div className="ota-form-group"><label>Time Zone</label>
                  <select className="ota-form-control" value={system.time_zone || 'Asia/Kolkata'} onChange={(e) => setSystem((p) => ({ ...p, time_zone: e.target.value }))}>
                    <optgroup label="Asia">
                      <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT, UTC+8)</option>
                      <option value="Asia/Bangkok">Asia/Bangkok (ICT, UTC+7)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST, UTC+9)</option>
                      <option value="Asia/Shanghai">Asia/Shanghai (CST, UTC+8)</option>
                      <option value="Asia/Karachi">Asia/Karachi (PKT, UTC+5)</option>
                      <option value="Asia/Dhaka">Asia/Dhaka (BST, UTC+6)</option>
                      <option value="Asia/Colombo">Asia/Colombo (SLST, UTC+5:30)</option>
                      <option value="Asia/Kathmandu">Asia/Kathmandu (NPT, UTC+5:45)</option>
                      <option value="Asia/Riyadh">Asia/Riyadh (AST, UTC+3)</option>
                      <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (MYT, UTC+8)</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="Europe/London">Europe/London (GMT/BST, UTC+0/+1)</option>
                      <option value="Europe/Paris">Europe/Paris (CET, UTC+1)</option>
                      <option value="Europe/Berlin">Europe/Berlin (CET, UTC+1)</option>
                      <option value="Europe/Moscow">Europe/Moscow (MSK, UTC+3)</option>
                    </optgroup>
                    <optgroup label="Americas">
                      <option value="America/New_York">America/New_York (EST, UTC-5)</option>
                      <option value="America/Chicago">America/Chicago (CST, UTC-6)</option>
                      <option value="America/Denver">America/Denver (MST, UTC-7)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST, UTC-8)</option>
                      <option value="America/Sao_Paulo">America/Sao_Paulo (BRT, UTC-3)</option>
                    </optgroup>
                    <optgroup label="Africa">
                      <option value="Africa/Cairo">Africa/Cairo (EET, UTC+2)</option>
                      <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                      <option value="Africa/Lagos">Africa/Lagos (WAT, UTC+1)</option>
                    </optgroup>
                    <optgroup label="Pacific / Australia">
                      <option value="Australia/Sydney">Australia/Sydney (AEST, UTC+10)</option>
                      <option value="Pacific/Auckland">Pacific/Auckland (NZST, UTC+12)</option>
                    </optgroup>
                    <optgroup label="UTC">
                      <option value="UTC">UTC (UTC+0)</option>
                    </optgroup>
                  </select>
                  <small className="text-muted">Used for checkout time calculations and invoice timestamps.</small>
                </div>
              </div>
              <div className="ota-actions" style={{ marginTop: 10 }}>
                <button className="ota-btn ota-btn-primary" disabled={saving.system} onClick={saveSystem}>{saving.system ? 'Saving...' : 'Save System Settings'}</button>
              </div>

            </div>
          ) : null}

          {tab === 'offer' ? (
            <div className="ota-settings-card">
              <h4 style={{ marginTop: 0 }}>Offer Settings</h4>
              <div className="text-muted" style={{ marginBottom: 10 }}>
                Configure default offer once and use it directly in Booking Create from the offer dropdown.
              </div>
              <div className="ota-form-grid">
                <div className="ota-form-group"><label>Enable Default Offer</label>
                  <div className="ota-form-group"><label>
                    <input
                      type="checkbox"
                      checked={!!system.default_offer_enabled}
                      onChange={(e) => setSystem((p) => ({ ...p, default_offer_enabled: e.target.checked }))}
                      style={{ marginRight: 8 }}
                    />
                    Enable default offer in Booking Create
                  </label>
                  </div>
                </div>
                <div className="ota-form-group"><label>Default Offer Name</label><input className="ota-form-control" value={system.default_offer_name || ''} onChange={(e) => setSystem((p) => ({ ...p, default_offer_name: e.target.value }))} /></div>
                <div className="ota-form-group"><label>Default Offer (%)</label><input className="ota-form-control" type="number" min="0" max="100" step="0.01" value={system.default_offer_percent || 0} onChange={(e) => setSystem((p) => ({ ...p, default_offer_percent: Number(e.target.value) }))} /></div>
              </div>
              <div className="ota-actions" style={{ marginTop: 10 }}>
                <button className="ota-btn ota-btn-primary" disabled={saving.offer} onClick={saveOffer}>{saving.offer ? 'Saving...' : 'Save Offer Settings'}</button>
              </div>
            </div>
          ) : null}

          {tab === 'pricing' ? (
            <div className="ops-panel ops-pricing-panel">
              <div className="ops-pricing-head">
                <div>
                  <h4 style={{ marginTop: 0, marginBottom: 4 }}>Room Type Pricing Strategy</h4>
                  <div className="text-muted">
                    Configure time-bound room-type adjustments. Use plus (+) for uplift and minus (-) for discount.
                  </div>
                </div>
                <div className="ops-pricing-badges">
                  <span className="ops-pill">Types: {pricingRows.length}</span>
                  <span className="ops-pill">Active Rules: {pricingRows.filter((r) => Number(r.current_adjustment_percent || 0) !== 0).length}</span>
                </div>
              </div>

              <div className="ops-pricing-form-block">
                <div className="ota-form-grid">
                  <div className="ota-form-group"><label>Occasion</label><input className="ota-form-control" value={pricingMeta.occasion} onChange={(e) => setPricingMeta((p) => ({ ...p, occasion: e.target.value }))} placeholder="Durga Puja" /></div>
                  <div className="ota-form-group"><label>Reason</label><input className="ota-form-control" value={pricingMeta.reason} onChange={(e) => setPricingMeta((p) => ({ ...p, reason: e.target.value }))} placeholder="High seasonal demand" /></div>
                  <div className="ota-form-group"><label>Valid From</label><input className="ota-form-control" type="date" value={pricingMeta.valid_from} onChange={(e) => setPricingMeta((p) => ({ ...p, valid_from: e.target.value }))} /></div>
                  <div className="ota-form-group"><label>Valid To</label><input className="ota-form-control" type="date" value={pricingMeta.valid_to} onChange={(e) => setPricingMeta((p) => ({ ...p, valid_to: e.target.value }))} /></div>
                </div>
              </div>

              <div className="table-responsive ops-pricing-table-wrap" style={{ marginTop: 10 }}>
                <table className="table table-bordered table-striped ops-pricing-table">
                  <thead>
                    <tr>
                      <th>Room Type</th>
                      <th>Rooms</th>
                      <th>Current Avg Base Price</th>
                      <th>Current Active Rule</th>
                      <th>Adjustment</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingRows.length === 0 ? (
                      <tr><td colSpan={6} className="text-center">No room types found</td></tr>
                    ) : pricingRows.map((row, idx) => (
                      <tr key={typeof row.room_type === 'object' ? row.room_type?.name : (row.room_type || idx)}>
                        <td>{typeof row.room_type === 'object' ? (row.room_type?.name || '-') : (row.room_type || '-')}</td>
                        <td>{row.count}</td>
                        <td>₹ {Number(row.avg_price || 0).toFixed(2)}</td>
                        <td>{getCurrentRuleLabel(row)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 280 }}>
                            <div className="input-group" style={{ flex: 1 }}>
                              <span className="input-group-addon">{row.adjustment_mode === 'price' ? '₹' : '%'}</span>
                              <input
                                className="ota-form-control"
                                type="text"
                                value={row.percentage}
                                placeholder={row.adjustment_mode === 'price' ? 'e.g. 2400 or +200 or -150' : 'e.g. +2 or -5'}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  const value = raw
                                    .replace(/[^0-9+.-]/g, '')
                                    .replace(/(?!^)[+-]/g, '')
                                    .replace(/(\..*)\./g, '$1')
                                  setPricingRows((prev) => prev.map((x, i) => (i === idx ? { ...x, percentage: value } : x)))
                                }}
                              />
                            </div>
                            <select
                              className="ota-form-control"
                              style={{ width: 70 }}
                              value={row.adjustment_mode || 'percent'}
                              onChange={(e) => {
                                const mode = e.target.value === 'price' ? 'price' : 'percent'
                                setPricingRows((prev) => prev.map((x, i) => (i === idx ? { ...x, adjustment_mode: mode, percentage: '' } : x)))
                              }}
                            >
                              <option value="percent">%</option>
                              <option value="price">₹</option>
                            </select>
                          </div>
                        </td>
                        <td>
                          <div className="ops-row-actions">
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              disabled={saving.pricing}
                              onClick={() => applySinglePricingRule(row)}
                            >
                              {saving.pricing ? 'Applying...' : 'Apply'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-default btn-sm"
                              disabled={saving.pricing}
                              onClick={() => resetSinglePricingRow(row)}
                              title="Reset active rule"
                            >
                              {saving.pricing ? 'Resetting...' : 'Reset Rule'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ota-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="ota-btn ota-btn-outline"
                  style={{ marginRight: 8 }}
                  onClick={() => setPricingRows((prev) => prev.map((x) => ({ ...x, percentage: '' })))}
                >
                  Clear Draft Inputs
                </button>
                <button
                  type="button"
                  className="ota-btn ota-btn-danger"
                  style={{ marginRight: 8 }}
                  disabled={saving.pricing}
                  onClick={removeAllActivePricingRules}
                >
                  {saving.pricing ? 'Removing...' : 'Remove All Active Rules'}
                </button>
                <button className="ota-btn ota-btn-primary" disabled={saving.pricing} onClick={applyRoomTypePricing}>{saving.pricing ? 'Applying...' : 'Apply Type-wise Adjustment'}</button>
              </div>
            </div>
          ) : null}

          {tab === 'hotel' ? (
            <div className="ota-settings-card">
              <h4 style={{ marginTop: 0 }}>Active Hotel Settings</h4>
              <div className="text-muted" style={{ marginBottom: 12 }}>Configure your hotel information and tax settings for multinational operations.</div>

              <h5 style={{ marginTop: 12, marginBottom: 8 }}>Basic Information</h5>
              <div className="ota-form-grid">
                <div className="ota-form-group"><label>Hotel Name</label><input className="ota-form-control" value={hotel.name || ''} onChange={(e) => setHotel((p) => ({ ...p, name: e.target.value }))} /></div>
                <div className="ota-form-group"><label>Email</label><input className="ota-form-control" value={hotel.email || ''} onChange={(e) => setHotel((p) => ({ ...p, email: e.target.value }))} /></div>
                <div className="ota-form-group"><label>Phone</label><input className="ota-form-control" value={hotel.phone || ''} onChange={(e) => setHotel((p) => ({ ...p, phone: e.target.value }))} /></div>
                <div className="ota-form-group"><label>GST/Tax Number</label><input className="ota-form-control" value={hotel.gst_number || ''} onChange={(e) => setHotel((p) => ({ ...p, gst_number: e.target.value }))} /></div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={hotel.feature_channel_manager !== false}
                    onChange={(e) => setHotel((p) => ({ ...p, feature_channel_manager: e.target.checked }))}
                  />
                  <span>Allow Channel Manager Access</span>
                </label>
                <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>
                  If disabled, users of this hotel cannot open the Channel Manager module.
                </small>
              </div>

              <h5 style={{ marginTop: 12, marginBottom: 8 }}>Address</h5>
              <div className="ota-form-grid">
                <div className="ota-form-group"><label>Address Line 1</label><input className="ota-form-control" value={hotel.address1 || ''} onChange={(e) => setHotel((p) => ({ ...p, address1: e.target.value }))} /></div>
                <div className="ota-form-group"><label>Address Line 2</label><input className="ota-form-control" value={hotel.address2 || ''} onChange={(e) => setHotel((p) => ({ ...p, address2: e.target.value }))} /></div>
                <div className="ota-form-group"><label>City</label><input className="ota-form-control" value={hotel.city || ''} onChange={(e) => setHotel((p) => ({ ...p, city: e.target.value }))} /></div>
                <div className="ota-form-group"><label>State</label><input className="ota-form-control" value={hotel.state || ''} onChange={(e) => setHotel((p) => ({ ...p, state: e.target.value }))} /></div>
              </div>
              <div className="ota-form-grid">
                <div className="ota-form-group"><label>Country</label><input className="ota-form-control" value={hotel.country || ''} onChange={(e) => setHotel((p) => ({ ...p, country: e.target.value }))} /></div>
                <div className="ota-form-group"><label>Pincode / Postal Code</label><input className="ota-form-control" value={hotel.pincode || ''} onChange={(e) => setHotel((p) => ({ ...p, pincode: e.target.value }))} /></div>
              </div>

              <div className="ota-actions" style={{ marginTop: 10 }}>
                <button className="ota-btn ota-btn-primary" disabled={saving.hotel} onClick={saveHotel}>{saving.hotel ? 'Saving...' : 'Save Hotel Settings'}</button>
              </div>
            </div>
          ) : null}

          {/* ── Tax Rates ── */}
          {tab === 'taxrates' ? (
            <div className="ota-settings-card">
              <h4 style={{ marginTop: 0 }}>Tax Configuration</h4>
              <p className="text-muted">Select your hotel tax system and rate. This applies to all bookings and invoices.</p>
              <div className="ota-form-grid">
                <div className="ota-form-group"><label>Tax Type*</label>
                  <select
                    className="ota-form-control"
                    value={hotel.tax_type || 'GST'}
                    onChange={(e) => setHotel((p) => ({ ...p, tax_type: e.target.value, tax_name: e.target.value !== 'Other' ? '' : p.tax_name }))}
                  >
                    <option value="GST">GST (Good &amp; Services Tax)</option>
                    <option value="VAT">VAT (Value Added Tax)</option>
                    <option value="TVA">TVA (Taxe sur la Valeur Ajoutée)</option>
                    <option value="Sales Tax">Sales Tax</option>
                    <option value="Service Tax">Service Tax</option>
                    <option value="IVA">IVA (Impuesto sobre el Valor Añadido)</option>
                    <option value="Other">Other</option>
                  </select>
                  {hotel.tax_type === 'Other' && (
                    <div style={{ marginTop: 8 }}>
                      <label>Custom Tax Name*</label>
                      <input className="ota-form-control" type="text" value={hotel.tax_name || ''} onChange={(e) => setHotel((p) => ({ ...p, tax_name: e.target.value }))} placeholder="e.g. City Tax" maxLength={40} />
                      <small className="text-muted">Appears on invoices.</small>
                    </div>
                  )}
                </div>
                <div className="ota-form-group"><label>Tax Rate (%)*</label>
                  <input className="ota-form-control" type="number" min="0" max="100" step="0.01" value={hotel.tax_percent ?? 0} onChange={(e) => setHotel((p) => ({ ...p, tax_percent: e.target.value === '' ? 0 : Number(e.target.value) }))} />
                  {hotel.tax_type === 'GST' && Number(hotel.tax_percent) > 0 && (
                    <small className="text-muted">CGST {(Number(hotel.tax_percent) / 2).toFixed(2)}% + SGST {(Number(hotel.tax_percent) / 2).toFixed(2)}%</small>
                  )}
                </div>
              </div>
              <div className="ota-actions" style={{ marginTop: 8, marginBottom: 20 }}>
                <button className="ota-btn ota-btn-primary" disabled={saving.hotel} onClick={saveHotel}>{saving.hotel ? 'Saving...' : 'Save Tax Configuration'}</button>
              </div>

            </div>
          ) : null}

          {/* ── Notifications ── */}
          {/* Notifications and Export tabs - backend ready, UI pending */}

          {/* ── Rules ── */}
          {tab === 'rules' ? (
            <div className="ota-settings-card">
              <h4 style={{ marginTop: 0 }}>Occupancy &amp; Checkout Rules</h4>
              <p className="text-muted">Define guest occupancy limits, extra guest charges, and late checkout policies.</p>

              <h5 style={{ marginTop: 16, marginBottom: 8 }}>Occupancy</h5>
              <div className="ota-form-grid">
                <div className="ota-form-group"><label>Included Guests (Base Occupancy)</label>
                  <input className="ota-form-control" type="number" min="1" max="10" step="1" value={system.included_guests || 1} onChange={(e) => setSystem((p) => ({ ...p, included_guests: Number(e.target.value) }))} />
                  <small className="text-muted">Number of guests included in the base room rate.</small>
                </div>
                <div className="ota-form-group"><label>Extra Guest Charge / Night (₹)</label>
                  <input className="ota-form-control" type="number" min="0" step="0.01" value={system.extra_guest_charge_per_night || 0} onChange={(e) => setSystem((p) => ({ ...p, extra_guest_charge_per_night: Number(e.target.value) }))} />
                  <small className="text-muted">Charge per additional guest per night beyond the base occupancy.</small>
                </div>
              </div>

              <h5 style={{ marginTop: 20, marginBottom: 8 }}>Checkout Policy</h5>
              <div className="ota-form-grid">
                <div className="ota-form-group"><label>Standard Checkout Time</label>
                  <input className="ota-form-control" type="time" value={system.checkout_time || '11:00'} onChange={(e) => setSystem((p) => ({ ...p, checkout_time: e.target.value }))} />
                </div>
                <div className="ota-form-group"><label>Standard Check-in Time</label>
                  <input className="ota-form-control" type="time" value={system.checkin_time || '14:00'} onChange={(e) => setSystem((p) => ({ ...p, checkin_time: e.target.value }))} />
                  <small className="text-muted">Guests may check in starting this time (local hotel timezone).</small>
                </div>
                <div className="ota-form-group"><label>Late Checkout Grace (Minutes)</label>
                  <input className="ota-form-control" type="number" min="0" max="720" step="1" value={system.late_checkout_grace_minutes ?? 30} onChange={(e) => setSystem((p) => ({ ...p, late_checkout_grace_minutes: Number(e.target.value) }))} />
                  <small className="text-muted">Guests can stay this many minutes after the standard checkout time before the late charge starts.</small>
                </div>
                <div className="ota-form-group"><label>Late Checkout Charge / Hour (₹)</label>
                  <input className="ota-form-control" type="number" min="0" step="0.01" value={system.late_checkout_hourly_charge ?? 0} onChange={(e) => setSystem((p) => ({ ...p, late_checkout_hourly_charge: Number(e.target.value) }))} />
                  <small className="text-muted">This amount is charged for each hour beyond the grace period.</small>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label><input type="checkbox" checked={!!system.allow_late_checkout} onChange={(e) => setSystem((p) => ({ ...p, allow_late_checkout: e.target.checked }))} style={{ marginRight: 6 }} />Allow Late Checkout</label>
                <small className="text-muted" style={{ marginLeft: 8 }}>If unchecked, guests will not be allowed to check out after the grace period.</small>
              </div>
              <div className="ota-actions" style={{ marginTop: 14 }}>
                <button className="ota-btn ota-btn-primary" disabled={saving.system} onClick={saveSystem}>{saving.system ? 'Saving...' : 'Save Rules'}</button>
              </div>
            </div>
          ) : null}

          {/* ── Room Settings ── */}
          {tab === 'roomsettings' ? (
            <div className="ota-settings-card">
              <h4 style={{ marginTop: 0 }}>Room Settings</h4>
              <h5 style={{ marginBottom: 4 }}>Room-type Per-head Occupancy Pricing</h5>
              <p className="text-muted">Set type-wise included guests and extra guest charge per night. Unchecked room types use system defaults.</p>
              <div className="ota-alert ota-alert-info" style={{ padding: '8px 12px', fontSize: 13 }}>
                Default policy: Included <strong>{Math.max(1, Number(roomOccupancyDefaults.included_guests || 1))}</strong> guest(s) &nbsp;|&nbsp; Extra charge <strong>₹{Number(roomOccupancyDefaults.extra_guest_charge_per_night || 0).toFixed(2)}</strong> / guest / night
              </div>
              <div className="table-responsive">
                <table className="table table-bordered table-striped">
                  <thead>
                    <tr>
                      <th>Room Type</th>
                      <th>Rooms</th>
                      <th>Use Override</th>
                      <th>Included Guests</th>
                      <th>Extra Guest Charge / Night</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomTypeOccupancyRows.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-muted">No room types found</td></tr>
                    ) : roomTypeOccupancyRows.map((row, idx) => (
                      <tr key={typeof row.room_type === 'object' ? row.room_type?.name : (row.room_type || idx)}>
                        <td>
                          {(typeof row.room_type === 'object' ? row.room_type?.name : row.room_type) || '-'}
                          {row.mixed_overrides ? <div className="text-warning" style={{ fontSize: 12 }}>Mixed overrides detected - saving will normalize this type.</div> : null}
                        </td>
                        <td>{row.rooms_count}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={!!row.override_enabled} onChange={(e) => {
                            const checked = e.target.checked
                            setRoomTypeOccupancyRows((prev) => prev.map((x, i) => {
                              if (i !== idx) return x
                              return {
                                ...x,
                                override_enabled: checked,
                                mixed_overrides: false,
                                included_guests_override: checked ? (x.included_guests_override === '' ? String(roomOccupancyDefaults.included_guests || 1) : x.included_guests_override) : '',
                                extra_guest_charge_per_night_override: checked ? (x.extra_guest_charge_per_night_override === '' ? String(roomOccupancyDefaults.extra_guest_charge_per_night || 0) : x.extra_guest_charge_per_night_override) : '',
                              }
                            }))
                          }} />
                        </td>
                        <td>
                          <input className="ota-form-control" type="number" min="1" max="10" step="1" disabled={!row.override_enabled} value={row.included_guests_override}
                            onChange={(e) => { const v = e.target.value; setRoomTypeOccupancyRows((prev) => prev.map((x, i) => i === idx ? { ...x, included_guests_override: v, mixed_overrides: false } : x)) }} />
                        </td>
                        <td>
                          <input className="ota-form-control" type="number" min="0" step="0.01" disabled={!row.override_enabled} value={row.extra_guest_charge_per_night_override}
                            onChange={(e) => { const v = e.target.value; setRoomTypeOccupancyRows((prev) => prev.map((x, i) => i === idx ? { ...x, extra_guest_charge_per_night_override: v, mixed_overrides: false } : x)) }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ota-actions" style={{ marginTop: 10 }}>
                <button className="ota-btn ota-btn-primary" disabled={saving.roomOccupancy} onClick={saveRoomOccupancyPricing}>{saving.roomOccupancy ? 'Saving...' : 'Save Room Settings'}</button>
              </div>
            </div>
          ) : null}

          {tab === 'publicurl' ? (
            <div className="ota-settings-card">
              <h4 style={{ marginTop: 0 }}>Public Booking URL</h4>
              <p className="text-muted">Share your public booking link on WhatsApp, social media, and marketing campaigns.</p>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!publicUrl.enabled}
                    onChange={(e) => setPublicUrl((p) => ({ ...p, enabled: e.target.checked }))}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontWeight: 500 }}>Enable public booking URL</span>
                </label>
              </div>

              <div className="ops-public-url-card" style={{ marginBottom: 20 }}>
                <div className="ops-public-url-head">
                  <div>
                    <strong>Your Public Booking URL</strong>
                    <div className="text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                      {publicUrl.enabled ? 'Active - Share this link with customers' : 'Disabled - URL is not active'}
                    </div>
                  </div>
                  <span className={"ops-public-url-status " + (publicUrl.enabled ? "is-live" : "is-paused")}>
                    {publicUrl.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="ops-public-url-preview" style={{ filter: publicUrl.enabled ? 'none' : 'blur(2px)', opacity: publicUrl.enabled ? 1 : 0.5, pointerEvents: publicUrl.enabled ? 'auto' : 'none' }}>
                  {publicUrl.enabled ? generatedPublicUrl : 'URL is currently disabled'}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label>Website Base URL (from .env)</label>
                <input
                  className="ota-form-control"
                  value={publicUrl.base_url}
                  readOnly
                  style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                />
                <small className="text-muted">Set in .env file as VITE_PUBLIC_WEBSITE_URL</small>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label>Campaign Tag (Optional)</label>
                <input
                  className="ota-form-control"
                  value={publicUrl.campaign_tag}
                  onChange={(e) => setPublicUrl((p) => ({ ...p, campaign_tag: e.target.value }))}
                  placeholder="e.g., summer-sale, whatsapp"
                  disabled={!publicUrl.enabled}
                />
                <small className="text-muted">Track where bookings come from</small>
              </div>

              {/* ── Advance Payment Deposit Requirement (%) ── */}
              <div style={{ marginTop: 24, padding: 18, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 20 }}>
                <h5 style={{ marginTop: 0, marginBottom: 6, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-percent" style={{ color: '#0284c7' }} /> Online Booking Advance Deposit Requirement (%)
                </h5>
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Set the advance payment percentage guests must pay online when booking rooms via your public booking URL.
                </p>

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {[
                    { label: '0% (Pay at Hotel)', val: 0 },
                    { label: '25% Deposit', val: 25 },
                    { label: '50% Half Advance', val: 50 },
                    { label: '100% Full Payment', val: 100 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => setPublicUrl((p) => ({ ...p, advance_payment_percent: preset.val }))}
                      className={`ota-btn ota-btn-sm ${Number(publicUrl.advance_payment_percent) === preset.val ? 'ota-btn-primary' : 'ota-btn-outline'}`}
                      style={{ borderRadius: 6 }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="ota-form-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                  <div className="ota-form-group">
                    <label>Advance Deposit (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="ota-form-control"
                      value={publicUrl.advance_payment_percent ?? 0}
                      onChange={(e) => setPublicUrl((p) => ({ ...p, advance_payment_percent: Math.min(100, Math.max(0, Number(e.target.value))) }))}
                      disabled={!publicUrl.enabled}
                    />
                  </div>
                  <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 2 }}>
                      <i className="fa-solid fa-calculator" style={{ marginRight: 6, color: '#0284c7' }} /> Example Breakdown (₹5,000 Booking):
                    </div>
                    <div style={{ fontSize: 12.5, color: '#0f172a' }}>
                      Guest pays <strong style={{ color: '#00875A' }}>₹{(5000 * (publicUrl.advance_payment_percent || 0) / 100).toFixed(0)}</strong> ({publicUrl.advance_payment_percent || 0}%) online today, and <strong>₹{(5000 * (1 - (publicUrl.advance_payment_percent || 0) / 100)).toFixed(0)}</strong> at check-in.
                    </div>
                  </div>
                </div>
              </div>

              <div className="ota-actions">
                <button className="ota-btn ota-btn-primary" disabled={saving.publicUrl} onClick={savePublicUrlSettings}>
                  {saving.publicUrl ? 'Saving...' : 'Save Settings'}
                </button>
                <button className="ota-btn ota-btn-outline" type="button" onClick={copyPublicUrl} disabled={!publicUrl.enabled}>
                  Copy URL
                </button>
                <button className="ota-btn ota-btn-outline" type="button" onClick={openPublicUrl} disabled={!publicUrl.enabled}>
                  Preview
                </button>
                <button className="ota-btn ota-btn-warning" type="button" onClick={regeneratePublicUrl} disabled={!publicUrl.enabled}>
                  🔄 Regenerate URL
                </button>
              </div>
              <div className="ota-alert ota-alert-info" style={{ marginTop: 10 }}>
                <strong>Security Tip:</strong> Click "Regenerate URL" to create a new unique link. The old URL will immediately stop working. Use this if you shared the link with the wrong person or want to revoke access.
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </section>
  )
}
