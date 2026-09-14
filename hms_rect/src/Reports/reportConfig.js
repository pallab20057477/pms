// reportConfig.js - Hotel Management System Report Configurations
export const REPORT_TYPES = {
  revenue: {
    key: 'revenue',
    title: 'Revenue & Financial Report',
    subtitle: 'Daily realized revenue, tax collection (GST), and payment transactions',
    endpoint: '/reports/revenue',
    icon: 'fa-solid fa-indian-rupee-sign',
    color: '#008234',
    category: 'Finance',
  },
  occupancy: {
    key: 'occupancy',
    title: 'Room Occupancy & Utilization',
    subtitle: 'Occupied vs vacant room nights, utilization rates, and length of stay',
    endpoint: '/reports/occupancy',
    icon: 'fa-solid fa-bed',
    color: '#006CE4',
    category: 'Operations',
  },
  'room-revenue': {
    key: 'room-revenue',
    title: 'Room-wise Performance',
    subtitle: 'Revenue generated per room number, room category, and average daily rates',
    endpoint: '/reports/room-wise',
    icon: 'fa-solid fa-door-open',
    color: '#4F46E5',
    category: 'Inventory',
  },
  'pending-payments': {
    key: 'pending-payments',
    title: 'Outstanding & Pending Dues',
    subtitle: 'Unsettled guest folios, overdue checkouts, and pending balances',
    endpoint: '/reports/pending-payments',
    icon: 'fa-solid fa-clock-rotate-left',
    color: '#E05600',
    category: 'Accounts',
  },
  cancellation: {
    key: 'cancellation',
    title: 'Cancellations & Refunds',
    subtitle: 'Cancelled bookings, refund deductions, and primary cancellation reasons',
    endpoint: '/reports/cancellations',
    icon: 'fa-solid fa-ban',
    color: '#D92D20',
    category: 'Audit',
  },
  'guest-history': {
    key: 'guest-history',
    title: 'Guest History & CRM',
    subtitle: 'Guest stay frequency, total lifetime expenditure, and repeat visitor tracking',
    endpoint: '/reports/guest-history',
    icon: 'fa-solid fa-users',
    color: '#0284C7',
    category: 'CRM',
  },
  housekeeping: {
    key: 'housekeeping',
    title: 'Housekeeping Metrics',
    subtitle: 'Rooms cleaned, average cleaning duration, and staff task tracking',
    endpoint: '/reports/housekeeping',
    icon: 'fa-solid fa-broom',
    color: '#0891B2',
    category: 'Operations',
  },
  'staff-performance': {
    key: 'staff-performance',
    title: 'Staff Performance',
    subtitle: 'Employee shift attendance, completed assignments, and overall productivity',
    endpoint: '/reports/staff-performance',
    icon: 'fa-solid fa-user-tie',
    color: '#4338CA',
    category: 'HR',
  },
}

export const REPORT_CARDS = [
  REPORT_TYPES.revenue,
  REPORT_TYPES.occupancy,
  REPORT_TYPES['room-revenue'],
  REPORT_TYPES['pending-payments'],
  REPORT_TYPES.cancellation,
  REPORT_TYPES['guest-history'],
  REPORT_TYPES.housekeeping,
  REPORT_TYPES['staff-performance'],
]

export function getReportType(type) {
  return REPORT_TYPES[type] || REPORT_TYPES.revenue
}
