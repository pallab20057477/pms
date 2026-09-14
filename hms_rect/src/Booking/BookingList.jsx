import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { getWithAuth, postWithAuth } from '../api'
import toast from 'react-hot-toast'
import './BookingListModern.css'

const formatINR = (value) => `₹ ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function normalizeStatus(status) {
  return String(status || '').toLowerCase().replaceAll('-', '_')
}

function displayStatus(status) {
  const s = normalizeStatus(status)
  if (s === 'checked_in') return 'Checked-in'
  if (s === 'occupied') return 'Occupied'
  return s ? s.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : '-'
}

function statusBadgeClass(status) {
  const s = normalizeStatus(status)
  if (s === 'reserved') return 'label label-info'
  if (s === 'checked_in') return 'label label-success'
  if (s === 'occupied') return 'label label-success'
  if (s === 'completed') return 'label label-primary'
  if (s === 'cancelled') return 'label label-danger'
  return 'label label-default'
}

export default function BookingList({ preset = 'all' }) {
  const token = useSelector((s) => s.auth.accesstoken)
  const navigate = useNavigate()
  const location = useLocation()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [refundOption, setRefundOption] = useState('none')
  const [refundAmount, setRefundAmount] = useState('0')
  const [openDropdownId, setOpenDropdownId] = useState(null)

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Check-in modal state
  const [checkInModal, setCheckInModal] = useState(false)
  const [checkInBookingId, setCheckInBookingId] = useState(null)
  const [checkInProcessing, setCheckInProcessing] = useState(false)

  const pageMeta = useMemo(() => {
    if (location.pathname === '/folio/running' || preset === 'checkins') {
      return {
        title: 'Running Folios',
        subtitle: 'Active in-house stays and current folio balances',
        panelTitle: 'Running Folio List',
        panelSubtitle: 'Monitor active checked-in bookings and continue folio operations.',
      }
    }
    if (preset === 'checkout') {
      return {
        title: 'Checkout Queue',
        subtitle: 'Bookings due for checkout actions',
        panelTitle: 'Checkout Bookings',
        panelSubtitle: 'Track departures and complete final settlement tasks.',
      }
    }
    if (preset === 'reserved') {
      return {
        title: 'Reserved Bookings',
        subtitle: 'Upcoming reservations awaiting check-in',
        panelTitle: 'Reserved List',
        panelSubtitle: 'Review upcoming reservations before arrival.',
      }
    }
    if (preset === 'cancelled') {
      return {
        title: 'Cancelled Bookings',
        subtitle: 'Cancelled records and closure status',
        panelTitle: 'Cancelled List',
        panelSubtitle: 'Audit cancelled bookings and related actions.',
      }
    }
    return {
      title: 'Booking Management',
      subtitle: 'Manage bookings',
      panelTitle: 'Booking List',
      panelSubtitle: 'Track reservations, check-ins, folios, and invoices from one place.',
    }
  }, [location.pathname, preset])

  useEffect(() => {
    if (preset === 'reserved') setStatus('reserved')
    else if (preset === 'cancelled') setStatus('cancelled')
    else if (preset === 'checkins') setStatus('checked_in')
    else setStatus('')
  }, [preset])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = { page, page_size: pageSize }
      if (query.trim()) params.q = query.trim()
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      if (status) params.status = status
      if (preset === 'checkins') params.today = 'checkin'
      if (preset === 'checkout') params.today = 'checkout'

      const res = await getWithAuth('/bookings', token, { params })
      const body = res.data || {}
      const items = Array.isArray(body.items) ? body.items : []
      const normalized = preset === 'checkins'
        ? items.filter((b) => normalizeStatus(b.status) === 'checked_in')
        : items
      setRows(normalized)
      setTotal(preset === 'checkins' ? normalized.length : Number(body.total || 0))
    } catch (e) {
      console.error(e)
      toast.error('Failed to load bookings')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, query, dateFrom, dateTo, status, preset])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])
  const reservedCount = useMemo(() => rows.filter((b) => normalizeStatus(b.status) === 'reserved').length, [rows])
  const checkedInCount = useMemo(() => rows.filter((b) => ['checked_in', 'occupied'].includes(normalizeStatus(b.status))).length, [rows])
  const cancelledCount = useMemo(() => rows.filter((b) => normalizeStatus(b.status) === 'cancelled').length, [rows])

  function openCheckinModal(bookingId) {
    setCheckInBookingId(bookingId)
    setCheckInModal(true)
  }

  async function confirmCheckIn() {
    if (!checkInBookingId) return
    setCheckInProcessing(true)
    try {
      await postWithAuth(`/bookings/${checkInBookingId}/checkin`, {}, token)
      toast.success('Check-in successful!')
      setCheckInModal(false)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to check-in')
    } finally {
      setCheckInProcessing(false)
    }
  }

  async function doCheckout(id) {
    try {
      // Fetch authoritative balance before checkout
      const balRes = await getWithAuth(`/folio/${id}/balance`, token)
      const balance = balRes?.data?.current_balance ?? null
      if (balance === null) {
        toast.error('Could not determine current balance. Please try again.')
        return
      }
      if (balance > 0.01) {
        toast.error(`Pending amount ₹${Number(balance).toFixed(2)} must be cleared before checkout.`)
        return
      }
      // Perform checkout
      await postWithAuth(`/bookings/${id}/checkout`, {}, token)
      toast.success('Checked-out successfully. Late checkout charge (if applicable) has been added to the folio.')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to checkout')
    }
  }

  async function doGenerateInvoice(id) {
    try {
      const invoiceRes = await postWithAuth(`/invoices/${id}`, {}, token)
      const invoiceId = invoiceRes?.data?.invoice_id || invoiceRes?.data?.id || id
      const pdfRes = await getWithAuth(`/invoices/${invoiceId}/pdf`, token, {
        responseType: 'blob',
        params: { v: Date.now() },
      })
      const blobUrl = window.URL.createObjectURL(new Blob([pdfRes.data], { type: 'application/pdf' }))
      window.open(blobUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000)
      toast.success('Invoice generated')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to generate invoice')
    }
  }

  function openCancel(row) {
    setCancelTarget(row)
    setCancelReason('')
    setRefundOption('none')
    setRefundAmount(String(row.advance_payment || 0))
    setCancelOpen(true)
  }

  async function submitCancel() {
    if (!cancelTarget) return
    if (!cancelReason.trim()) {
      toast.error('Cancellation reason is required')
      return
    }
    try {
      await postWithAuth(`/bookings/${cancelTarget.id}/cancel`, {
        cancellation_reason: cancelReason.trim(),
        refund_option: refundOption,
        refund_amount: Number(refundAmount || 0),
      }, token)
      toast.success('Booking cancelled')
      setCancelOpen(false)
      setCancelTarget(null)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to cancel booking')
    }
  }


  return (
    <>
      <section className="content-header">
        <div className="header-icon"><i className="fa-solid fa-list-check"></i></div>
        <div className="header-title">
          <h1>{pageMeta.title}</h1>
          <small>{pageMeta.subtitle}</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="row booking-kpi-row">
              <div className="col-sm-3 col-xs-6">
                <div className="booking-kpi-card booking-kpi-total">
                  <div className="booking-kpi-label">Total Listed</div>
                  <div className="booking-kpi-value">{total}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="booking-kpi-card booking-kpi-reserved">
                  <div className="booking-kpi-label">Reserved</div>
                  <div className="booking-kpi-value">{reservedCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="booking-kpi-card booking-kpi-checkedin">
                  <div className="booking-kpi-label">Checked-in</div>
                  <div className="booking-kpi-value">{checkedInCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="booking-kpi-card booking-kpi-cancelled">
                  <div className="booking-kpi-label">Cancelled</div>
                  <div className="booking-kpi-value">{cancelledCount}</div>
                </div>
              </div>
            </div>

            <div className="panel panel-bd lobidrag booking-list-panel">
              <div className="panel-heading booking-list-heading">
                <div>
                  <h4 className="booking-list-title">{pageMeta.panelTitle}</h4>
                  <p className="booking-list-subtitle">{pageMeta.panelSubtitle}</p>
                </div>
                <button className="btn btn-add booking-new-btn" onClick={() => navigate('/booking/create')}>
                  <i className="fa-solid fa-plus"></i> New Booking
                </button>
              </div>
              <div className="panel-body">
                <div className="row booking-filter-row">
                  <div className="col-sm-3">
                    <input className="form-control booking-list-input" placeholder="Search booking/customer/room" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                  <div className="col-sm-2">
                    <input className="form-control booking-list-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div className="col-sm-2">
                    <input className="form-control booking-list-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                  <div className="col-sm-2">
                    <select className="form-control booking-list-input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
                      <option value="">All Status</option>
                      <option value="reserved">Reserved</option>
                      <option value="checked_in">Checked-in</option>
                      <option value="occupied">Occupied</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="col-sm-1">
                    <select className="form-control booking-list-input" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <div className="col-sm-2 booking-filter-actions">
                    <button className="btn btn-primary booking-apply-btn" onClick={() => { setPage(1); load() }}>Apply</button>
                    <button className="btn btn-default booking-reset-btn" onClick={() => { setQuery(''); setDateFrom(''); setDateTo(''); setStatus(''); setPage(1); setPageSize(20) }}>Reset</button>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-bordered table-striped table-hover booking-list-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Customer</th>
                        <th>Room</th>
                        <th>Source</th>
                        <th>Pax</th>
                        <th>Check-in</th>
                        <th>Check-out</th>
                        <th>Status</th>
                        <th>Total</th>
                        <th>Due</th>
                        <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={12} className="text-center booking-loading"><i className="fa-solid fa-circle-notch fa-spin booking-spin"></i> Loading...</td></tr>
                      ) : rows.length === 0 ? (
                        <tr><td colSpan={12} className="text-center text-muted">No bookings found</td></tr>
                      ) : rows.map((b) => (
                        <tr key={b.id}>
                          <td>{b.booking_code || `#${b.id}`}</td>
                          <td>{b.guest_name || `Customer ${b.guest_id}`}</td>
                          <td>
                            <strong>{b.room_number || b.room_id}</strong>
                            <div className="text-muted" style={{ fontSize: 11 }}>{typeof b.room_type === 'object' ? (b.room_type?.name || b.room_type_details?.name || '-') : (b.room_type || '-')}</div>
                          </td>
                          <td>
                            {b.booking_source ? (
                              <span className="booking-badge-source">{b.booking_source}</span>
                            ) : '-'}
                          </td>
                          <td>{b.total_guests || 1} <i className="fa-solid fa-user" style={{ fontSize: 10, color: '#999' }}></i></td>
                          <td>{b.check_in_date ? new Date(b.check_in_date).toLocaleDateString('en-GB') : '-'}</td>
                          <td>{b.check_out_date ? new Date(b.check_out_date).toLocaleDateString('en-GB') : '-'}</td>
                          <td><span className={statusBadgeClass(b.status)}>{displayStatus(b.status)}</span></td>
                          <td>{formatINR(b.grand_total ?? b.total_amount ?? 0)}</td>
                          <td>{formatINR(normalizeStatus(b.status) === 'cancelled' ? 0 : Math.max(0, b.current_balance ?? b.balance_due ?? 0))}</td>
                          <td style={{ position: 'relative', textAlign: 'center' }}>
                            <button 
                              className="btn btn-default btn-xs booking-dropdown-btn" 
                              onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === b.id ? null : b.id); }}
                            >
                              <i className="fa-solid fa-ellipsis-vertical"></i> Actions
                            </button>
                            
                            {openDropdownId === b.id && (
                              <div className="booking-actions-dropdown" onClick={(e) => e.stopPropagation()}>
                                <ul>
                                  {normalizeStatus(b.status) === 'reserved' && (
                                    <li>
                                      <button onClick={() => { setOpenDropdownId(null); openCheckinModal(b.id) }} className="text-success">
                                        <i className="fa-solid fa-key"></i> Check In
                                      </button>
                                    </li>
                                  )}
                                  {normalizeStatus(b.status) === 'checked_in' && (
                                    <li>
                                      <button onClick={() => { setOpenDropdownId(null); doCheckout(b.id) }} className="text-primary">
                                        <i className="fa-solid fa-person-walking-luggage"></i> Check Out Now
                                      </button>
                                    </li>
                                  )}
                                  <li>
                                    <button onClick={() => {
                                      setOpenDropdownId(null);
                                      navigate(`/booking/create?edit=true&booking_id=${b.id}&room_id=${b.room_id || ''}&guest_id=${b.guest_id || ''}&check_in=${b.check_in_date}&check_out=${b.check_out_date}`);
                                    }} className="text-warning">
                                      <i className="fa-solid fa-pen"></i> Edit Booking
                                    </button>
                                  </li>
                                  <li>
                                    <button onClick={() => { setOpenDropdownId(null); navigate(`/booking/${b.booking_code}/folio`) }} className="text-info">
                                      <i className="fa-solid fa-file-invoice"></i> View Folio
                                    </button>
                                  </li>
                                  <li>
                                    <button onClick={() => { setOpenDropdownId(null); doGenerateInvoice(b.id) }}>
                                      <i className="fa-solid fa-print"></i> Generate Invoice
                                    </button>
                                  </li>
                                  {normalizeStatus(b.status) !== 'cancelled' && (
                                    <li>
                                      <button onClick={() => { setOpenDropdownId(null); openCancel(b) }} className="text-danger">
                                        <i className="fa-solid fa-ban"></i> Cancel Booking
                                      </button>
                                    </li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-center booking-pagination-wrap">
                  <ul className="pagination pagination-sm booking-pagination-list">
                    <li className={page === 1 ? 'disabled' : ''}><button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button></li>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <li key={i} className={page === i + 1 ? 'active' : ''}><button className="page-link" onClick={() => setPage(i + 1)}>{i + 1}</button></li>
                    ))}
                    <li className={page === totalPages ? 'disabled' : ''}><button className="page-link" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {cancelOpen && (
        <div className="booking-modal-overlay" onClick={() => setCancelOpen(false)}>
          <div className="booking-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="booking-modal-head">
              <h4>Cancel Booking</h4>
              <button className="btn btn-default btn-xs" onClick={() => setCancelOpen(false)}>x</button>
            </div>
            <div className="booking-modal-body">
              <div className="form-group">
                <label>Cancellation Reason *</label>
                <textarea className="form-control booking-list-input" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </div>
              <div className="row">
                <div className="col-sm-6 form-group">
                  <label>Refund Option</label>
                  <select className="form-control booking-list-input" value={refundOption} onChange={(e) => setRefundOption(e.target.value)}>
                    <option value="none">None</option>
                    <option value="partial">Partial</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                <div className="col-sm-6 form-group">
                  <label>Refund Amount</label>
                  <input className="form-control booking-list-input" type="number" min="0" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} disabled={refundOption === 'none'} />
                </div>
              </div>
              <div className="booking-modal-actions">
                <button className="btn btn-default" onClick={() => setCancelOpen(false)}>Close</button>
                <button className="btn btn-danger" onClick={submitCancel}>Confirm Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Check-in Confirmation Modal */}
      {checkInModal && (
        <div className="booking-modal-overlay" onClick={() => setCheckInModal(false)}>
          <div className="booking-modal-shell" onClick={(e) => e.stopPropagation()}>
            <div className="booking-modal-card" style={{ maxWidth: 450, borderRadius: 12, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
              <div className="booking-modal-body text-center" style={{ padding: '32px 24px' }}>
                <div style={{ 
                  width: 64, height: 64, borderRadius: '50%', background: '#e0f2f1', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  margin: '0 auto 20px auto', color: '#009688', fontSize: 28 
                }}>
                  <i className="fa-solid fa-user-check"></i>
                </div>
                <h3 style={{ margin: '0 0 12px 0', color: '#333', fontWeight: 600 }}>Confirm Check-In</h3>
                <p style={{ color: '#666', marginBottom: 24, fontSize: 14, lineHeight: '1.5' }}>
                  You are about to securely check in this guest. Please ensure that identity and payment details have been verified at the front desk.
                </p>
                
                <div style={{ display: 'flex', gap: 12 }}>
                  <button 
                    className="btn btn-default" 
                    style={{ flex: 1, padding: '12px 0', borderRadius: 8, fontWeight: 500, background: '#f5f5f5', border: 'none' }}
                    onClick={() => setCheckInModal(false)}
                    disabled={checkInProcessing}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-success" 
                    style={{ flex: 1, padding: '12px 0', borderRadius: 8, fontWeight: 600, background: '#009688', border: 'none', boxShadow: '0 4px 12px rgba(0,150,136,0.3)' }}
                    onClick={confirmCheckIn}
                    disabled={checkInProcessing}
                  >
                    {checkInProcessing ? (
                      <><i className="fa fa-spinner fa-spin"></i> Checking in...</>
                    ) : (
                      'Confirm Check-In'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
