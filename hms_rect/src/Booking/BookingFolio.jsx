import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { getWithAuth, patchWithAuth, postWithAuth } from '../api'
import { domain } from '../Functions/domain'
import { resolveAssetUrl } from '../Functions/assetUrl'
import { getGuestSession, guestAuthHeader } from '../Public/guestSession'
import toast from 'react-hot-toast'
import './BookingFolioModern.css'

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || ''

// Gateway icon + label helpers used in multiple places
function gatewayIcon(method) {
  switch ((method || '').toLowerCase()) {
    case 'razorpay': return { icon: 'fa-solid fa-bolt', color: '#2563eb', label: 'Razorpay' }
    case 'phonepe': return { icon: 'fa-solid fa-mobile-screen-button', color: '#7c3aed', label: 'PhonePe' }
    case 'upi': return { icon: 'fa-solid fa-mobile-screen-button', color: '#16a34a', label: 'UPI' }
    case 'card': return { icon: 'fa-solid fa-credit-card', color: '#0284c7', label: 'Card (POS)' }
    case 'bank_transfer': return { icon: 'fa-solid fa-building-columns', color: '#0891b2', label: 'Bank Transfer' }
    case 'cheque': return { icon: 'fa-solid fa-money-check', color: '#d97706', label: 'Cheque' }
    case 'cash':
    default: return { icon: 'fa-solid fa-money-bills', color: '#16a34a', label: 'Cash' }
  }
}

const PREDEFINED_SERVICES = [
  { name: 'Airport Taxi', unit_price: 1200, type: 'service' },
  { name: 'Breakfast Buffet', unit_price: 450, type: 'service' },
  { name: 'Laundry', unit_price: 300, type: 'service' },
  { name: 'Extra Mattress', unit_price: 900, type: 'extra' },
  { name: 'Late Checkout', unit_price: 500, type: 'late_checkout' },
  { name: 'Room Dining', unit_price: 350, type: 'service' },
]

const formatINR = (value) =>
  `₹ ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const formatDateHuman = (dateVal) => {
  if (!dateVal) return '-'
  try {
    let d
    if (typeof dateVal === 'number') {
      d = new Date(dateVal < 10000000000 ? dateVal * 1000 : dateVal)
    } else if (typeof dateVal === 'string' && /^\d+$/.test(dateVal.trim())) {
      const num = Number(dateVal.trim())
      d = new Date(num < 10000000000 ? num * 1000 : num)
    } else {
      d = new Date(dateVal)
    }
    if (isNaN(d.getTime())) return String(dateVal)
    return d.toLocaleDateString('en-GB')
  } catch {
    return String(dateVal)
  }
}

const formatTime12Hour = (time24) => {
  if (!time24 || typeof time24 !== 'string') return time24
  const parts = time24.split(':')
  if (parts.length < 2) return time24
  let hours = parseInt(parts[0], 10)
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${hours.toString().padStart(2, '0')}:${parts[1]} ${ampm}`
}

const parseCompanionDocumentMap = (raw) => {
  const text = String(raw || '').trim()
  if (!text) return {}

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed.reduce((acc, url, idx) => {
        const clean = String(url || '').trim()
        if (clean) acc[idx] = clean
        return acc
      }, {})
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).reduce((acc, [k, v]) => {
        const idx = Number(k)
        const clean = String(v || '').trim()
        if (Number.isInteger(idx) && idx >= 0 && clean) acc[idx] = clean
        return acc
      }, {})
    }
  } catch {
    // Fall back to comma-separated URLs
  }

  return text.split(',').reduce((acc, url, idx) => {
    const clean = String(url || '').trim()
    if (clean) acc[idx] = clean
    return acc
  }, {})
}

