import * as XLSX from 'xlsx'

export function formatLocalDate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function defaultDateRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from_date: formatLocalDate(first), to_date: formatLocalDate(now) }
}

export const DATE_PRESETS = [
  {
    label: 'Today',
    getRange: () => {
      const today = new Date()
      const d = formatLocalDate(today)
      return { from_date: d, to_date: d }
    }
  },
  {
    label: 'Yesterday',
    getRange: () => {
      const y = new Date()
      y.setDate(y.getDate() - 1)
      const d = formatLocalDate(y)
      return { from_date: d, to_date: d }
    }
  },
  {
    label: 'This Month',
    getRange: () => {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from_date: formatLocalDate(first), to_date: formatLocalDate(now) }
    }
  },
  {
    label: 'Last 30 Days',
    getRange: () => {
      const now = new Date()
      const past = new Date()
      past.setDate(now.getDate() - 30)
      return { from_date: formatLocalDate(past), to_date: formatLocalDate(now) }
    }
  },
  {
    label: 'Last Month',
    getRange: () => {
      const now = new Date()
      const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from_date: formatLocalDate(firstDayPrev), to_date: formatLocalDate(lastDayPrev) }
    }
  },
  {
    label: 'This Year',
    getRange: () => {
      const now = new Date()
      const first = new Date(now.getFullYear(), 0, 1)
      return { from_date: formatLocalDate(first), to_date: formatLocalDate(now) }
    }
  }
]

export function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return '0'
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value))
}

export function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return '₹0.00'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

export function toLabel(key = '') {
  const map = {
    total_revenue: 'Total Realized Revenue',
    room_revenue: 'Room Charges',
    service_revenue: 'Extra Services / POS',
    tax_collected: 'Tax Collected (GST)',
    compared_to_prev_period_pct: 'Growth vs Past Period (%)',
    active_bookings: 'Active Bookings Count',
    occupancy_pct: 'Occupancy Rate (%)',
    total_room_nights: 'Total Available Nights',
    occupied_room_nights: 'Occupied Room Nights',
    vacant_room_nights: 'Vacant Room Nights',
    average_length_of_stay: 'Average Stay (Nights)',
    total_rooms: 'Inventory Rooms',
    days_in_selected_period: 'Days in Range',
    rooms_in_report: 'Active Rooms',
    top_earning_room: 'Top Earning Room',
    room_number: 'Room No.',
    room_type: 'Room Category',
    bookings_count: 'Total Bookings',
    average_revenue_per_night: 'ADR (Avg Daily Rate)',
    outstanding_amount: 'Total Outstanding Balance',
    overdue_bookings: 'Overdue Folios',
    pending_bookings: 'Pending Invoices',
    booking_id: 'Booking ID',
    booking_code: 'Booking Reference',
    customer_name: 'Guest Full Name',
    room: 'Assigned Room',
    due_amount: 'Due Balance',
    days_overdue: 'Overdue (Days)',
    status: 'Booking Status',
    cancelled_bookings: 'Cancelled Bookings',
    refund_amount: 'Total Refund Amount',
    top_reason: 'Primary Cancellation Reason',
    check_in_date: 'Check-In Date',
    check_out_date: 'Check-Out Date',
    cancellation_reason: 'Cancellation Reason',
    refund_option: 'Refund Method',
    date: 'Date',
    collected_amount: 'Collected Amount',
    payments_count: 'Transactions Count',
    running_total: 'Cumulative Total',
    pending_amount: 'Pending Dues'
  }
  if (map[key]) return map[key]
  return key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

export function downloadCSV(rows, filename = 'hms-report.csv') {
  if (!rows || rows.length === 0) return
  const headers = Object.keys(rows[0])
  const escapeCell = (v) => {
    const cell = `${v ?? ''}`.replace(/"/g, '""')
    return `"${cell}"`
  }
  const csv = [headers.map(toLabel).join(','), ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function downloadXLSX(rows, filename = 'hms-report.xlsx') {
  if (!rows || rows.length === 0) return
  const cleanRows = rows.map(r => {
    const formatted = {}
    Object.keys(r).forEach(k => {
      formatted[toLabel(k)] = r[k]
    })
    return formatted
  })
  const sheet = XLSX.utils.json_to_sheet(cleanRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Hotel Report')
  XLSX.writeFile(wb, filename)
}
