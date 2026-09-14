import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { getWithAuth, patchWithAuth, postWithAuth } from '../api'
import toast from 'react-hot-toast'
import './BookingCreateModern.css'

function formatDateLocal(d) {
  const date = new Date(d)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const today = formatDateLocal(new Date())
const tomorrow = formatDateLocal(new Date(Date.now() + 86400000))

const COUNTRY_CODES = ['+91', '+1', '+44', '+61', '+971', '+65', '+49', '+81']

const RELATION_OPTIONS = [
  'Spouse',
  'Child',
  'Parent',
  'Sibling',
  'Friend',
  'Colleague',
  'Relative',
  'Other',
]

const PREDEFINED_SERVICES = [
  { name: 'Airport Pickup', unit_price: 1200 },
  { name: 'Breakfast', unit_price: 450 },
  { name: 'Extra Bed', unit_price: 900 },
  { name: 'Laundry', unit_price: 300 },
]

const initialFormState = {
  country_code: '+91',
  mobile: '',
  customer_name: '',
  email: '',
  gender: '',
  city: '',
  state: '',
  pin_code: '',
  guest_notes: '',
  booking_date: today,
  booking_time: new Date().toTimeString().slice(0, 5),
  payment_mode: '',
  total_guests: '1',
  id_verified: false,
  room_id: '',
  check_in_date: today,
  check_out_date: tomorrow,
  base_rate: '',
  advance_payment: '0',
  rate_plan: '',
  booking_source: 'Walk-in',
  market_segment: 'Leisure',
  expected_arrival_time: '',
  special_requests: '',
  status: 'reserved',
  discount: '0',
  discount_reason: '',
  discount_type: 'amount',
  offer_source: 'none',
  custom_offer_name: 'Special Offer',
  custom_offer_pct: '0',
  manual_discount_pct: '0',
  apply_on: 'before_tax',
  original_tax: 0,
}

export default function BookingCreate() {
  const token = useSelector((s) => s.auth.accesstoken)
  const activeHotelId = useSelector((s) => s.auth.activeHotelId)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roomIdFromUrl = searchParams.get('room_id') || searchParams.get('id') // For rooms, sometimes it's id
  const bookingIdFromUrl = searchParams.get('booking_id') || searchParams.get('id')
  const isEditMode = searchParams.get('edit') === 'true' || !!bookingIdFromUrl
  const [isLoadingBooking, setIsLoadingBooking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rooms, setRooms] = useState([])
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [searchingAvailability, setSearchingAvailability] = useState(false)
  const [selectedGuest, setSelectedGuest] = useState(null)
  const [guestHits, setGuestHits] = useState([])
  const [hotelTaxRate, setHotelTaxRate] = useState(0)
  const [hotelTaxPolicy, setHotelTaxPolicy] = useState({ taxType: 'GST', taxPercent: 18, country: 'India' })
  const [systemOccupancyPricing, setSystemOccupancyPricing] = useState({ includedGuests: 1, extraGuestPerNight: 500 })
  const [roomTypeOccupancyMap, setRoomTypeOccupancyMap] = useState({})
  const [defaultOffer, setDefaultOffer] = useState({ enabled: false, name: 'Special Offer', percent: 0 })
  const [services, setServices] = useState([{ id: Date.now(), item_name: '', unit_price: '0', qty: '1', active: true }])
  const [quickService, setQuickService] = useState('')
  const [companions, setCompanions] = useState([])
  const [companionDocFiles, setCompanionDocFiles] = useState({})
  const [guestPhoto, setGuestPhoto] = useState({ file: null, name: '', existingDoc: null })
  const [guestProofFile, setGuestProofFile] = useState(null)
  const [ratePlans, setRatePlans] = useState([])

  const [form, setForm] = useState(initialFormState)

  // Reset state when not in edit mode
  useEffect(() => {
    if (!isEditMode || !bookingIdFromUrl) {
      setForm(initialFormState)
      setSelectedGuest(null)
      setRooms([])
      setSelectedRoomType('')
      setCompanions([])
      setCompanionDocFiles({})
      setGuestPhoto({ file: null, name: '', existingDoc: null })
      setGuestProofFile(null)
      setServices([{ id: Date.now(), item_name: '', unit_price: '0', qty: '1', active: true }])
      setQuickService('')
    }
  }, [isEditMode, bookingIdFromUrl])

  // Load booking data if in edit mode
  useEffect(() => {
    if (!isEditMode || !bookingIdFromUrl || !token) return
    
    async function loadBooking() {
      try {
        setIsLoadingBooking(true)
        const res = await getWithAuth(`/bookings/${bookingIdFromUrl}`, token)
        const booking = res.data?.booking || res.data
        
        if (!booking || !booking.id) {
          toast.error('Booking not found')
          navigate('/booking/all')
          return
        }
        
        // Parse special_requests to extract only the Notes part (if stored in concatenated format)
        let parsedSpecialRequests = booking.special_requests || ''
        if (parsedSpecialRequests.includes('Notes:')) {
          const notesMatch = parsedSpecialRequests.match(/Notes:\s*([^|]*)/)
          if (notesMatch) {
            parsedSpecialRequests = notesMatch[1].trim()
          }
        }

        // Parse discount_reason to extract offer name and percentage
        // Format: "Offer Name (XX%)" like "Durga to eid (6.00%)"
        let offerSource = 'none'
        let customOfferName = 'Special Offer'
        let customOfferPct = '0'
        const discountReason = booking.discount_reason || ''
        const discountAmt = Number(booking.discount || booking.discount_amount || 0)
        
        let manualDiscountPct = '0'
        if (discountReason) {
          const manualMatch = discountReason.match(/Manual Discount\s*\(([\d.]+)%\)/i)
          if (manualMatch) {
            manualDiscountPct = manualMatch[1]
          }
        }
        
        // If there's a discount with a reason containing offer info, parse it
        if (discountReason && discountReason.includes('(') && discountReason.includes('%')) {
          const offerMatch = discountReason.match(/(.+?)\s*\(([\d.]+)%\)/)
          if (offerMatch) {
            const parsedName = offerMatch[1].trim()
            const parsedPct = offerMatch[2]
            
            // Check if parsed offer matches Default Offer
            if (defaultOffer.enabled && parsedName === defaultOffer.name) {
              offerSource = 'default'
              customOfferName = defaultOffer.name
              customOfferPct = String(defaultOffer.percent)
              console.log('Matched Default Offer:', { offerSource, customOfferName, customOfferPct })
            } else {
              offerSource = 'custom'
              const booking = res.data?.booking || res.data
              const guestData = res.data?.guest
              
              // Debug logging for documents and photo
              console.log('API Response:', res.data)
              console.log('Booking:', booking)
              console.log('Guest:', guestData)
              console.log('Guest Photo:', guestData?.photo)
              console.log('Companion Documents:', booking?.companion_documents || res.data?.companion_documents)
              
              console.log('Parsed offer from reason:', { offerSource, customOfferName, customOfferPct })
              customOfferName = parsedName
              customOfferPct = parsedPct
            }
          }
        } else if (discountAmt > 0 && discountReason) {
          // Has discount but no offer format - keep as manual discount
          offerSource = 'none'
          customOfferName = discountReason || 'Manual Discount'
        }

        // Populate form with ALL booking data
        setForm(prev => ({
          ...prev,
          room_id: String(booking.room_id || ''),
          check_in_date: String(booking.check_in_date || '').slice(0, 10),
          check_out_date: String(booking.check_out_date || '').slice(0, 10),
          base_rate: booking.base_rate ? Number(booking.base_rate).toFixed(2) : '',
          advance_payment: String(booking.advance_payment || booking.advance || '0'),
          total_guests: String(booking.total_guests || '1'),
          special_requests: parsedSpecialRequests,
          rate_plan: booking.rate_plan || '',
          booking_source: booking.booking_source || 'Walk-in',
          market_segment: booking.market_segment || 'Leisure',
          expected_arrival_time: booking.expected_arrival_time || '',
          discount: String(booking.discount || booking.discount_amount || '0'),
          discount_reason: booking.discount_reason || '',
          discount_type: booking.discount_type || 'amount',
          status: String(booking.status || 'reserved').toLowerCase().replace(/[\s-]/g, '_'),
          booking_date: String(booking.booking_date || '').slice(0, 10) || today,
          booking_time: booking.booking_time || '12:00',
          payment_mode: booking.payment_mode || 'cash',
          apply_on: booking.apply_on || 'before_tax',
          offer_source: offerSource,
          custom_offer_name: customOfferName,
          custom_offer_pct: customOfferPct,
          manual_discount_pct: manualDiscountPct,
          original_tax: Number(booking.tax || 0),
        }))
        
        // Also load guest data if available
        let guestData = null
        if (res.data?.guest && res.data.guest.id) {
          guestData = res.data.guest
        } else if (booking.guest_id) {
          // Fetch guest details
          try {
            const guestRes = await getWithAuth(`/guests/${booking.guest_id}`, token)
            if (guestRes.data) {
              guestData = guestRes.data
              console.log('Fetched guest data:', guestData)
              console.log('Guest Photo from fetch:', guestData?.photo, guestData?.Photo)
            }
          } catch (e) {
            console.log('Could not load guest details')
          }
        }
        
        if (guestData) {
          setSelectedGuest(guestData)
          // Populate guest form fields (handle backend field names)
          setForm(prev => ({
            ...prev,
            country_code: guestData.country_code || '+91',
            mobile: guestData.phone || guestData.mobile || '',
            customer_name: guestData.name || '',
            email: guestData.email || '',
            gender: guestData.gender || '',
            city: guestData.city || '',
            state: guestData.state || '',
            pin_code: guestData.pincode || guestData.pin_code || '',
            guest_notes: guestData.preferences || guestData.notes || '',
            id_verified: guestData.id_verified || guestData.IDVerified || false,
          }))
          
          // Load guest photo if available
          console.log('Checking for guest photo:', { 
            photo: guestData.photo, 
            photo_url: guestData.photo_url, 
            photo_path: guestData.photo_path,
            Photo: guestData.Photo 
          })
          if (guestData.photo || guestData.photo_url || guestData.photo_path || guestData.Photo) {
            const photoName = guestData.photo_name || guestData.photo_filename || 'guest photo'
            const existingPhoto = guestData.photo || guestData.photo_url || guestData.photo_path || guestData.Photo
            console.log('Setting guest photo:', { photoName, existingPhoto })
            setGuestPhoto({
              file: null,
              name: photoName,
              existingDoc: existingPhoto
            })
          } else {
            console.log('No guest photo found')
          }
        }

        // Load folio items (Services)
        try {
          const folioRes = await getWithAuth(`/folio/${bookingIdFromUrl}`, token)
          if (Array.isArray(folioRes.data)) {
            const serviceItems = folioRes.data.filter((item) => item.type === 'service' || item.type === 'charge')
            if (serviceItems.length > 0) {
              setServices(serviceItems.map((item) => ({
                id: item.id || Date.now() + Math.random(),
                item_name: item.description,
                unit_price: String(item.amount),
                qty: '1',
                active: true,
                is_new: false // Flag to prevent duplicate POSTs on edit
              })))
            }
          }
        } catch (e) {
          console.error("Failed to load folio items:", e)
        }
        
        // Load companion details if available
        if (booking.companion_details || res.data?.companion_details) {
          try {
            const companionData = booking.companion_details || res.data?.companion_details
            let companions = []
            if (typeof companionData === 'string') {
              companions = JSON.parse(companionData)
            } else if (Array.isArray(companionData)) {
              companions = companionData
            }
            if (companions.length > 0) {
              // Ensure each companion has an id
              companions = companions.map((c, idx) => ({
                id: c.id || Date.now() + idx,
                name: c.name || '',
                age: c.age || '',
                gender: c.gender || '',
                relation: c.relation || '',
                id_type: c.id_type || '',
                id_number: c.id_number || '',
                phone: c.phone || '',
                notes: c.notes || '',
              }))
              setCompanions(companions)
              console.log('Loaded companions:', companions)
            }
          } catch (e) {
            console.log('Could not parse companion details:', e)
          }
        }
        
        // Load companion documents if available
        if (booking.companion_documents || res.data?.companion_documents) {
          try {
            const docData = booking.companion_documents || res.data?.companion_documents
            console.log('Raw companion_documents:', docData)
            let docs = {}
            if (typeof docData === 'string') {
              docs = JSON.parse(docData)
            } else if (typeof docData === 'object') {
              docs = docData
            }
            console.log('Parsed companion documents:', docs)
            // Convert to format with existingDoc property to show in UI
            const docFiles = {}
            Object.keys(docs).forEach(key => {
              docFiles[key] = { 
                existingDoc: docs[key],
                name: docs[key].filename || docs[key].name || 'Uploaded file'
              }
            })
            setCompanionDocFiles(docFiles)
            console.log('Set companionDocFiles:', docFiles)
          } catch (e) {
            console.log('Could not parse companion documents:', e)
          }
        }
        
        toast.success('Booking loaded for editing')
        // Automatically search availability so the currently booked room appears in the list
        if (booking.check_in_date && booking.check_out_date) {
          searchAvailability(booking.check_in_date.slice(0, 10), booking.check_out_date.slice(0, 10))
        }
      } catch (e) {
        console.error('Failed to load booking:', e)
        toast.error(e?.response?.data?.error || 'Failed to load booking')
        navigate('/booking/all')
      } finally {
        setIsLoadingBooking(false)
      }
    }
    
    loadBooking()
  }, [isEditMode, bookingIdFromUrl, token, navigate])

  // Initialize check-in / check-out from query params if present
  useEffect(() => {
    // If in edit mode, wait for the booking to finish loading before applying URL overrides
    if (isEditMode && isLoadingBooking) return 
    
    const inDateFromUrlParam = searchParams.get('check_in') || searchParams.get('check_in_date')
    const outDateFromUrlParam = searchParams.get('check_out') || searchParams.get('check_out_date')
    const inDateFromUrl = inDateFromUrlParam ? inDateFromUrlParam.split('T')[0] : ''
    const outDateFromUrl = outDateFromUrlParam ? outDateFromUrlParam.split('T')[0] : ''

    function parseIsoDate(s) {
      if (!s) return null
      const d = new Date(`${s}T00:00:00`)
      return Number.isNaN(d.getTime()) ? null : d
    }

    if (inDateFromUrl) {
      const inDate = parseIsoDate(inDateFromUrl)
      const outDate = parseIsoDate(outDateFromUrl)

      if (!inDate) {
        toast.error('Invalid check-in date in URL; using today')
        return
      }

      let finalOut = outDate
      if (!finalOut) {
        finalOut = new Date(inDate.getTime() + 86400000)
      }

      if (finalOut.getTime() <= inDate.getTime()) {
        // enforce at least one night
        finalOut = new Date(inDate.getTime() + 86400000)
        toast('Check-out adjusted to next day')
      }

      const inStr = formatDateLocal(inDate)
      const outStr = formatDateLocal(finalOut)

      setForm((prev) => ({ ...prev, check_in_date: inStr, check_out_date: outStr }))
    } else if (outDateFromUrl) {
      // check-out provided without check-in: ignore or set check-in to previous day
      const outDate = parseIsoDate(outDateFromUrl)
      if (!outDate) {
        toast.error('Invalid check-out date in URL; using defaults')
        return
      }
      const inDate = new Date(outDate.getTime() - 86400000)
      setForm((prev) => ({ ...prev, check_in_date: formatDateLocal(inDate), check_out_date: formatDateLocal(outDate) }))
    }
    // run only on mount / when params change / after loading finishes
  }, [searchParams, isEditMode, isLoadingBooking])

  const splitPhone = (rawPhone) => {
    const phone = String(rawPhone || '').trim()
    if (!phone) return { countryCode: '+91', mobile: '' }

    const normalizedCodes = [...COUNTRY_CODES].sort((a, b) => b.length - a.length)
    if (phone.startsWith('+')) {
      const code = normalizedCodes.find((c) => phone.startsWith(c))
      if (code) {
        return { countryCode: code, mobile: phone.slice(code.length).replace(/\D/g, '') }
      }
    }

    const digits = phone.replace(/\D/g, '')
    if (digits.length > 10) {
      const countryGuess = `+${digits.slice(0, digits.length - 10)}`
      return {
        countryCode: normalizedCodes.includes(countryGuess) ? countryGuess : '+91',
        mobile: digits.slice(-10),
      }
    }

    return { countryCode: '+91', mobile: digits }
  }

  const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '')

  const parseGuestPreferences = (rawPreferences) => {
    const text = String(rawPreferences || '').trim()
    if (!text) return { gender: '', notes: '' }

    const mapGender = (raw) => {
      const v = String(raw || '').trim().toLowerCase()
      if (!v) return ''
      if (['m', 'male', 'man', 'boy'].includes(v)) return 'Male'
      if (['f', 'female', 'woman', 'girl'].includes(v)) return 'Female'
      if (['o', 'other', 'trans', 'transgender', 'nonbinary', 'non-binary'].includes(v)) return 'Other'
      return ''
    }

    const genderLabeledMatch = text.match(/(?:^|[\n|;,])\s*(?:gender|sex)\s*[:=-]?\s*([A-Za-z-]+)/i)
    const genderWordFallback = text.match(/\b(male|female|other|non-binary|nonbinary|transgender|trans|man|woman|boy|girl|m|f|o)\b/i)
    const notesMatch = text.match(/(?:customer\s*notes?|notes?)\s*[:=-]\s*(.+?)(?=(?:\n|\||;|$))/i)

    const gender = mapGender(genderLabeledMatch?.[1]) || mapGender(genderWordFallback?.[1])

    let notes = String(notesMatch?.[1] || '').trim()
    if (!notes) {
      // Fallback: if preferences has free text (without labels), keep it as notes.
      notes = text
        .replace(/(?:^|[\n|;,])\s*(?:gender|sex)\s*[:=-]?\s*(?:male|female|other)\b/gi, '')
        .replace(/(?:^|[\n|;,])\s*(?:customer\s*notes?|notes?)\s*[:=-]?/gi, '')
        .replace(/[|;]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
    if (notes === '-' || /^n\/?a$/i.test(notes)) notes = ''

    return {
      gender,
      notes,
    }
  }

  const parseGuestAddress = (rawAddress) => {
    const raw = rawAddress || ''
    // If address is stored as JSON string (structured), parse and map fields
    try {
      const obj = typeof raw === 'string' && raw.trim().startsWith('{') ? JSON.parse(raw) : null
      if (obj && typeof obj === 'object') {
        return {
          city: obj.city || obj.town || obj.locality || '',
          state: obj.state || '',
          pinCode: obj.pincode || obj.pinCode || obj.pincode || obj.postal_code || obj.postcode || '',
          district: obj.district || '',
          country: obj.country || '',
        }
      }
    } catch (e) {
      // fall back to legacy format
      console.warn('Failed to parse guest address as JSON, falling back to legacy parsing', e)
    }

    // Legacy comma-separated string: city, state, pin
    const parts = String(rawAddress || '').split(',').map((x) => x.trim()).filter(Boolean)
    return {
      city: parts[0] || '',
      state: parts[1] || '',
      pinCode: parts[2] || parts[3] || '',
    }
  }

  const getRoomTypeName = (room) => {
    if (!room) return ''
    if (typeof room.room_type === 'string' && room.room_type) return room.room_type
    if (room.room_type && typeof room.room_type === 'object') return room.room_type.name || ''
    if (room.room_type_details && typeof room.room_type_details === 'object') return room.room_type_details.name || ''
    if (typeof room === 'string') return room
    if (typeof room === 'object' && room.name) return room.name
    return String(room)
  }

  const normalizeRoomTypeKey = (value) => {
    const v = String(getRoomTypeName(value) || '').trim().toLowerCase()
    return v || 'unspecified'
  }

  const selectedRoom = rooms.find((r) => String(r.id) === String(form.room_id))
  const selectedRoomName = selectedRoom ? getRoomTypeName(selectedRoom) : ''
  const selectedRoomLabel = selectedRoom ? `${selectedRoom.room_number} - ${selectedRoomName || '-'}` : 'Not selected'
  const effectiveOccupancyPricing = useMemo(() => {
    const defaultIncluded = Math.max(1, Number(systemOccupancyPricing.includedGuests || 1))
    const defaultExtra = Math.max(0, Number(systemOccupancyPricing.extraGuestPerNight || 0))
    if (!selectedRoom) {
      return { includedGuests: defaultIncluded, extraGuestPerNight: defaultExtra }
    }

    const typePolicy = roomTypeOccupancyMap[normalizeRoomTypeKey(selectedRoomName)]
    if (typePolicy) {
      return {
        includedGuests: Math.max(1, Number(typePolicy.includedGuests || defaultIncluded)),
        extraGuestPerNight: Math.max(0, Number(typePolicy.extraGuestPerNight || defaultExtra)),
      }
    }

    return {
      includedGuests: Math.max(1, Number(selectedRoom.included_guests ?? defaultIncluded)),
      extraGuestPerNight: Math.max(0, Number(selectedRoom.extra_guest_charge_per_night ?? defaultExtra)),
    }
  }, [selectedRoom, roomTypeOccupancyMap, systemOccupancyPricing.includedGuests, systemOccupancyPricing.extraGuestPerNight])
  // Add pre-selected room from URL to rooms list if not present
  const roomsWithSelection = useMemo(() => {
    if (!roomIdFromUrl || rooms.length === 0) return rooms
    
    const alreadyInList = rooms.some(r => String(r.id) === String(roomIdFromUrl))
    if (alreadyInList) return rooms
    
    // Room not available - add it as unavailable option
    return [...rooms, { 
      id: roomIdFromUrl, 
      room_number: `Room ${roomIdFromUrl}`, 
      room_type: 'Not Available',
      base_price: 0,
      unavailable: true
    }]
  }, [rooms, roomIdFromUrl])
  
  const uniqueRoomTypes = useMemo(() => {
    const types = new Set()
    roomsWithSelection.forEach(r => {
      const typeName = getRoomTypeName(r)
      if (typeName && typeName !== 'Not Available') {
        types.add(typeName)
      }
    })
    return Array.from(types).sort()
  }, [roomsWithSelection])

  const filteredRooms = useMemo(() => {
    if (!selectedRoomType) return roomsWithSelection
    return roomsWithSelection.filter((r) => getRoomTypeName(r) === selectedRoomType || r.unavailable)
  }, [roomsWithSelection, selectedRoomType])

  const nights = useMemo(() => {
    const inDate = new Date(form.check_in_date)
    const outDate = new Date(form.check_out_date)
    const diff = Math.floor((outDate - inDate) / 86400000)
    return Number.isFinite(diff) && diff > 0 ? diff : 0
  }, [form.check_in_date, form.check_out_date])

  const roomSubtotal = useMemo(() => nights * Number(form.base_rate || 0), [nights, form.base_rate])
  const extraGuestCount = useMemo(() => {
    const totalGuests = Math.min(20, Math.max(1, Number(form.total_guests || 1)))
    const included = Math.max(1, Number(effectiveOccupancyPricing.includedGuests || 1))
    return Math.max(0, totalGuests - included)
  }, [form.total_guests, effectiveOccupancyPricing.includedGuests])
  const extraGuestSubtotal = useMemo(() => {
    const perNight = Math.max(0, Number(effectiveOccupancyPricing.extraGuestPerNight || 0))
    return nights * extraGuestCount * perNight
  }, [nights, extraGuestCount, effectiveOccupancyPricing.extraGuestPerNight])
  const servicesSubtotal = useMemo(
    () => services.reduce((acc, s) => acc + (s.active ? Number(s.unit_price || 0) * Number(s.qty || 0) : 0), 0),
    [services],
  )
  const subtotal = roomSubtotal + extraGuestSubtotal + servicesSubtotal
  const offerPct = form.offer_source === 'default'
    ? Math.max(0, Number(defaultOffer.percent || 0))
    : form.offer_source === 'custom'
      ? Math.max(0, Number(form.custom_offer_pct || 0))
      : 0
  const offerNameDisplay = form.offer_source === 'default'
    ? String(defaultOffer.name || 'Special Offer')
    : form.offer_source === 'custom'
      ? form.custom_offer_name
      : ''
  const offerPctDisplay = form.offer_source === 'default'
    ? String(Number(defaultOffer.percent || 0))
    : form.offer_source === 'custom'
      ? form.custom_offer_pct
      : ''
  const manualPct = Math.max(0, Number(form.manual_discount_pct || 0))
  const totalDiscountPct = Math.min(100, offerPct + manualPct)
  const taxOnSubtotal = (subtotal * hotelTaxRate) / 100
  const grossBeforeDiscount = subtotal + taxOnSubtotal
  const discountAmount = form.apply_on === 'after_tax'
    ? (grossBeforeDiscount * totalDiscountPct) / 100
    : (subtotal * totalDiscountPct) / 100
  const taxableBase = form.apply_on === 'after_tax'
    ? subtotal
    : Math.max(0, subtotal - discountAmount)
  const taxAmount = form.apply_on === 'after_tax'
    ? taxOnSubtotal
    : (isEditMode && form.original_tax > 0 
        ? form.original_tax + (servicesSubtotal * hotelTaxRate / 100)
        : (taxableBase * hotelTaxRate) / 100)
  const totalToCollect = form.apply_on === 'after_tax'
    ? Math.max(0, grossBeforeDiscount - discountAmount)
    : taxableBase + taxAmount

  const occupancyMode = Number(form.total_guests || 1) > 1 ? 'Shared Stay' : 'Single Stay'

  useEffect(() => {
    const total = Math.min(20, Math.max(1, Number(form.total_guests || 1)))
    const companionCount = Math.max(0, total - 1)
    setCompanions((prev) => {
      const next = [...prev]
      while (next.length < companionCount) {
        next.push({
          role: 'Adult',
          name: '',
          age: '',
          gender: '',
          phone: '',
          id_type: '',
          id_number: '',
          relation: '',
          notes: '',
        })
      }
      if (next.length > companionCount) return next.slice(0, companionCount)
      return next
    })
    // Keep document files aligned with active companion rows only.
    setCompanionDocFiles((prev) => {
      const next = {}
      Object.keys(prev).forEach((k) => {
        const idx = Number(k)
        if (Number.isInteger(idx) && idx >= 0 && idx < companionCount && prev[k]) {
          next[idx] = prev[k]
        }
      })
      return next
    })
  }, [form.total_guests])

  useEffect(() => {
    async function loadHotelTax() {
      if (!token || !activeHotelId) return
      try {
        const [hotelRes, systemRes, offerRes, occupancyRes] = await Promise.all([
          getWithAuth(`/hotels/${activeHotelId}`, token),
          getWithAuth('/settings/system', token),
          (async () => {
            try {
              return await getWithAuth('/settings/offer', token)
            } catch (e) {
              if (e?.response?.status === 404) {
                return await getWithAuth('/settings/system', token)
              }
              throw e
            }
          })(),
          getWithAuth('/settings/room-occupancy', token),
        ])
        const hotel = hotelRes?.data || {}
        const taxRate = Number(hotel.tax_percent || 18)
        setHotelTaxRate(taxRate)
        setHotelTaxPolicy({
          taxType: String(hotel.tax_type || 'GST').trim(),
          taxPercent: taxRate,
          country: String(hotel.country || 'India').trim(),
        })

        const systemSettings = systemRes?.data || {}
        setSystemOccupancyPricing({
          includedGuests: Math.max(1, Number(systemSettings.included_guests || 1)),
          extraGuestPerNight: Math.max(0, Number(systemSettings.extra_guest_charge_per_night || 0)),
        })

        const items = Array.isArray(occupancyRes?.data?.items) ? occupancyRes.data.items : []
        const typeMap = {}
        for (const row of items) {
          const key = normalizeRoomTypeKey(row.room_type)
          typeMap[key] = {
            includedGuests: Math.max(1, Number(row.effective_included_guests || systemSettings.included_guests || 1)),
            extraGuestPerNight: Math.max(0, Number(row.effective_extra_guest_charge_per_night || systemSettings.extra_guest_charge_per_night || 0)),
          }
        }
        setRoomTypeOccupancyMap(typeMap)

        const settings = offerRes?.data || {}
        setDefaultOffer({
          enabled: !!settings.default_offer_enabled,
          name: String(settings.default_offer_name || 'Special Offer'),
          percent: Number(settings.default_offer_percent || 0),
        })
      } catch {
        setHotelTaxRate(18)
        setHotelTaxPolicy({ taxType: 'GST', taxPercent: 18, country: 'India' })
        setSystemOccupancyPricing({ includedGuests: 1, extraGuestPerNight: 500 })
        setRoomTypeOccupancyMap({})
        setDefaultOffer({ enabled: false, name: 'Special Offer', percent: 0 })
      }
    }
    async function loadRatePlans() {
      if (!token || !activeHotelId) return
      try {
        const res = await getWithAuth('/api/rate-plans', token)
        setRatePlans(res.data?.filter(p => p.is_active) || [])
      } catch (err) {
        console.error('Failed to load rate plans:', err)
      }
    }
    loadHotelTax()
    loadRatePlans()
  }, [token, activeHotelId])

  useEffect(() => {
    if (!defaultOffer.enabled && form.offer_source === 'default') {
      setForm((prev) => ({ ...prev, offer_source: 'none' }))
    }
  }, [defaultOffer.enabled, form.offer_source])

  async function searchAvailability(inDate = form.check_in_date, outDate = form.check_out_date) {
    if (!token) return
    if (!inDate || !outDate) {
      toast.error('Check-in and check-out are required')
      return
    }
    setSearchingAvailability(true)
    try {
      const params = {
        check_in_date: inDate,
        check_out_date: outDate,
      }
      if (isEditMode && bookingIdFromUrl) {
        params.exclude_booking_id = bookingIdFromUrl
      }
      const res = await getWithAuth('/availability', token, { params })
      const items = Array.isArray(res.data?.items) ? res.data.items : []
      setRooms(items)
      setSelectedRoomType('')
      
      // Auto-select room from URL if available
      if (roomIdFromUrl && items.length > 0) {
        const matchingRoom = items.find(r => String(r.id) === String(roomIdFromUrl))
        if (matchingRoom) {
          setForm(prev => {
            const next = {
              ...prev,
              room_id: String(matchingRoom.id),
            }
            if (!isEditMode) {
              next.base_rate = Number(matchingRoom.base_price || 0).toFixed(2)
            }
            return next
          })
          toast.success(`Room ${matchingRoom.room_number} pre-selected`)
        } else {
          toast.error(`Room ${roomIdFromUrl} is not available for selected dates`)
        }
      }
      
      if (items.length === 0) toast('No available rooms for selected dates')
    } catch (e) {
      console.error(e)
      toast.error(e?.response?.data?.error || 'Failed to search availability')
    } finally {
      setSearchingAvailability(false)
    }
  }

  useEffect(() => {
    if (token) searchAvailability()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    const mobileDigits = normalizePhoneDigits(form.mobile)
    if (!token || mobileDigits.length < 4) {
      setGuestHits([])
      return
    }

    const t = setTimeout(async () => {
      try {
        const res = await getWithAuth('/guests/search', token, { params: { q: mobileDigits } })
        const hits = Array.isArray(res.data) ? res.data : []
        setGuestHits(hits)

        const enteredFull = normalizePhoneDigits(`${form.country_code}${mobileDigits}`)
        const exact = hits.find((g) => {
          const gDigits = normalizePhoneDigits(g.phone)
          return gDigits === enteredFull || gDigits.endsWith(mobileDigits)
        })
        if (exact) {
          const phone = splitPhone(exact.phone)
          const pref = parseGuestPreferences(exact.preferences)
          const addr = parseGuestAddress(exact.address)
          setSelectedGuest(exact)
          setForm((prev) => ({
            ...prev,
            country_code: phone.countryCode,
            mobile: phone.mobile,
            customer_name: String(exact.name || ''),
            email: String(exact.email || ''),
            gender: String(exact.gender || pref.gender || ''),
            city: addr.city,
            state: addr.state,
            pin_code: addr.pinCode,
            guest_notes: pref.notes,
          }))
          setGuestHits([])
        }
      } catch (e) {
        console.error(e)
      }
    }, 280)
    return () => clearTimeout(t)
  }, [token, form.mobile, form.country_code])

  useEffect(() => {
    if (!selectedGuest?.id) return
    const selectedDigits = normalizePhoneDigits(selectedGuest.phone)
    const enteredDigits = normalizePhoneDigits(`${form.country_code}${form.mobile}`)
    if (enteredDigits && selectedDigits !== enteredDigits && !selectedDigits.endsWith(normalizePhoneDigits(form.mobile))) {
      setSelectedGuest(null)
    }
  }, [form.mobile, form.country_code, selectedGuest])

  function onFormChange(e) {
    const { name, value, type, checked } = e.target
    if (name === 'room_id') {
      const picked = rooms.find((r) => String(r.id) === String(value))
      setForm((prev) => {
        const next = { ...prev, room_id: value }
        if (!isEditMode) {
          next.base_rate = picked ? Number(picked.base_price || 0).toFixed(2) : ''
        }
        return next
      })
      return
    }
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  function addServiceRow() {
    setServices((prev) => [...prev, { id: Date.now() + Math.random(), item_name: '', unit_price: '0', qty: '1', active: true }])
  }

  function updateServiceRow(id, key, value) {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: value } : s)))
  }

  function removeServiceRow(id) {
    setServices((prev) => prev.filter((s) => s.id !== id))
  }

  function addQuickService() {
    if (!quickService) return
    const svc = PREDEFINED_SERVICES.find((s) => s.name === quickService)
    if (!svc) return
    setServices((prev) => [...prev, { id: Date.now() + Math.random(), item_name: svc.name, unit_price: String(svc.unit_price), qty: '1', active: true }])
    setQuickService('')
  }

  function updateCompanion(index, key, value) {
    setCompanions((prev) => prev.map((c, i) => (i === index ? { ...c, [key]: value } : c)))
  }

  function updateCompanionDoc(index, file) {
    setCompanionDocFiles((prev) => ({ ...prev, [index]: file || null }))
  }



  async function resolveGuestId() {
    if (selectedGuest?.id) return Number(selectedGuest.id)

    if (!form.customer_name.trim() || !form.mobile.trim()) {
      throw new Error('Customer name and mobile are required')
    }

    const phoneFull = `${form.country_code}${form.mobile.trim()}`
    if (guestProofFile && !form.id_type) {
      throw new Error('Please select an ID Type for the uploaded document')
    }

    const fd = new FormData()
    fd.append('name', form.customer_name.trim())
    fd.append('phone', phoneFull)
    fd.append('email', form.email.trim())
    fd.append('gender', form.gender)
    fd.append('id_type', (form.id_type || '').trim())
    fd.append('id_number', (form.id_number || '').trim())
    fd.append('id_verified', String(!!form.id_verified))
    fd.append('preferences', `Gender: ${form.gender || '-'}\nCustomer Notes: ${form.guest_notes || '-'}`)
    fd.append('address', [form.city, form.state, form.pin_code].map((v) => String(v || '').trim()).filter(Boolean).join(', '))
    if (guestPhoto?.file) fd.append('photo', guestPhoto.file)
    if (guestProofFile) {
      fd.append('proof_document_types', form.id_type || 'Unknown')
      fd.append('proof_documents', guestProofFile)
    }

    const res = await postWithAuth('/guests', fd, token, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return Number(res?.data?.id)
  }

  async function createBooking(e) {
    e.preventDefault()
    if (!token) return
    if (!form.room_id) {
      toast.error('Please select a room')
      return
    }
    try {
      // Edit mode: update existing booking
      if (isEditMode && bookingIdFromUrl) {
        const updatePayload = {
          room_id: Number(form.room_id),
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          base_rate: Number(form.base_rate || 0),
          discount_amount: discountAmount,
          discount_type: form.discount_type || 'amount',
          discount_reason: form.discount_reason || '',
          apply_on: form.apply_on || 'before_tax',
          advance_payment: Number(form.advance_payment || 0),
          booking_source: form.booking_source || 'Walk-in',
          market_segment: form.market_segment || 'Leisure',
          expected_arrival_time: form.expected_arrival_time || '',
          rate_plan: form.rate_plan || '',
          special_requests: form.special_requests || '',
          total_guests: Math.min(20, Math.max(1, Number(form.total_guests || 1))),
          status: form.status || 'reserved',
          companion_details: companions.length > 0 ? JSON.stringify(companions) : '',
        }
        
        await patchWithAuth(`/bookings/${bookingIdFromUrl}`, updatePayload, token)
        
        // Apply ONLY NEW services to the existing folio
        const validServices = services.filter((s) => s.is_new !== false && s.active && s.item_name.trim() && Number(s.unit_price || 0) > 0 && Number(s.qty || 0) > 0)
        for (const row of validServices) {
          await postWithAuth('/folio/add-item', {
            booking_id: Number(bookingIdFromUrl),
            description: row.item_name.trim(),
            amount: Number(row.unit_price || 0) * Number(row.qty || 0),
            type: 'service',
            taxable: true,
          }, token)
        }

        // Apply discount adjustments
        if (discountAmount > 0) {
          const offerName = form.offer_source === 'default' ? defaultOffer.name : form.custom_offer_name
          const offerReason = form.offer_source !== 'none'
            ? `${offerName || 'Special Offer'} (${offerPct.toFixed(2)}%)`
            : ''
          await patchWithAuth('/folio/apply-discount', {
            booking_id: Number(bookingIdFromUrl),
            discount: Number(discountAmount.toFixed(2)),
            discount_type: 'amount',
            discount_reason: [offerReason, manualPct > 0 ? `Manual Discount (${manualPct.toFixed(2)}%)` : ''].filter(Boolean).join(' + ') || 'Manual Discount',
          }, token)
        }
        
        toast.success('Booking updated successfully!')
        navigate('/booking/all')
        return
      }
      
      // Create mode: new booking
      const guestId = await resolveGuestId()

      const payload = {
        guest_id: guestId,
        room_id: Number(form.room_id),
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        base_rate: Number(form.base_rate || 0),
        discount_amount: discountAmount,
        discount_type: form.discount_type || 'amount',
        discount_reason: form.discount_reason || '',
        advance_payment: Number(form.advance_payment || 0),
        booking_source: form.booking_source,
        market_segment: form.market_segment,
        expected_arrival_time: form.expected_arrival_time,
        rate_plan: form.rate_plan,
        special_requests: [
          `Booking Date: ${form.booking_date}`,
          `Booking Time: ${form.booking_time}`,
          `Payment Mode: ${form.payment_mode || '-'}`,
          `Occupancy Pricing: Included ${Math.max(1, Number(effectiveOccupancyPricing.includedGuests || 1))}, Extra Guests ${extraGuestCount}, Charge ₹${extraGuestSubtotal.toFixed(2)}`,
          `Apply On: ${form.apply_on}`,
          form.special_requests ? `Notes: ${form.special_requests}` : '',
        ].filter(Boolean).join(' | '),
        total_guests: Math.min(20, Math.max(1, Number(form.total_guests || 1))),
        companion_details: JSON.stringify(companions.map((c, idx) => ({
          serial: idx + 2,
          role: String(c.role || 'Adult').trim(),
          name: String(c.name || '').trim(),
          age: Number(c.age || 0),
          gender: String(c.gender || '').trim(),
          phone: String(c.phone || '').trim(),
          id_type: String(c.id_type || '').trim(),
          id_number: String(c.id_number || '').trim(),
          relation: String(c.relation || '').trim(),
          notes: String(c.notes || '').trim(),
        }))),
      }

      const fd = new FormData()
      Object.entries(payload).forEach(([key, value]) => {
        fd.append(key, String(value ?? ''))
      })
      // Always allow companion document upload, regardless of main guest status
      Object.entries(companionDocFiles)
        .map(([k, file]) => [Number(k), file])
        .filter(([idx, file]) => Number.isInteger(idx) && idx >= 0 && idx < companions.length && file)
        .sort((a, b) => a[0] - b[0])
        .forEach(([idx, file]) => {
          fd.append('companion_documents', file)
          fd.append('companion_document_indexes', String(idx))
        })

      const res = await postWithAuth('/bookings', fd, token)
      const bookingCode = res?.data?.booking_code
      const bookingId = Number(res?.data?.id)

      const validServices = services.filter((s) => s.active && s.item_name.trim() && Number(s.unit_price || 0) > 0 && Number(s.qty || 0) > 0)
      for (const row of validServices) {
        await postWithAuth('/folio/add-item', {
          booking_id: bookingId,
          description: row.item_name.trim(),
          amount: Number(row.unit_price || 0) * Number(row.qty || 0),
          type: 'service',
          taxable: true,
        }, token)
      }

      if (discountAmount > 0) {
        const offerName = form.offer_source === 'default' ? defaultOffer.name : form.custom_offer_name
        const offerReason = form.offer_source !== 'none'
          ? `${offerName || 'Special Offer'} (${offerPct.toFixed(2)}%)`
          : ''
        await patchWithAuth('/folio/apply-discount', {
          booking_id: bookingId,
          discount: Number(discountAmount.toFixed(2)),
          discount_type: 'amount',
          discount_reason: [offerReason, manualPct > 0 ? `Manual Discount (${manualPct.toFixed(2)}%)` : ''].filter(Boolean).join(' + ') || 'Manual Discount',
        }, token)
      }

      toast.success(`Booking created: ${res.data?.booking_code || '#' + res.data?.id}`)
      setForm((prev) => ({
        ...prev,
        total_guests: '1',
        room_id: '',
        base_rate: '',
        advance_payment: '0',
        booking_source: 'Walk-in',
        market_segment: 'Leisure',
        expected_arrival_time: '',
        rate_plan: '',
        status: 'reserved',
        discount: '0',
        discount_reason: '',
        special_requests: '',
        manual_discount_pct: '0',
        offer_source: 'none',
        custom_offer_name: 'Special Offer',
        custom_offer_pct: '0',
        id_type: '',
        id_number: '',
        id_verified: false,
      }))
      setCompanions([])
      setCompanionDocFiles({})
      setGuestPhoto({ file: null, name: '', existingDoc: null })
      setGuestProofFile(null)
      setSelectedGuest(null)
      navigate(`/booking/${bookingCode}/folio`)
    } catch (err) {
      const status = err?.response?.status
      const msg = err?.response?.data?.error || err?.message || 'Failed to create booking'
      
      // Show specific message for room conflicts
      if (status === 409 || msg?.toLowerCase()?.includes('not available') || msg?.toLowerCase()?.includes('already booked')) {
        toast.error('❌ Room is already booked for these dates. Please select different dates or a different room.', { autoClose: 5000 })
      } else {
        toast.error(msg)
      }
    } finally {
      setSaving(false)
    }
  }


  return (
    <>
      <section className="booking-page-header">
        <div className="booking-page-header-icon">
          <i className="fa-solid fa-calendar-check"></i>
        </div>
        <div className="booking-page-header-title">
          <h1>Booking Management</h1>
          <p>{isEditMode ? 'Edit Booking' : 'Create New Booking'}</p>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag booking-create-panel">
              <div className="panel-heading booking-create-heading">
                <div>
                  <h4 className="booking-create-title">{isEditMode ? 'Edit Booking' : 'Booking Form'}</h4>
                  <p className="booking-create-subtitle">{isEditMode ? 'Update booking details, dates, and pricing.' : 'Create a reservation with customer details, stay plan, and charges in one flow.'}</p>
                </div>
                <button className="btn btn-default booking-create-list-btn" type="button" onClick={() => navigate('/booking/all')}>
                  <i className="fa-solid fa-list"></i> Booking List
                </button>
              </div>
              <div className="panel-body">
                <form onSubmit={createBooking}>
                <div className="booking-section">
                  <h5 className="booking-section-title">Booking Details</h5>
                  <div className="row">
                    <div className="col-sm-3 form-group">
                      <label>Booking Date *</label>
                      <input className="form-control booking-create-input" type="date" name="booking_date" value={form.booking_date} onChange={onFormChange} />
                    </div>
                    <div className="col-sm-3 form-group">
                      <label>Booking Time *</label>
                      <input className="form-control booking-create-input" type="time" name="booking_time" value={form.booking_time} onChange={onFormChange} />
                    </div>
                    <div className="col-sm-3 form-group">
                      <label>Check-in Date *</label>
                      <input className="form-control booking-create-input" type="date" name="check_in_date" value={form.check_in_date} onChange={onFormChange} required />
                    </div>
                    <div className="col-sm-3 form-group">
                      <label>Check-out Date *</label>
                      <input className="form-control booking-create-input" type="date" name="check_out_date" value={form.check_out_date} onChange={onFormChange} required />
                    </div>
                    <div className="col-sm-3 form-group">
                      <label>Total Guests *</label>
                      <input
                        className="form-control booking-create-input"
                        type="number"
                        min="1"
                        max="20"
                        name="total_guests"
                        value={form.total_guests}
                        onChange={onFormChange}
                      />
                      <small className="text-muted">Occupancy Mode: {occupancyMode}</small>
                      <small className="text-muted" style={{ display: 'block' }}>
                        Includes {Math.max(1, Number(effectiveOccupancyPricing.includedGuests || 1))} guest(s), then +₹{Number(effectiveOccupancyPricing.extraGuestPerNight || 0).toFixed(2)} per extra guest / night.
                      </small>
                    </div>
                  </div>
                  
                  <div className="row">
                    <div className="col-sm-3 form-group">
                      <label>Booking Source</label>
                      <select className="form-control booking-create-input" name="booking_source" value={form.booking_source} onChange={onFormChange}>
                        <option value="Walk-in">Walk-in</option>
                        <option value="Direct Call">Direct Call</option>
                        <option value="Website">Website</option>
                        <option value="OTA">OTA (MakeMyTrip, Agoda, etc.)</option>
                        <option value="Corporate">Corporate</option>
                        <option value="Travel Agent">Travel Agent</option>
                      </select>
                    </div>
                    <div className="col-sm-3 form-group">
                      <label>Market Segment</label>
                      <select className="form-control booking-create-input" name="market_segment" value={form.market_segment} onChange={onFormChange}>
                        <option value="Leisure">Leisure</option>
                        <option value="Business">Business</option>
                        <option value="Group">Group</option>
                        <option value="Government">Government</option>
                      </select>
                    </div>
                    <div className="col-sm-3 form-group">
                      <label>Expected Arrival Time</label>
                      <input className="form-control booking-create-input" type="time" name="expected_arrival_time" value={form.expected_arrival_time} onChange={onFormChange} />
                    </div>
                    <div className="col-sm-3 form-group booking-search-wrap" style={{ paddingTop: 20 }}>
                      <button className="btn btn-primary booking-primary-btn" style={{ width: '100%' }} type="button" onClick={() => searchAvailability()} disabled={searchingAvailability}>
                        {searchingAvailability ? 'Searching...' : 'Search Availability'}
                      </button>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-sm-4 form-group">
                      <label>Room Type</label>
                      <select
                        className="form-control booking-create-input"
                        value={selectedRoomType}
                        onChange={(e) => {
                          setSelectedRoomType(e.target.value)
                          setForm(prev => ({ ...prev, room_id: '' }))
                        }}
                        disabled={rooms.length === 0}
                      >
                        <option value="">All Types</option>
                        {uniqueRoomTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-sm-8 form-group">
                      <label>Select Room * <small className="text-muted">({filteredRooms.length} available)</small></label>
                      <select 
                        className="form-control booking-create-input" 
                        name="room_id" 
                        value={form.room_id} 
                        onChange={onFormChange} 
                        required
                        disabled={filteredRooms.length === 0}
                      >
                        <option value="">
                          {filteredRooms.length === 0 ? 'No rooms available for selected type' : 'Select room'}
                        </option>
                        {filteredRooms.map((r) => (
                          <option 
                            key={r.id} 
                            value={r.id}
                            disabled={r.unavailable}
                            style={r.unavailable ? { color: '#999', fontStyle: 'italic' } : {}}
                          >
                            {r.room_number} - {getRoomTypeName(r)}
                            {r.unavailable ? ' (NOT AVAILABLE)' : ''}
                          </option>
                        ))}
                      </select>
                      {rooms.length === 0 ? (
                        <small className="text-danger">All rooms are booked for these dates. Try different dates.</small>
                      ) : null}
                    </div>
                  </div>

                  <h5 className="booking-section-title booking-section-subtitle">Customer Registration</h5>
                  {selectedGuest ? (
                    <div className="alert booking-alert-success booking-inline-alert" style={{ marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        Matched Customer: <strong>{selectedGuest.name}</strong> ({selectedGuest.phone || '-'})
                        <div className="text-muted" style={{ marginTop: 2 }}>Fields stay editable. Update anything you need before creating the booking.</div>
                      </div>
                      <button type="button" className="btn btn-default btn-sm" onClick={() => { setSelectedGuest(null); setGuestPhoto({ file: null, name: '', existingDoc: null }); setGuestProofFile(null) }}>
                        Change Customer
                      </button>
                    </div>
                  ) : (
                    <div className="alert booking-alert-info booking-inline-alert" style={{ marginTop: 0 }}>
                      No matching customer selected. Complete these details to create the customer during booking.
                    </div>
                  )}

                  <div className="booking-new-customer-shell">
                    <div className="row">
                      <div className="col-sm-3 form-group">
                        <label>Country Code *</label>
                        <select className="form-control booking-create-input" name="country_code" value={form.country_code} onChange={onFormChange}>
                          {COUNTRY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                          <div className="col-sm-3 form-group">
                            <label>Mobile Number *</label>
                            <input className="form-control booking-create-input" name="mobile" value={form.mobile} onChange={onFormChange} placeholder="Enter mobile" required />
                            <small className="text-muted">Existing customer details auto-fill when this mobile matches.</small>
                            {guestHits.length > 0 ? (
                              <div className="list-group booking-guest-hit-list" style={{ marginTop: 8, marginBottom: 0 }}>
                                {guestHits.slice(0, 6).map((g) => (
                                  <button
                                    key={g.id}
                                    className="list-group-item"
                                    type="button"
                                    onClick={() => {
                                      const phone = splitPhone(g.phone)
                                      const pref = parseGuestPreferences(g.preferences)
                                      const addr = parseGuestAddress(g.address)
                                      setSelectedGuest(g)
                                      setForm((prev) => ({
                                        ...prev,
                                        country_code: phone.countryCode,
                                        mobile: phone.mobile,
                                        customer_name: String(g.name || ''),
                                        email: String(g.email || ''),
                                        gender: String(g.gender || pref.gender || ''),
                                        id_type: String(g.id_type || ''),
                                        id_number: String(g.id_number || ''),
                                        id_verified: !!g.id_verified,
                                        city: addr.city,
                                        state: addr.state,
                                        pin_code: addr.pinCode,
                                        guest_notes: pref.notes,
                                      }))
                                      setGuestPhoto({ file: null, name: '', existingDoc: null })
                                      setGuestProofFile(null)
                                      setGuestHits([])
                                    }}
                                  >
                                    <strong>{g.name}</strong> - {g.phone}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="col-sm-3 form-group">
                            <label>Customer Name *</label>
                            <input className="form-control booking-create-input" name="customer_name" value={form.customer_name} onChange={onFormChange} placeholder="Customer Name" required />
                          </div>
                          <div className="col-sm-3 form-group">
                            <label>Email</label>
                            <input className="form-control booking-create-input" name="email" value={form.email} onChange={onFormChange} type="email" placeholder="Email address" />
                          </div>
                        </div>

                        <div className="row">
                          <div className="col-sm-2 form-group">
                            <label>Gender</label>
                            <select className="form-control booking-create-input" name="gender" value={form.gender} onChange={onFormChange}>
                              <option value="">Select</option>
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="col-sm-2 form-group">
                            <label>ID Type</label>
                            <select className="form-control booking-create-input" name="id_type" value={form.id_type || ''} onChange={onFormChange}>
                              <option value="">Select Type</option>
                              <option value="Aadhaar">Aadhaar</option>
                              <option value="Passport">Passport</option>
                              <option value="Driving License">Driving License</option>
                              <option value="Voter ID">Voter ID</option>
                              <option value="PAN Card">PAN Card</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="col-sm-2 form-group">
                            <label>ID Number</label>
                            <input className="form-control booking-create-input" name="id_number" value={form.id_number || ''} onChange={onFormChange} placeholder="ID Number" />
                          </div>
                          <div className="col-sm-3 form-group">
                            <label>Upload ID Document</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input className="form-control booking-create-input" type="file" accept="application/pdf,image/*" onChange={(e) => setGuestProofFile(e.target.files?.[0] || null)} />
                            </div>
                          </div>
                          <div className="col-sm-3 form-group">
                            <label>Customer Photo</label>
                            <input className="form-control booking-create-input" type="file" accept="image/*" onChange={(e) => {
                              const file = e.target.files?.[0] || null
                              if (file) {
                                setGuestPhoto({ file, name: file.name, existingDoc: null })
                              }
                            }} />
                            <div className="text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                              {guestPhoto?.existingDoc ? (
                                <span>✓ Already uploaded: {guestPhoto.name || 'photo'}</span>
                              ) : guestPhoto?.name ? (
                                <span>New: {guestPhoto.name}</span>
                              ) : (
                                <span>Not uploaded</span>
                              )}
                              {guestPhoto?.existingDoc && (
                                <button type="button" className="btn btn-xs btn-link" style={{ marginLeft: 8, padding: 0 }} onClick={() => setGuestPhoto({ file: null, name: '', existingDoc: null })}>Clear</button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="row">
                          <div className="col-sm-3 form-group">
                            <label>City</label>
                            <input className="form-control booking-create-input" name="city" value={form.city} onChange={onFormChange} />
                          </div>
                          <div className="col-sm-3 form-group">
                            <label>State</label>
                            <input className="form-control booking-create-input" name="state" value={form.state} onChange={onFormChange} />
                          </div>
                          <div className="col-sm-3 form-group">
                            <label>Pin Code</label>
                            <input className="form-control booking-create-input" name="pin_code" value={form.pin_code} onChange={onFormChange} />
                          </div>
                          <div className="col-sm-3 form-group">
                            <label>ID Verified</label>
                            <div className="booking-id-verified-box">
                              <label className="booking-check-inline">
                                <input type="checkbox" name="id_verified" checked={!!form.id_verified} onChange={onFormChange} />
                                Verified
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="row">
                          <div className="col-sm-12 form-group">
                            <label>Notes / Preferences</label>
                            <input className="form-control booking-create-input" name="guest_notes" value={form.guest_notes} onChange={onFormChange} placeholder="Late check-in, smoking preference, etc." />
                          </div>
                        </div>


                      </div>

                  {Number(form.total_guests || 1) > 1 ? (
                    <>
                      <h5 className="booking-section-title booking-section-subtitle">Companion Details</h5>
                      <div className="alert booking-alert-info booking-inline-alert" style={{ marginTop: 0 }}>
                        Add details for each additional guest staying in this room.
                      </div>
                      {companions.map((companion, idx) => (
                        <div className="booking-companion-card" key={`companion-${idx}`}>
                          <div className="row">
                            <div className="col-sm-12"><strong>Guest #{idx + 2}</strong></div>
                            <div className="col-sm-2 form-group">
                              <label>Role</label>
                              <select className="form-control booking-create-input" value={companion.role || 'Adult'} onChange={(e) => updateCompanion(idx, 'role', e.target.value)}>
                                <option value="Adult">Adult</option>
                                <option value="Child">Child</option>
                              </select>
                            </div>
                            <div className="col-sm-4 form-group">
                              <label>Full Name</label>
                              <input className="form-control booking-create-input" value={companion.name} onChange={(e) => updateCompanion(idx, 'name', e.target.value)} placeholder="Companion Name" />
                            </div>
                            <div className="col-sm-2 form-group">
                              <label>Age</label>
                              <input className="form-control booking-create-input" type="number" min="0" max="120" value={companion.age} onChange={(e) => updateCompanion(idx, 'age', e.target.value)} />
                            </div>
                            <div className="col-sm-4 form-group">
                              <label>Gender</label>
                              <select className="form-control booking-create-input" value={companion.gender} onChange={(e) => updateCompanion(idx, 'gender', e.target.value)}>
                                <option value="">Select</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            <div className="col-sm-4 form-group">
                              <label>Relation</label>
                              <select
                                className="form-control booking-create-input"
                                value={
                                  RELATION_OPTIONS.includes(companion.relation)
                                    ? companion.relation
                                    : companion.relation
                                      ? 'Other'
                                      : ''
                                }
                                onChange={(e) => {
                                  const val = e.target.value
                                  updateCompanion(idx, 'relation', val)
                                }}
                              >
                                <option value="">Select Relation</option>
                                {RELATION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              {(!RELATION_OPTIONS.filter((o) => o !== 'Other').includes(companion.relation) && companion.relation !== '') && (
                                <input
                                  className="form-control booking-create-input"
                                  style={{ marginTop: 6 }}
                                  value={companion.relation === 'Other' ? '' : companion.relation}
                                  onChange={(e) => updateCompanion(idx, 'relation', e.target.value || 'Other')}
                                  placeholder="Specify relation (e.g. Business Partner)"
                                  autoFocus
                                />
                              )}
                            </div>
                              <div className="col-sm-4 form-group">
                                <label>ID Type</label>
                                <select className="form-control booking-create-input" value={companion.id_type} onChange={(e) => updateCompanion(idx, 'id_type', e.target.value)}>
                                  <option value="">Select</option>
                                  <option value="Aadhaar">Aadhaar</option>
                                  <option value="Passport">Passport</option>
                                  <option value="Driving License">Driving License</option>
                                  <option value="Voter ID">Voter ID</option>
                                  <option value="PAN Card">PAN Card</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                              <div className="col-sm-4 form-group">
                                <label>ID Number</label>
                                <input className="form-control booking-create-input" value={companion.id_number} onChange={(e) => updateCompanion(idx, 'id_number', e.target.value)} placeholder="ID Number" />
                              </div>
                              <div className="col-sm-4 form-group">
                                <label>Upload ID Document</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input 
                                    className="form-control booking-create-input" 
                                    type="file" 
                                    accept="application/pdf,image/*" 
                                    onChange={(e) => updateCompanionDoc(idx, (e.target.files || [])[0] || null)} 
                                  />
                                  {companionDocFiles[idx]?.existingDoc && (
                                    <span className="text-success" style={{ fontSize: '1.2em' }} title={`Already uploaded: ${companionDocFiles[idx].name}`}>✓</span>
                                  )}
                                </div>
                              </div>
                            <div className="col-sm-6 form-group">
                              <label>Phone Number</label>
                              <input className="form-control booking-create-input" value={companion.phone} onChange={(e) => updateCompanion(idx, 'phone', e.target.value)} placeholder="Companion Phone" />
                            </div>
                            <div className="col-sm-6 form-group">
                              <label>Notes</label>
                              <input className="form-control booking-create-input" value={companion.notes} onChange={(e) => updateCompanion(idx, 'notes', e.target.value)} placeholder="Special note" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : null}


                  <div className="row">
                    <div className="col-sm-12">
                      {rooms.length === 0 ? (
                        <div className="alert booking-alert-warning">
                          No available rooms found for selected dates.
                        </div>
                      ) : (
                        <div className="alert booking-alert-success">
                          {rooms.length} room(s) available. Select one from the Room dropdown in Phase 2.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="booking-section">
                  <h5 className="booking-section-title">Add Services / Charges</h5>
                  <div className="row booking-row-gap">
                    <div className="col-sm-8">
                      <label>Quick Select Predefined Service</label>
                      <div className="input-group">
                        <select className="form-control booking-create-input" value={quickService} onChange={(e) => setQuickService(e.target.value)}>
                          <option value="">-- Quick Select Predefined Service --</option>
                          {PREDEFINED_SERVICES.map((s) => <option key={s.name} value={s.name}>{s.name} (₹{s.unit_price})</option>)}
                        </select>
                        <span className="input-group-btn">
                          <button type="button" className="btn btn-default booking-neutral-btn" onClick={addQuickService}>Add</button>
                        </span>
                      </div>
                    </div>
                    <div className="col-sm-4 booking-custom-service-wrap">
                      <button type="button" className="btn btn-default booking-neutral-btn" onClick={addServiceRow}>+ Add Custom Service</button>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-bordered table-striped booking-service-table">
                      <thead>
                        <tr>
                          <th>Active Items</th>
                          <th>Service</th>
                          <th>Unit Price</th>
                          <th>Qty</th>
                          <th>Subtotal</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {services.map((s) => {
                          const rowSub = Number(s.unit_price || 0) * Number(s.qty || 0)
                          return (
                            <tr key={s.id}>
                              <td><input type="checkbox" checked={s.active} onChange={(e) => updateServiceRow(s.id, 'active', e.target.checked)} /></td>
                              <td><input className="form-control booking-create-input" value={s.item_name} onChange={(e) => updateServiceRow(s.id, 'item_name', e.target.value)} placeholder="Item Name" /></td>
                              <td><input className="form-control booking-create-input" type="number" min="0" step="0.01" value={s.unit_price} onChange={(e) => updateServiceRow(s.id, 'unit_price', e.target.value)} /></td>
                              <td><input className="form-control booking-create-input" type="number" min="1" step="1" value={s.qty} onChange={(e) => updateServiceRow(s.id, 'qty', e.target.value)} /></td>
                              <td>₹ {rowSub.toFixed(2)}</td>
                              <td><button className="btn btn-xs btn-danger" type="button" onClick={() => removeServiceRow(s.id)}>Remove</button></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Show Adjustments section in BOTH create and edit mode */}
                  <>
                    <h5 className="booking-section-title booking-section-subtitle">Adjustments</h5>
                      <div className="row">
                        <div className="col-sm-4 form-group">
                          <label>Offer Selection</label>
                          <select className="form-control booking-create-input" name="offer_source" value={form.offer_source} onChange={onFormChange}>
                            <option value="none">No Offer</option>
                            {defaultOffer.enabled ? (
                              <option value="default">Default Offer ({defaultOffer.name} - {Number(defaultOffer.percent || 0).toFixed(2)}%)</option>
                            ) : null}
                            <option value="custom">Custom Offer</option>
                          </select>
                        </div>
                        <div className="col-sm-4 form-group">
                          <label>Offer Name</label>
                          <input
                            className="form-control booking-create-input"
                            name="custom_offer_name"
                            value={offerNameDisplay}
                            onChange={onFormChange}
                            placeholder={form.offer_source === 'none' ? 'No offer selected' : ''}
                            disabled={form.offer_source !== 'custom'}
                          />
                        </div>
                        <div className="col-sm-4 form-group">
                          <label>Offer %</label>
                          <div className="input-group">
                            <input
                              className="form-control booking-create-input"
                              type="number"
                              min="0"
                              step="0.01"
                              name="custom_offer_pct"
                              value={offerPctDisplay}
                              onChange={onFormChange}
                              placeholder={form.offer_source === 'none' ? '0' : ''}
                              disabled={form.offer_source !== 'custom'}
                            />
                            <span className="input-group-addon">%</span>
                          </div>
                        </div>
                      </div>

                      {form.offer_source === 'default' ? (
                        <div className="row">
                          <div className="col-sm-12">
                            <div className="alert booking-alert-info booking-inline-alert" style={{ marginTop: -6 }}>
                              Default offer is auto-filled from Settings.
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="row">
                        <div className="col-sm-4 form-group">
                          <label>Manual Discount</label>
                          <div className="input-group">
                            <input className="form-control booking-create-input" type="number" min="0" step="0.01" name="manual_discount_pct" value={form.manual_discount_pct} onChange={onFormChange} />
                            <span className="input-group-addon">%</span>
                          </div>
                        </div>
                        <div className="col-sm-4 form-group">
                          <label>Apply On</label>
                          <select className="form-control booking-create-input" name="apply_on" value={form.apply_on} onChange={onFormChange}>
                            <option value="before_tax">Before Tax</option>
                            <option value="after_tax">After Tax</option>
                          </select>
                        </div>
                      </div>
                  </>

                  <h5 className="booking-section-title booking-section-subtitle">Charges Summary</h5>
                  <div className="row booking-row-gap">
                    <div className="col-sm-12">
                      <div className="alert booking-alert-info">
                        <span style={{ marginLeft: 14 }}>
                          <strong>Selected Room:</strong> {selectedRoomLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                    <div className="row">
                      <div className="col-sm-3 form-group">
                        <label>Base Rate *</label>
                        <input className="form-control booking-create-input" type="number" min="0" step="0.01" name="base_rate" value={form.base_rate} onChange={onFormChange} required />
                      </div>
                      <div className="col-sm-3 form-group">
                        <label>Advance Payment</label>
                        <input className="form-control booking-create-input" type="number" min="0" step="0.01" name="advance_payment" value={form.advance_payment} onChange={onFormChange} />
                      </div>
                      <div className="col-sm-3 form-group">
                        <label>Payment Mode</label>
                        <select className="form-control booking-create-input" name="payment_mode" value={form.payment_mode} onChange={onFormChange}>
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="upi">UPI</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="cheque">Cheque</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="col-sm-3 form-group">
                        <label>Total to Collect</label>
                        <div className="form-control booking-total-box">₹ {totalToCollect.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-sm-3 form-group">
                        <label>Rate Plan</label>
                        <select className="form-control booking-create-input" name="rate_plan" value={form.rate_plan} onChange={onFormChange}>
                          <option value="">Select plan</option>
                          {ratePlans.map(plan => (
                            <option key={plan.id} value={plan.name}>
                              {plan.name} ({plan.meal_plan})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-sm-3 form-group">
                        <label>Booking Status {isEditMode && '*'}</label>
                        <select className="form-control booking-create-input" name="status" value={form.status} onChange={onFormChange}>
                          <option value="reserved">Reserved</option>
                          <option value="checked_in">Checked In</option>
                          <option value="occupied">Occupied</option>
                          <option value="checked_out">Checked Out</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      {/* Only show simple Discount Amount/Reason in CREATE mode */}
                      {!isEditMode && (
                        <>
                          <div className="col-sm-3 form-group">
                            <label>Discount Amount</label>
                            <input className="form-control booking-create-input" type="number" min="0" step="0.01" name="discount" value={form.discount} onChange={onFormChange} />
                          </div>
                          <div className="col-sm-3 form-group">
                            <label>Discount Reason</label>
                            <input className="form-control booking-create-input" name="discount_reason" value={form.discount_reason} onChange={onFormChange} placeholder={Number(form.discount || 0) > 0 ? 'Required when discount > 0' : 'Optional'} />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="booking-receipt-container">
                      <div className="row">
                        <div className="col-sm-6">
                          <p className="booking-receipt-line"><span>Room Charges</span> <span>₹ {roomSubtotal.toFixed(2)}</span></p>
                          <p className="booking-receipt-line"><span>Extra Guest Charges</span> <span>₹ {extraGuestSubtotal.toFixed(2)}</span></p>
                          <p className="booking-receipt-line"><span>Services / Extras</span> <span>₹ {servicesSubtotal.toFixed(2)}</span></p>
                          <p className="booking-receipt-line booking-receipt-subtotal"><span>Subtotal (Before Discount)</span> <span>₹ {subtotal.toFixed(2)}</span></p>
                          <p className="booking-receipt-line booking-receipt-discount"><span>Discount Applied</span> <span>- ₹ {discountAmount.toFixed(2)}</span></p>
                          <hr className="booking-receipt-divider" />
                          <p className="booking-receipt-line booking-receipt-subtotal"><span>Taxable Amount</span> <span>₹ {taxableBase.toFixed(2)}</span></p>
                          <p className="booking-receipt-line text-muted"><small>Tax Policy: {hotelTaxPolicy.taxType} {hotelTaxPolicy.taxPercent.toFixed(2)}%</small></p>
                        </div>
                        <div className="col-sm-6">
                          <p className="booking-receipt-line"><span>Taxes ({hotelTaxRate.toFixed(2)}%)</span> <span>₹ {taxAmount.toFixed(2)}</span></p>
                          <p className="booking-receipt-line booking-receipt-total"><span>Total to Collect</span> <span>₹ {totalToCollect.toFixed(2)}</span></p>
                          <hr className="booking-receipt-divider" />
                          <div className="form-group" style={{ marginTop: 12 }}>
                            <label>Special Requests / Notes</label>
                            <input className="form-control booking-create-input" name="special_requests" value={form.special_requests} onChange={onFormChange} placeholder="Any specific requirements" />
                          </div>
                        </div>
                      </div>
                    </div>

                      <div className="booking-submit-wrap">
                        <button className="btn btn-add booking-submit-btn" type="submit" disabled={isLoadingBooking || saving}>
                          {isLoadingBooking || saving ? 'Processing...' : (isEditMode ? 'Update Booking' : 'Create Booking')}
                        </button>
                      </div>
                    </div>
                  </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