export default function BookingFolio() {
  const token = useSelector((s) => s.auth.accesstoken)
  const activeHotelId = useSelector((s) => s.auth.activeHotelId)
  const hotelFeatures = useSelector((s) => s.auth.hotelFeatures)
  const { id } = useParams()
  const navigate = useNavigate()

  const [booking, setBooking] = useState(null)
  const [bookingId, setBookingId] = useState(null)
  const [primaryGuest, setPrimaryGuest] = useState(null)
  const [hotelInfo, setHotelInfo] = useState(null)
  // Determine online payment status from either authenticated Redux store or public hotelInfo payload.
  const onlinePaymentEnabled = (hotelFeatures && hotelFeatures.online_payment) || (hotelInfo && hotelInfo.feature_online_payment) || false
  const [folioItems, setFolioItems] = useState([])
  const [payments, setPayments] = useState([])
  const [balance, setBalance] = useState(null)
  const [occupancyPricing, setOccupancyPricing] = useState({ includedGuests: 1, extraGuestPerNight: 500 })
  const [lateCheckoutSettings, setLateCheckoutSettings] = useState({ checkinTime: '14:00', checkoutTime: '11:00', graceMinutes: 30, hourlyCharge: 100 })
  const [loading, setLoading] = useState(true)
  const [showAddCharge, setShowAddCharge] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  const [itemForm, setItemForm] = useState({ description: '', amount: '', type: 'service', taxable: true })
  const [discountForm, setDiscountForm] = useState({ discount: '', discount_type: 'amount', reason: '' })
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'cash', reference: '', paid_on: new Date().toISOString().slice(0, 10) })

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      if (token) {
        // Authenticated PMS Staff Flow
        const bRes = await getWithAuth(`/bookings/${encodeURIComponent(id)}`, token)
        let rawData = bRes.data || null
        let bookingData = null
        let guestFromApi = null

        if (rawData && rawData.booking) {
          guestFromApi = rawData.guest || null
          const resolvedRoomType = typeof rawData.room_type === 'object'
            ? (rawData.room_type?.name || rawData.booking?.room_type || '')
            : (rawData.room_type || (typeof rawData.booking?.room_type === 'object' ? rawData.booking?.room_type?.name : rawData.booking?.room_type) || '')
          bookingData = {
            ...rawData.booking,
            room_number: rawData.room_number || rawData.booking?.room_number,
            room_type: resolvedRoomType,
            room_type_details: typeof rawData.room_type === 'object' ? rawData.room_type : rawData.booking?.room_type_details,
            guest_name: rawData.guest?.name || rawData.booking?.guest_name,
            guest_phone: rawData.guest?.phone,
            guest_email: rawData.guest?.email,
          }
        } else {
          bookingData = rawData ? { ...rawData } : null
          if (bookingData && typeof bookingData.room_type === 'object') {
            bookingData.room_type_details = bookingData.room_type
            bookingData.room_type = bookingData.room_type?.name || ''
          }
        }

        if (!bookingData || (!bookingData.id && !bookingData.booking_code)) {
          toast.error('Booking not found')
          navigate('/booking/all')
          return
        }

        const resolvedBookingId = bookingData.id || bookingData.booking_code
        setBookingId(resolvedBookingId)
        setBooking(bookingData)

        const [fRes, pRes, balRes] = await Promise.all([
          getWithAuth(`/folio/${resolvedBookingId}`, token),
          getWithAuth(`/payments/${resolvedBookingId}`, token),
          getWithAuth(`/folio/${resolvedBookingId}/balance`, token),
        ])
        setFolioItems(Array.isArray(fRes.data) ? fRes.data : [])
        setPayments(Array.isArray(pRes.data) ? pRes.data : [])
        setBalance(balRes.data || null)

        if (bookingData?.guest_id) {
          try {
            const gRes = await getWithAuth(`/guests/${bookingData.guest_id}`, token)
            setPrimaryGuest({
              ...(guestFromApi || {}),
              ...(gRes.data || {}),
            })
          } catch {
            setPrimaryGuest(guestFromApi || { name: bookingData.guest_name, phone: bookingData.guest_phone, email: bookingData.guest_email })
          }
        } else {
          setPrimaryGuest(guestFromApi || { name: bookingData.guest_name, phone: bookingData.guest_phone, email: bookingData.guest_email })
        }
      } else {
        // Guest voucher flow: booking details are only available to the signed-in owner.
        const guestSession = getGuestSession()
        if (!guestSession.token) {
          // /guest/login is disabled — redirect to booking portal (login modal handles auth)
          navigate('/book', { replace: true })
          return
        }
        const { default: api } = await import('../api')
        const pubRes = await api.get(`/api/public/bookings/${encodeURIComponent(id)}`, {
          headers: guestAuthHeader(guestSession.token),
        })
        const pubData = pubRes.data || null
        if (!pubData) {
          toast.error('Booking not found or invalid reference')
          return
        }

        setBookingId(pubData.id || pubData.booking_code || id)
        setBooking({
          ...pubData,
          id: pubData.id || pubData.booking_code,
          check_in_date: pubData.check_in,
          check_out_date: pubData.check_out,
          status: pubData.status,
          base_rate: pubData.base_rate,
          total_amount: pubData.total_amount,
          tax_rate: pubData.tax_rate || 18,
          tax: pubData.tax,
          discount: pubData.discount || 0,
        })
        setBalance({
          gross: pubData.total_amount || 0,
          tax: pubData.tax || 0,
          advance: pubData.advance || 0,
          payments_total: pubData.advance || 0,
          current_balance: Math.max(0, (pubData.total_amount || 0) - (pubData.advance || 0)),
        })
        setHotelInfo({
          name: pubData.hotel_name,
          address: pubData.hotel_address,
          phone: pubData.hotel_phone,
          email: pubData.hotel_email,
          logo: pubData.hotel_logo,
          gst_number: pubData.hotel_gst_number || '',
          payment_gateway: pubData.payment_gateway,
          razorpay_key_id: pubData.razorpay_key_id,
          phonepe_merchant_id: pubData.phonepe_merchant_id,
          feature_online_payment: pubData.feature_online_payment,
          advance_payment_percent: pubData.advance_payment_percent,
        })
        setPrimaryGuest({
          name: pubData.guest_name,
          phone: pubData.guest_phone,
          email: pubData.guest_email,
        })
        setFolioItems([])
        setPayments([])
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to load booking folio')
    } finally {
      setLoading(false)
    }
  }, [token, id, navigate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let mounted = true
    async function loadHotelSettings() {
      if (!token || !activeHotelId) return
      try {
        const [hotelRes, systemRes, occupancyRes] = await Promise.all([
          getWithAuth(`/hotels/${activeHotelId}`, token),
          getWithAuth('/settings/system', token),
          getWithAuth('/settings/room-occupancy', token),
        ])
        const h = hotelRes?.data || {}
        const s = systemRes?.data || {}

        const defaultIncluded = Math.max(1, Number(s.included_guests || 1))
        const defaultExtra = Math.max(0, Number(s.extra_guest_charge_per_night || 0))

        if (mounted) {
          setHotelInfo(h)

          const roomType = String(booking?.room_type || '').trim().toLowerCase()
          let includedGuests = defaultIncluded
          let extraGuestPerNight = defaultExtra

          if (roomType && Array.isArray(occupancyRes?.data?.items)) {
            const match = occupancyRes.data.items.find(
              (row) => String(row.room_type || '').trim().toLowerCase() === roomType,
            )
            if (match) {
              const effIncluded = Number(match.effective_included_guests)
              const effExtra = Number(match.effective_extra_guest_charge_per_night)
              if (match.override_enabled || effIncluded !== defaultIncluded || effExtra !== defaultExtra) {
                includedGuests = Math.max(1, effIncluded || defaultIncluded)
                extraGuestPerNight = Math.max(0, isFinite(effExtra) ? effExtra : defaultExtra)
              }
            }
          }

          setOccupancyPricing({ includedGuests, extraGuestPerNight })
          setLateCheckoutSettings({
            checkinTime: String(s.checkin_time || '14:00').trim(),
            checkoutTime: String(s.checkout_time || '11:00').trim(),
            graceMinutes: Math.max(0, Number(s.late_checkout_grace_minutes || 30)),
            hourlyCharge: Math.max(0, Number(s.late_checkout_hourly_charge || 100)),
          })
        }
      } catch {
        if (mounted) {
          setOccupancyPricing({ includedGuests: 1, extraGuestPerNight: 500 })
          setLateCheckoutSettings({ checkinTime: '14:00', checkoutTime: '11:00', graceMinutes: 30, hourlyCharge: 100 })
        }
      }
    }
    loadHotelSettings()
    return () => { mounted = false }
  }, [token, activeHotelId, booking?.room_type])

  const summary = useMemo(() => {
    if (!booking) {
      return {
        nights: 0,
        totalGuests: 1,
        extraGuestCount: 0,
        extraGuestCharges: 0,
        baseRoomCharges: 0,
        roomCharges: 0,
        extras: 0,
        lateStayCharge: 0,
        discount: 0,
        taxableSubtotal: 0,
        taxRate: 0,
        taxTotal: 0,
        gross: 0,
        advance: 0,
        paymentsTotal: 0,
        due: 0,
      }
    }

    const checkInDate = booking?.check_in_date ? new Date(booking.check_in_date) : null
    const checkOutDate = booking?.check_out_date ? new Date(booking.check_out_date) : null
    const nights = checkInDate && checkOutDate ? Math.max(1, Math.round((checkOutDate - checkInDate) / 86400000)) : 0
    const totalGuests = Math.max(1, Number(booking?.total_guests || 1))
    const includedGuests = Math.max(1, Number(occupancyPricing.includedGuests || 1))
    const extraGuestCount = Math.max(0, totalGuests - includedGuests)
    const extraGuestPerNight = Math.max(0, Number(occupancyPricing.extraGuestPerNight || 0))
    const extraGuestCharges = nights * extraGuestCount * extraGuestPerNight

    const baseRoomCharges = Math.max(0, Number(booking?.base_rate || 0)) * nights
    const roomCharges = Number(booking?.total_amount || 0)
    const discount = Number(booking?.discount || 0)
    const taxRate = Number(booking?.tax_rate || 0)

    const extras = folioItems.reduce((s, it) => s + Number(it.amount || 0), 0)
    const manualLateStayCharge = folioItems.reduce((s, it) => {
      const desc = String(it.description || '').toLowerCase()
      const type = String(it.type || '').toLowerCase()
      const isLate = desc.includes('late checkout') || desc.includes('late checkout fee') || type === 'late_checkout'
      return s + (isLate ? Number(it.amount || 0) : 0)
    }, 0)

    const lateStayCharge = manualLateStayCharge
    const taxableSubtotal = Math.max(0, roomCharges + extras)

    const gross = balance ? Number(balance.gross || 0) : taxableSubtotal + (taxRate > 0 ? (taxableSubtotal * taxRate) / 100 : 0)
    const taxTotal = balance ? Number(balance.tax || 0) : (taxRate > 0 ? (taxableSubtotal * taxRate) / 100 : 0)
    const advance = balance ? Number(balance.advance || 0) : Number(booking?.advance_payment || 0)
    const paymentsTotal = balance ? Number(balance.payments_total || 0) : payments.reduce((s, p) => s + Number(p.amount || 0), 0)
    const due = balance ? Number(balance.current_balance || 0) : gross - paymentsTotal

    return {
      nights,
      totalGuests,
      extraGuestCount,
      extraGuestCharges,
      baseRoomCharges,
      roomCharges,
      extras,
      lateStayCharge,
      discount,
      taxableSubtotal,
      taxRate,
      taxTotal,
      gross,
      advance,
      paymentsTotal,
      due,
    }
  }, [booking, folioItems, payments, balance, occupancyPricing])

  const companionGuests = useMemo(() => {
    const raw = booking?.companion_details
    const docMap = parseCompanionDocumentMap(booking?.companion_documents)

    if (!raw) return []
    try {
      let parsed = []
      if (Array.isArray(raw)) {
        parsed = raw
      } else if (typeof raw === 'object' && raw !== null) {
        parsed = Object.values(raw)
      } else if (typeof raw === 'string' && raw.trim()) {
        const json = JSON.parse(raw)
        parsed = Array.isArray(json) ? json : typeof json === 'object' && json !== null ? Object.values(json) : []
      }

      return parsed
        .map((c, idx) => ({
          serial: idx + 2,
          role: String(c?.role || `Guest #${idx + 2}`).trim(),
          name: String(c?.name || '').trim(),
          age: String(c?.age || '').trim(),
          gender: String(c?.gender || '').trim(),
          relation: String(c?.relation || '').trim(),
          phone: String(c?.phone || '').trim(),
          idType: String(c?.id_type || c?.idType || '').trim(),
          idNumber: String(c?.id_number || c?.idNumber || '').trim(),
          notes: String(c?.notes || '').trim(),
          documentUrl: String(docMap[idx] || c?.document_url || c?.documentUrl || '').trim(),
        }))
        .filter((c) => c.name || c.idNumber || c.relation || c.phone || c.notes || c.documentUrl)
    } catch {
      return []
    }
  }, [booking?.companion_details, booking?.companion_documents])

  const roundedDue = useMemo(() => Number(summary.due.toFixed(2)), [summary.due])
  const paymentAmount = Number(paymentForm.amount || 0)
  const paymentHasPositiveAmount = paymentForm.amount !== '' && Number.isFinite(paymentAmount) && paymentAmount > 0
  const paymentExceedsDue = roundedDue > 0.01 && paymentHasPositiveAmount && paymentAmount > roundedDue
  const paymentBalanceAfter = paymentHasPositiveAmount ? Number((roundedDue - paymentAmount).toFixed(2)) : roundedDue
  const isFullyPaid = roundedDue <= 0.01

  const hotelGstNumber = (
    hotelInfo?.gst_number ||
    hotelInfo?.gstNumber ||
    hotelInfo?.gstin ||
    hotelInfo?.hotel_gst_number ||
    ''
  ).trim()

  function copyBookingCode() {
    const code = booking?.booking_code || id
    if (code) {
      navigator.clipboard.writeText(code)
      setCopiedCode(true)
      toast.success(`Booking ID copied: ${code}`)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  function handleAutoFillDue() {
    setPaymentForm((prev) => ({
      ...prev,
      amount: roundedDue > 0 ? roundedDue.toFixed(2) : '',
    }))
    const payInput = document.getElementById('payment-amount-input')
    if (payInput) payInput.focus()
  }

  function handlePresetService(s) {
    setItemForm({
      description: s.name,
      amount: String(s.unit_price),
      type: s.type,
      taxable: true,
    })
    setShowAddCharge(true)
  }

  async function addFolioItem(e) {
    e.preventDefault()
    try {
      await postWithAuth('/folio/add-item', {
        booking_id: Number(bookingId),
        description: itemForm.description,
        amount: Number(itemForm.amount || 0),
        type: itemForm.type,
        taxable: itemForm.taxable,
      }, token)
      toast.success('Charge added to folio')
      setItemForm({ description: '', amount: '', type: 'service', taxable: true })
      setShowAddCharge(false)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to add charge')
    }
  }

  async function deleteFolioItem(itemId) {
    if (!window.confirm('Remove this charge from the folio?')) return
    try {
      await postWithAuth(`/folio/${itemId}/delete`, {}, token)
      toast.success('Charge removed')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to delete charge')
    }
  }

  async function applyDiscount(e) {
    e.preventDefault()
    if (Number(discountForm.discount || 0) > 0 && !discountForm.reason.trim()) {
      toast.error('Please enter a reason for the discount')
      return
    }
    try {
      await patchWithAuth('/folio/apply-discount', {
        booking_id: Number(bookingId),
        discount: Number(discountForm.discount || 0),
        discount_type: discountForm.discount_type,
        discount_reason: discountForm.reason,
      }, token)
      toast.success('Discount applied')
      setDiscountForm((prev) => ({ ...prev, discount: '', reason: '' }))
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to apply discount')
    }
  }

  async function addPayment(e) {
    e.preventDefault()
    if (!bookingId) return toast.error('Booking ID not loaded')
    if (paymentExceedsDue) return toast.error('Payment amount cannot exceed balance due')
    try {
      await postWithAuth('/payments', {
        booking_id: Number(bookingId),
        amount: Number(paymentForm.amount || 0),
        method: paymentForm.method,
        reference: paymentForm.reference,
        paid_on: paymentForm.paid_on,
      }, token)
      toast.success('Payment recorded')
      setPaymentForm((prev) => ({ ...prev, amount: '', reference: '' }))
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to record payment')
    }
  }

  async function deletePayment(paymentId) {
    if (!window.confirm('Delete this payment record?')) return
    try {
      await postWithAuth(`/payments/${paymentId}/delete`, {}, token)
      toast.success('Payment deleted')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to delete payment')
    }
  }

  async function generateInvoice() {
    try {
      if (token && bookingId && Number.isInteger(Number(bookingId))) {
        const invoiceRes = await postWithAuth(`/invoices/${bookingId}`, { booking_id: Number(bookingId) }, token)
        const invoiceId = invoiceRes?.data?.invoice_id || invoiceRes?.data?.id
        const pdfRes = await getWithAuth(`/invoices/${invoiceId}/pdf`, token, {
          responseType: 'blob',
          params: { v: Date.now() },
        })
        const blobUrl = window.URL.createObjectURL(new Blob([pdfRes.data], { type: 'application/pdf' }))
        window.open(blobUrl, '_blank', 'noopener,noreferrer')
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000)
        toast.success('Tax Invoice opened')
      } else {
        const code = booking?.booking_code || id
        window.open(`${domain}api/public/bookings/${encodeURIComponent(code)}/invoice/pdf`, '_blank')
        toast.success('Opening Invoice PDF')
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to generate tax invoice')
    }
  }

  function handlePrintVoucher() {
    window.print()
  }

  function handleWhatsAppShare() {
    const code = booking?.booking_code || id
    const hotel = hotelInfo?.name || 'Hotel Stay'
    const guest = primaryGuest?.name || booking?.guest_name || 'Guest'
    const roomTypeDisplay = (typeof booking?.room_type === 'object' ? booking?.room_type?.name : booking?.room_type) || 'Standard'
    const text = `Booking Confirmation - ${hotel}\nBooking ID: ${code}\nGuest: ${guest}\nDates: ${formatDateHuman(booking?.check_in_date)} to ${formatDateHuman(booking?.check_out_date)}\nRoom: ${booking?.room_number || '-'} (${roomTypeDisplay})\nTotal: ${formatINR(summary.gross)}\nBalance Due: ${dueTxt}\nView Folio: ${window.location.href}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  async function payWithRazorpay() {
    if (roundedDue <= 0) return toast('No outstanding balance')
    const keyId = hotelInfo?.razorpay_key_id || RAZORPAY_KEY_ID
    if (!keyId) return toast.error('Razorpay is not configured for this hotel')
    try {
      const orderRes = await postWithAuth('/payments/razorpay/create-order', {
        booking_id: Number(bookingId),
        amount: roundedDue,
      }, token)
      const { order_id, amount, currency } = orderRes.data

      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://checkout.razorpay.com/v1/checkout.js'
          script.onload = resolve
          script.onerror = reject
          document.body.appendChild(script)
        })
      }

      const options = {
        key: keyId,
        amount,
        currency,
        name: hotelInfo?.name || 'Hotel Stay',
        description: `Booking - ${booking?.booking_code || bookingId}`,
        order_id,
        handler: async (response) => {
          try {
            await postWithAuth('/payments/razorpay/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              booking_id: Number(bookingId),
              amount: roundedDue,
            }, token)
            toast.success('Payment successful')
            load()
          } catch (e) {
            toast.error('Payment verification failed')
          }
        },
        theme: { color: '#0a2240' },
      }
      new window.Razorpay(options).open()
    } catch (e) {
      toast.error('Failed to initiate online payment')
    }
  }

  async function payWithPhonePe() {
    if (roundedDue <= 0) return toast('No outstanding balance')
    if (!hotelInfo?.phonepe_configured && !hotelInfo?.phonepe_merchant_id)
      return toast.error('PhonePe is not configured for this hotel')
    try {
      const res = await postWithAuth('/payments/phonepe/initiate', {
        booking_id: Number(bookingId),
        amount: roundedDue,
        hotel_id: activeHotelId,
      }, token)
      const redirectUrl =
        res?.data?.instrument_response?.redirect_info?.url ||
        res?.data?.redirect_url ||
        res?.data?.redirectUrl
      if (redirectUrl) {
        window.open(redirectUrl, '_blank', 'noopener,noreferrer')
        toast.success('PhonePe payment page opened - complete payment and return here')
        // Poll balance after 10 seconds
        setTimeout(() => load(), 10000)
      } else {
        toast.error('PhonePe redirect URL not received')
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to initiate PhonePe payment')
    }
  }

  // Unified online pay - picks the right gateway automatically
  function payOnline() {
    const gw = (hotelInfo?.payment_gateway || 'razorpay').toLowerCase()
    if (gw === 'phonepe') payWithPhonePe()
    else payWithRazorpay()
  }

  const activeGateway = (hotelInfo?.payment_gateway || 'razorpay').toLowerCase()
  const gatewayLabel = activeGateway === 'phonepe' ? 'PhonePe' : 'Razorpay'
  const gatewayConfigured = activeGateway === 'phonepe'
    ? (hotelInfo?.phonepe_configured || !!hotelInfo?.phonepe_merchant_id)
    : (hotelInfo?.razorpay_configured || !!(hotelInfo?.razorpay_key_id || RAZORPAY_KEY_ID))

  const rawStatus = String(booking?.status || 'confirmed').toLowerCase().replace(/-/g, '_')

  return (
    <div className="ota-page-container">

      {/* 1. OTA STANDARD HEADER */}
      <header className="ota-header-card">
        <div className="ota-header-main">
          <div className="ota-hotel-meta">
            <h1 className="ota-hotel-title">{hotelInfo?.name || 'Grand Hotel & Suites'}</h1>
            <p className="ota-hotel-location">
              <i className="fa-solid fa-location-dot" style={{ color: '#0071c2', marginRight: 6 }}></i>
              {hotelInfo?.address || 'Hotel Location & Front Desk'}
              {hotelInfo?.phone && (
                <span className="ota-sep-dot"> &nbsp;•&nbsp; Phone: <strong>{hotelInfo.phone}</strong></span>
              )}
              {hotelGstNumber && (
                <span className="ota-sep-dot"> &nbsp;•&nbsp; GSTIN: <strong>{hotelGstNumber}</strong></span>
              )}
            </p>
          </div>

          <div className="ota-header-actions">
            <button type="button" className="ota-btn outline" onClick={generateInvoice} title="Tax Invoice (PDF)">
              <i className="fa-solid fa-file-invoice"></i> Tax Invoice
            </button>
            <button type="button" className="ota-btn outline" onClick={handlePrintVoucher} title="Print Voucher">
              <i className="fa-solid fa-print"></i> Print
            </button>
            <button type="button" className="ota-btn whatsapp" onClick={handleWhatsAppShare} title="Share on WhatsApp">
              <i className="fa-brands fa-whatsapp"></i> WhatsApp
            </button>
            {token && (booking?.id || booking?.booking_code) && (
              <button type="button" className="ota-btn outline" onClick={() => navigate(`/booking/create?edit=true&booking_id=${booking.id || bookingId}&room_id=${booking.room_id || ''}&guest_id=${booking.guest_id || ''}&check_in=${booking.check_in_date || ''}&check_out=${booking.check_out_date || ''}`)}>
                <i className="fa-solid fa-pen"></i> Edit
              </button>
            )}
            {token && (
              <button type="button" className="ota-btn outline" onClick={() => navigate('/booking/all')}>
                <i className="fa-solid fa-arrow-left"></i> Bookings
              </button>
            )}
            {!token && getGuestSession()?.token && (
              <button type="button" className="ota-btn outline" onClick={() => navigate('/guest')}>
                <i className="fa-solid fa-arrow-left"></i> My Bookings
              </button>
            )}
          </div>
        </div>

        <div className="ota-header-sub">
          <div className="ota-ref-badge" onClick={copyBookingCode} title="Click to copy Booking ID">
            <span>Booking ID:</span>
            <strong>{booking?.booking_code || `#${id}`}</strong>
            <i className={`fa-regular ${copiedCode ? 'fa-circle-check' : 'fa-copy'}`}></i>
          </div>

          <span className={`ota-status-pill ${rawStatus}`}>
            <i className="fa-solid fa-circle"></i>
            {rawStatus.replace(/_/g, ' ')}
          </span>

          <span className="ota-date-meta">
            Booked on: {formatDateHuman(booking?.created_at || booking?.check_in_date)}
          </span>
        </div>
      </header>

      {/* 2. ITINERARY CARD (Standard OTA 4-Box Layout) */}
      <section className="ota-itinerary-card">
        <div className="ota-itin-box">
          <span className="ota-itin-caption">CHECK-IN</span>
          <div className="ota-itin-date">{formatDateHuman(booking?.check_in_date)}</div>
          <div className="ota-itin-time">From {formatTime12Hour(lateCheckoutSettings.checkinTime)}</div>
        </div>

        <div className="ota-itin-divider">
          <span className="ota-night-pill">
            {summary.nights} Night{summary.nights !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="ota-itin-box">
          <span className="ota-itin-caption">CHECK-OUT</span>
          <div className="ota-itin-date">{formatDateHuman(booking?.check_out_date)}</div>
          <div className="ota-itin-time">Until {formatTime12Hour(lateCheckoutSettings.checkoutTime)}</div>
        </div>

        <div className="ota-itin-box room-box">
          <span className="ota-itin-caption">ROOM & GUESTS</span>
          <div className="ota-itin-date">
            Room {booking?.room_number || '-'} &nbsp;
            <span className="ota-room-category">({(typeof booking?.room_type === 'object' ? booking?.room_type?.name : booking?.room_type) || 'Standard'})</span>
          </div>
          <div className="ota-itin-time">
            {summary.totalGuests} Guest{summary.totalGuests !== 1 ? 's' : ''} • {(booking?.rate_plan || 'Room Only').toUpperCase()}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="ota-loading-box">
          <i className="fa-solid fa-circle-notch fa-spin fa-2x" style={{ color: '#0071c2', marginBottom: 10 }}></i>
          <div>Loading booking details...</div>
        </div>
      ) : (
        /* 3. MAIN CONTENT & SIDEBAR GRID */
        <div className="ota-content-grid">

          {/* LEFT MAIN DETAILS */}
          <div className="ota-main-pane">

            {/* GUEST INFORMATION CARD */}
            <div className="ota-card">
              <div className="ota-card-header flex-between">
                <h2><i className="fa-solid fa-user-group" style={{ color: '#0071c2', marginRight: 8 }}></i> Guest & Occupant Details</h2>
                <span className="ota-occupant-count-pill">
                  Total {summary.totalGuests} Guest{summary.totalGuests !== 1 ? 's' : ''} (1 Lead + {Math.max(0, summary.totalGuests - 1)} Additional)
                </span>
              </div>
              <div className="ota-card-body">

                {/* Primary / Lead Guest */}
                <div className="ota-lead-guest-box">
                  <div className="ota-lead-guest-badge">
                    <i className="fa-solid fa-star" style={{ color: '#0071c2' }}></i> Primary / Lead Guest
                  </div>
                  <div className="ota-guest-info-grid">
                    <div>
                      <span className="ota-label">Full Name</span>
                      <div className="ota-value">{primaryGuest?.name || booking?.guest_name || '-'}</div>
                    </div>
                    <div>
                      <span className="ota-label">Phone Number</span>
                      <div className="ota-value">{primaryGuest?.phone || booking?.guest_phone || '-'}</div>
                    </div>
                    <div>
                      <span className="ota-label">Email Address</span>
                      <div className="ota-value" style={{ wordBreak: 'break-all' }}>
                        {primaryGuest?.email || booking?.guest_email || '-'}
                      </div>
                    </div>
                    <div>
                      <span className="ota-label">ID Document</span>
                      <div className="ota-value">
                        <span>{primaryGuest?.id_type ? `${primaryGuest.id_type}: ${primaryGuest.id_number || '-'}` : (primaryGuest?.id_number || 'On File')}</span>
                        {primaryGuest?.proof_document && (
                          <a href={resolveAssetUrl(primaryGuest.proof_document)} target="_blank" rel="noreferrer" className="ota-link-btn">
                            <i className="fa-solid fa-file-lines" style={{ marginRight: 3 }}></i> View ID
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Guests Full Details */}
                {companionGuests.length > 0 ? (
                  <div className="ota-companions-section">
                    <div className="ota-companions-header">
                      <h3 className="ota-subheading">
                        <i className="fa-solid fa-users" style={{ color: '#0071c2', marginRight: 6 }}></i>
                        Additional Guest Details ({companionGuests.length})
                      </h3>
                      <span className="ota-meta-sub-text">All registered co-occupants for Room {booking?.room_number || '-'}</span>
                    </div>

                    <div className="ota-companion-cards-grid">
                      {companionGuests.map((c, i) => (
                        <div key={i} className="ota-companion-card">
                          <div className="ota-companion-top">
                            <span className="ota-guest-num-badge">Guest #{c.serial}</span>
                            {c.relation && <span className="ota-relation-pill">{c.relation}</span>}
                          </div>

                          <div className="ota-companion-name">{c.name || `Guest #${c.serial}`}</div>

                          <div className="ota-companion-fields">
                            <div className="ota-comp-field-item">
                              <span className="ota-sub-label">Gender & Age</span>
                              <span className="ota-sub-val">
                                {c.gender || c.age ? `${c.gender ? c.gender : ''}${c.gender && c.age ? ' • ' : ''}${c.age ? `${c.age} yrs` : ''}` : '-'}
                              </span>
                            </div>

                            <div className="ota-comp-field-item">
                              <span className="ota-sub-label">Contact Phone</span>
                              <span className="ota-sub-val">{c.phone || '-'}</span>
                            </div>

                            <div className="ota-comp-field-item">
                              <span className="ota-sub-label">ID Type & Number</span>
                              <span className="ota-sub-val">
                                {c.idType || c.idNumber ? `${c.idType ? `${c.idType}: ` : ''}${c.idNumber || '-'}` : 'ID on file'}
                              </span>
                            </div>

                            {c.documentUrl && (
                              <div className="ota-comp-field-item">
                                <span className="ota-sub-label">ID Proof Document</span>
                                <a href={resolveAssetUrl(c.documentUrl)} target="_blank" rel="noreferrer" className="ota-link-btn-pill">
                                  <i className="fa-solid fa-file-lines"></i> View Document
                                </a>
                              </div>
                            )}
                          </div>

                          {c.notes && (
                            <div className="ota-companion-notes">
                              <span className="ota-sub-label">Notes:</span> {c.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : summary.totalGuests > 1 ? (
                  <div className="ota-companions-section">
                    <div className="ota-companions-empty-box">
                      <i className="fa-solid fa-users" style={{ color: '#0071c2', marginRight: 6 }}></i>
                      <span>
                        Total <strong>{summary.totalGuests} Guests</strong> booked for this room (1 Primary Guest + {summary.totalGuests - 1} Additional Guest{summary.totalGuests - 1 > 1 ? 's' : ''}). Individual companion details can be updated via the Edit booking option.
                      </span>
                    </div>
                  </div>
                ) : null}

              </div>
            </div>

            {/* ITEMIZED BILLING / STAY STATEMENT */}
            <div className="ota-card">
              <div className="ota-card-header flex-between">
                <h2><i className="fa-solid fa-file-lines" style={{ color: '#0071c2', marginRight: 8 }}></i> Itemized Stay Charges</h2>
                {token && (
                  <button type="button" className="ota-btn-small" onClick={() => setShowAddCharge((v) => !v)}>
                    <i className={`fa-solid ${showAddCharge ? 'fa-minus' : 'fa-plus'}`}></i> {showAddCharge ? 'Close' : 'Add Charge / Service'}
                  </button>
                )}
              </div>
              <div className="ota-card-body">

                {/* Staff Add Charge Form */}
                {token && showAddCharge && (
                  <div className="ota-add-charge-panel">
                    <div className="ota-presets-row">
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Quick Add:</span>
                      {PREDEFINED_SERVICES.map((s) => (
                        <button key={s.name} type="button" className="ota-preset-chip" onClick={() => handlePresetService(s)}>
                          + {s.name} ({formatINR(s.unit_price)})
                        </button>
                      ))}
                    </div>

                    <form onSubmit={addFolioItem} className="ota-charge-form">
                      <input
                        className="ota-input"
                        placeholder="Description (e.g. Airport Cab, Dining)"
                        value={itemForm.description}
                        onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))}
                        required
                      />
                      <select
                        className="ota-input"
                        value={itemForm.type}
                        onChange={(e) => setItemForm((p) => ({ ...p, type: e.target.value }))}
                      >
                        <option value="service">Service / F&B</option>
                        <option value="extra">Extra Item / Bed</option>
                        <option value="late_checkout">Late Checkout Fee</option>
                      </select>
                      <input
                        className="ota-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Amount (₹)"
                        value={itemForm.amount}
                        onChange={(e) => setItemForm((p) => ({ ...p, amount: e.target.value }))}
                        required
                      />
                      <button type="submit" className="ota-btn primary">
                        Post Charge
                      </button>
                    </form>
                  </div>
                )}

                {/* Statement Table */}
                <div className="ota-table-wrap">
                  <table className="ota-statement-table">
                    <thead>
                      <tr>
                        <th>Particulars</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">Amount</th>
                        {token && <th className="text-right" style={{ width: 40 }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <strong>Accommodation Tariff</strong>
                          <span style={{ marginLeft: '8px', fontSize: '0.85em', color: '#0071c2', fontWeight: 'bold' }}>
                            [{(booking?.rate_plan || 'Room Only').toUpperCase()}]
                          </span>
                          <div className="ota-item-sub">
                            Room {booking?.room_number || '-'} ({(typeof booking?.room_type === 'object' ? booking?.room_type?.name : booking?.room_type) || 'Standard'}) • {summary.nights} night(s)
                          </div>
                        </td>
                        <td className="text-right">{formatINR(booking?.base_rate || 0)}</td>
                        <td className="text-right font-semibold">{formatINR(summary.baseRoomCharges)}</td>
                        {token && <td></td>}
                      </tr>

                      {summary.extraGuestCharges > 0 && (
                        <tr>
                          <td>
                            <strong>Extra Guest Charge</strong>
                            <div className="ota-item-sub">{summary.extraGuestCount} extra occupant(s) × {summary.nights} night(s)</div>
                          </td>
                          <td className="text-right">{formatINR(occupancyPricing.extraGuestPerNight)}</td>
                          <td className="text-right font-semibold">{formatINR(summary.extraGuestCharges)}</td>
                          {token && <td></td>}
                        </tr>
                      )}

                      {summary.discount > 0 && (
                        <tr>
                          <td>
                            <strong style={{ color: '#059669' }}>Discount / Special Offer</strong>
                            {booking?.discount_reason && <div className="ota-item-sub">{booking.discount_reason}</div>}
                          </td>
                          <td className="text-right">-</td>
                          <td className="text-right font-semibold" style={{ color: '#059669' }}>-{formatINR(summary.discount)}</td>
                          {token && <td></td>}
                        </tr>
                      )}

                      {folioItems.map((it) => (
                        <tr key={it.id}>
                          <td>
                            <strong>{it.description || 'Extra Service'}</strong>
                            <div className="ota-item-sub">{it.type ? it.type.replace('_', ' ') : 'Service'}</div>
                          </td>
                          <td className="text-right">-</td>
                          <td className="text-right font-semibold">{formatINR(it.amount || 0)}</td>
                          {token && (
                            <td className="text-right">
                              <button type="button" className="ota-del-btn" onClick={() => deleteFolioItem(it.id)} title="Delete">
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}

                      {summary.taxRate > 0 && (
                        <tr>
                          <td>
                            <strong>Taxes (GST {summary.taxRate}%)</strong>
                            <div className="ota-item-sub">CGST {(summary.taxRate / 2)}% + SGST {(summary.taxRate / 2)}%</div>
                          </td>
                          <td className="text-right">-</td>
                          <td className="text-right font-semibold">{formatINR(summary.taxTotal)}</td>
                          {token && <td></td>}
                        </tr>
                      )}

                      <tr className="ota-total-row">
                        <td colSpan={2}><strong>Total Amount (Incl. Taxes)</strong></td>
                        <td className="text-right ota-total-amount"><strong>{formatINR(summary.gross)}</strong></td>
                        {token && <td></td>}
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>
            </div>

            {/* PAYMENT TRANSACTIONS */}
            <div className="ota-card">
              <div className="ota-card-header">
                <h2><i className="fa-solid fa-receipt" style={{ color: '#059669', marginRight: 8 }}></i> Payment History</h2>
              </div>
              <div className="ota-card-body">
                {payments.length === 0 && summary.advance <= 0 ? (
                  <div className="ota-empty-notice">No payments recorded yet.</div>
                ) : (
                  <div className="ota-table-wrap">
                    <table className="ota-statement-table">
                      <thead>
                        <tr>
                          <th>Payment Method</th>
                          <th>Reference / Details</th>
                          <th>Date</th>
                          <th className="text-right">Amount</th>
                          {token && <th className="text-right" style={{ width: 40 }}></th>}
                        </tr>
                      </thead>
                      <tbody>

                        {payments.map((p) => {
                          const gw = gatewayIcon(p.method)
                          return (
                            <tr key={p.id}>
                              <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                  <i className={gw.icon} style={{ color: gw.color, fontSize: 13 }} />
                                  {gw.label}
                                </span>
                              </td>
                              <td>{p.reference || '-'}</td>
                              <td>{formatDateHuman(p.paid_on || p.created_at)}</td>
                              <td className="text-right font-semibold" style={{ color: '#059669' }}>{formatINR(p.amount)}</td>
                              {token && (
                                <td className="text-right">
                                  <button type="button" className="ota-del-btn" onClick={() => deletePayment(p.id)} title="Delete">
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </td>
                              )}
                            </tr>
                          )
                        })}                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* HOTEL POLICIES */}
            <div className="ota-card">
              <div className="ota-card-header">
                <h2><i className="fa-solid fa-circle-info" style={{ color: '#64748b', marginRight: 8 }}></i> Important Information & Policies</h2>
              </div>
              <div className="ota-card-body">
                <div className="ota-policy-list">
                  <div>• <strong>Government Photo ID:</strong> Required at check-in for all adult occupants (Aadhaar, Driving License, Passport, or Voter ID).</div>
                  <div>• <strong>Check-In & Check-Out:</strong> Standard check-in is from {formatTime12Hour(lateCheckoutSettings.checkinTime)}; check-out is by {formatTime12Hour(lateCheckoutSettings.checkoutTime)}.</div>
                  <div>• <strong>Assistance & Front Desk:</strong> Dial extension <strong>0</strong> or call <strong>{hotelInfo?.phone || 'Front Desk'}</strong> for any queries.</div>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT STICKY BILLING COLUMN */}
          <aside className="ota-sidebar">

            {/* PRICE SUMMARY CARD */}
            <div className="ota-summary-card">
              <div className="ota-summary-head">
                <span>Fare Summary</span>
                <strong>{formatINR(summary.gross)}</strong>
              </div>
              <div className="ota-summary-rows">
                <div className="ota-summary-line">
                  <span>Room Tariff</span>
                  <span>{formatINR(summary.roomCharges)}</span>
                </div>
                {summary.extras > 0 && (
                  <div className="ota-summary-line">
                    <span>Extra Services</span>
                    <span>{formatINR(summary.extras)}</span>
                  </div>
                )}
                {summary.discount > 0 && (
                  <div className="ota-summary-line" style={{ color: '#059669' }}>
                    <span>Discounts</span>
                    <span>-{formatINR(summary.discount)}</span>
                  </div>
                )}
                <div className="ota-summary-line">
                  <span>Taxes & Fees</span>
                  <span>{formatINR(summary.taxTotal)}</span>
                </div>
                <div className="ota-summary-line total">
                  <span>Total Payable</span>
                  <strong>{formatINR(summary.gross)}</strong>
                </div>
                <div className="ota-summary-line" style={{ color: '#059669' }}>
                  <span>Amount Paid</span>
                  <strong>-{formatINR(summary.paymentsTotal)}</strong>
                </div>

                <div className={`ota-balance-badge ${isFullyPaid ? 'paid' : 'due'}`}>
                  <div className="ota-balance-title">{isFullyPaid ? 'Account Settled' : 'Balance Due'}</div>
                  <div className="ota-balance-amt">{isFullyPaid ? '₹ 0.00' : formatINR(roundedDue)}</div>
                </div>
              </div>
            </div>

            {/* RECORD PAYMENT (STAFF ONLY) */}
            {token && (
              <div className="ota-side-action-card">
                <div className="ota-side-title">
                  <i className="fa-solid fa-credit-card" style={{ color: '#0071c2', marginRight: 6 }}></i> Record Payment
                </div>

                {!isFullyPaid && (
                  <button type="button" className="ota-autofill-btn" onClick={handleAutoFillDue}>
                    Auto-Fill Balance ({formatINR(roundedDue)})
                  </button>
                )}

                <form onSubmit={addPayment} className="ota-pay-form">
                  <div className="ota-field">
                    <label>Amount (₹) *</label>
                    <input
                      id="payment-amount-input"
                      className="ota-input"
                      type="number"
                      min="0"
                      max={roundedDue > 0 ? roundedDue : undefined}
                      step="0.01"
                      placeholder="0.00"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="ota-field">
                    <label>Method</label>
                    <select
                      className="ota-input"
                      value={paymentForm.method}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))}
                    >
                      <option value="cash">💵 Cash</option>
                      <option value="upi">📱 UPI (GPay / PhonePe / Paytm)</option>
                      <option value="card">💳 Card (POS)</option>
                      <option value="bank_transfer">🏦 Bank Transfer / NEFT</option>
                      {activeGateway === 'razorpay' && <option value="razorpay">⚡ Razorpay (Online)</option>}
                      {activeGateway === 'phonepe' && <option value="phonepe">📲 PhonePe (Online)</option>}
                      <option value="cheque">📝 Cheque</option>
                      <option value="other">🔖 Other</option>
                    </select>
                  </div>

                  <div className="ota-field">
                    <label>Reference / UTR</label>
                    <input
                      className="ota-input"
                      placeholder="e.g. UTR / Receipt No"
                      value={paymentForm.reference}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))}
                    />
                  </div>

                  <button
                    type="submit"
                    className="ota-btn primary full"
                    disabled={isFullyPaid || paymentExceedsDue}
                  >
                    {isFullyPaid ? 'Settled in Full' : 'Save Payment'}
                  </button>
                </form>
              </div>
            )}

            {/* PUBLIC PAY ONLINE BUTTON */}
            {!isFullyPaid && onlinePaymentEnabled && gatewayConfigured && (
              <div className="ota-side-action-card" style={{ marginTop: token ? 12 : 0, padding: token ? '16px' : '20px', border: token ? '1px solid #e2e8f0' : '', background: token ? '#f8fafc' : '' }}>
                {token ? null : (
                  <div className="ota-side-title">
                    <i className="fa-solid fa-credit-card" style={{ color: '#0071c2', marginRight: 6 }}></i> Settle Balance
                  </div>
                )}
                <button
                  type="button"
                  className={`ota-btn ${activeGateway} full`}
                  style={{ padding: '12px', fontSize: '15px' }}
                  onClick={payOnline}
                >
                  <i className={gatewayIcon(activeGateway).icon} />
                  {' '}Pay Online ({gatewayLabel})
                </button>
              </div>
            )}

            {/* APPLY DISCOUNT (STAFF ONLY) */}
            {token && (
              <div className="ota-side-action-card">
                <div className="ota-side-title">
                  <i className="fa-solid fa-tag" style={{ color: '#d97706', marginRight: 6 }}></i> Apply Discount
                </div>

                <form onSubmit={applyDiscount} className="ota-pay-form">
                  <div className="ota-field">
                    <label>Type</label>
                    <select
                      className="ota-input"
                      value={discountForm.discount_type}
                      onChange={(e) => setDiscountForm((p) => ({ ...p, discount_type: e.target.value }))}
                    >
                      <option value="amount">Fixed Amount (₹)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                  </div>

                  <div className="ota-field">
                    <label>{discountForm.discount_type === 'percentage' ? 'Discount %' : 'Amount (₹)'}</label>
                    <input
                      className="ota-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={discountForm.discount}
                      onChange={(e) => setDiscountForm((p) => ({ ...p, discount: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="ota-field">
                    <label>Reason *</label>
                    <input
                      className="ota-input"
                      placeholder="e.g. Corporate Rate / Management Approval"
                      value={discountForm.reason}
                      onChange={(e) => setDiscountForm((p) => ({ ...p, reason: e.target.value }))}
                      required
                    />
                  </div>

                  <button type="submit" className="ota-btn outline full">
                    Apply Discount
                  </button>
                </form>
              </div>
            )}

          </aside>

        </div>
      )}

    </div>
  )
}
