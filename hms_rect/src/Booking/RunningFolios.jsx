import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { getWithAuth, postWithAuth } from '../api';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import './RunningFoliosModern.css';

const formatINR = (val) =>
  `₹ ${Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getStatusBadge = (status) => {
  const s = String(status || '').toLowerCase().replace(/[\s-]/g, '_');
  if (s === 'checked_in' || s === 'in_house') return <span className="ota-status-pill status-checkedin">Checked In</span>;
  if (s === 'completed' || s === 'checked_out') return <span className="ota-status-pill status-completed">Completed</span>;
  if (s === 'reserved') return <span className="ota-status-pill status-reserved">Reserved</span>;
  if (s === 'cancelled' || s === 'canceled') return <span className="ota-status-pill status-cancelled">Cancelled</span>;
  return <span className="ota-status-pill">{status}</span>;
};

export default function RunningFolios() {
  const navigate = useNavigate();
  const token = useSelector((state) => state.auth.accesstoken);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allBookings, setAllBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [balances, setBalances] = useState({});

  // Search & Filter
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('in_house'); // in_house, all, due, settled, completed
  const [openDropdownId, setOpenDropdownId] = useState(null);

  // Quick Payment / Settlement Modal
  const [payBooking, setPayBooking] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('upi');
  const [payReference, setPayReference] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (!e.target.closest('.ota-row-actions') && !e.target.closest('.ota-dropdown-box')) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const [bookingsRes, roomsRes] = await Promise.all([
        getWithAuth('/bookings?page=1&page_size=200', token),
        getWithAuth('/rooms', token).catch(() => ({ data: [] })),
      ]);

      const items = bookingsRes?.data?.items || bookingsRes?.data?.data || [];
      setAllBookings(items);
      setRooms(roomsRes?.data?.data || roomsRes?.data || []);

      // Fetch authoritative balances for bookings from /folio/:id/balance
      const balMap = {};
      await Promise.all(
        items.slice(0, 50).map(async (b) => {
          try {
            const balRes = await getWithAuth(`/folio/${b.id}/balance`, token);
            if (balRes?.data) {
              balMap[b.id] = balRes.data;
            }
          } catch {
            const total = Number(b.total_amount || b.net_amount || b.base_rate || 0);
            const paid = Number(b.advance_payment || b.advance || 0);
            balMap[b.id] = {
              gross: total,
              advance: paid,
              payments_total: 0,
              current_balance: Math.max(0, total - paid),
            };
          }
        })
      );
      setBalances(balMap);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load folios');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const roomMap = useMemo(() => {
    const map = {};
    for (const r of rooms) {
      map[r.id] = r;
      if (r.room_number) map[r.room_number] = r;
    }
    return map;
  }, [rooms]);

  const list = useMemo(() => {
    return allBookings.map((b) => {
      const bal = balances[b.id];
      const room = roomMap[b.room_id] || roomMap[b.room_number] || {};
      const checkIn = b.check_in_date ? String(b.check_in_date).slice(0, 10) : '-';
      const checkOut = b.check_out_date ? String(b.check_out_date).slice(0, 10) : '-';

      let nights = 1;
      if (b.check_in_date && b.check_out_date) {
        const d1 = new Date(b.check_in_date);
        const d2 = new Date(b.check_out_date);
        nights = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
      }

      const isCancelled = String(b.status || '').toLowerCase().replace(/[\s-]/g, '_') === 'cancelled';
      const totalCharges = isCancelled ? 0 : (bal?.gross !== undefined ? Number(bal.gross) : Number(b.total_amount || b.base_rate || 0));
      const advance = bal?.advance !== undefined ? Number(bal.advance) : Number(b.advance_payment || b.advance || 0);
      const paymentsTotal = bal?.payments_total !== undefined ? Number(bal.payments_total) : 0;
      const totalPayments = advance + paymentsTotal;
      const balanceDue = isCancelled ? 0 : (bal?.current_balance !== undefined ? Math.max(0, Number(bal.current_balance)) : Math.max(0, totalCharges - totalPayments));

      return {
        ...b,
        roomNumber: b.room_number || room.room_number || b.room_id || 'Room',
        roomType: room.room_type || b.room_type || 'Standard',
        totalCharges,
        totalPayments,
        balanceDue,
        checkIn,
        checkOut,
        nights,
        isCancelled,
        isInHouse: ['checked_in', 'in_house', 'active'].includes(String(b.status || '').toLowerCase()),
        isCompleted: ['completed', 'checked_out'].includes(String(b.status || '').toLowerCase()),
      };
    });
  }, [allBookings, balances, roomMap]);

  // Counts
  const inHouseList = useMemo(() => list.filter((b) => b.isInHouse), [list]);
  const dueList = useMemo(() => list.filter((b) => b.balanceDue > 0.01), [list]);
  const settledList = useMemo(() => list.filter((b) => b.balanceDue <= 0.01), [list]);
  const completedList = useMemo(() => list.filter((b) => b.isCompleted), [list]);

  // Auto-switch to 'all' if there are no in-house guests and user just opened the page
  useEffect(() => {
    if (!loading && list.length > 0 && inHouseList.length === 0 && tab === 'in_house') {
      setTab('all');
    }
  }, [loading, list.length, inHouseList.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((b) => {
      if (tab === 'in_house' && !b.isInHouse) return false;
      if (tab === 'due' && b.balanceDue <= 0.01) return false;
      if (tab === 'settled' && b.balanceDue > 0.01) return false;
      if (tab === 'completed' && !b.isCompleted) return false;

      if (!q) return true;
      const name = String(b.guest_name || '').toLowerCase();
      const code = String(b.booking_code || `#${b.id}`).toLowerCase();
      const phone = String(b.guest_phone || b.mobile || '').toLowerCase();
      const rm = String(b.roomNumber).toLowerCase();
      return name.includes(q) || code.includes(q) || phone.includes(q) || rm.includes(q);
    });
  }, [list, search, tab]);

  // Financial summary
  const summary = useMemo(() => {
    let charges = 0;
    let paid = 0;
    let due = 0;
    for (const b of list) {
      charges += b.totalCharges;
      paid += b.totalPayments;
      due += Math.max(0, b.balanceDue);
    }
    return {
      inHouseCount: inHouseList.length,
      totalCount: list.length,
      charges,
      paid,
      due,
    };
  }, [list, inHouseList]);

  // Open Settlement Modal
  const openPayModal = (b) => {
    setPayBooking(b);
    setPayAmount(b.balanceDue > 0 ? String(b.balanceDue) : '');
    setPayMethod('upi');
    setPayReference('');
    setOpenDropdownId(null);
  };

  // Submit Settlement Payment
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payBooking) return;
    const amt = Number(payAmount);
    if (amt <= 0) return toast.error('Enter valid payment amount');

    setSavingPayment(true);
    try {
      await postWithAuth(
        '/payments',
        {
          booking_id: Number(payBooking.id),
          amount: amt,
          method: payMethod,
          reference: payReference.trim(),
          paid_on: new Date().toISOString().slice(0, 10),
          status: 'success',
        },
        token
      );
      toast.success(`Folio settled successfully for Room ${payBooking.roomNumber} (${formatINR(amt)})`);
      setPayBooking(null);
      
      // Refresh accurate balance from backend
      try {
        const balRes = await getWithAuth(`/folio/${payBooking.id}/balance`, token);
        if (balRes?.data) {
          setBalances((prev) => ({ ...prev, [payBooking.id]: balRes.data }));
        }
      } catch {
        loadData(true);
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleCheckout = async (b) => {
    setOpenDropdownId(null);
    if (b.balanceDue > 0.01) {
      const res = await Swal.fire({
        title: 'Pending Balance Due',
        html: `Guest <b>${b.guest_name}</b> (Room ${b.roomNumber}) has a balance of <b style="color:#dc2626">${formatINR(b.balanceDue)}</b>.<br/>Please settle payment before checkout.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Settle Payment Now',
        cancelButtonText: 'Cancel',
      });
      if (res.isConfirmed) openPayModal(b);
      return;
    }

    const conf = await Swal.fire({
      title: `Checkout Room ${b.roomNumber}?`,
      text: `Complete departure for ${b.guest_name || 'Guest'}. Folio balance is settled.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Checkout',
    });

    if (!conf.isConfirmed) return;

    try {
      await postWithAuth(`/bookings/${b.id}/checkout`, {}, token);
      toast.success(`Room ${b.roomNumber} checked out`);
      loadData(true);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Checkout failed');
    }
  };

  const handleGenerateInvoice = async (b) => {
    setOpenDropdownId(null);
    try {
      const inv = await postWithAuth(`/invoices/${b.id}`, { booking_id: Number(b.id) }, token);
      const invId = inv?.data?.invoice_id || inv?.data?.id || b.id;
      const pdf = await getWithAuth(`/invoices/${invId}/pdf`, token, {
        responseType: 'blob',
        params: { v: Date.now() },
      });
      const url = window.URL.createObjectURL(new Blob([pdf.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      toast.success('Invoice generated');
    } catch (e) {
      toast.error('Failed to generate invoice');
    }
  };

  return (
    <div className="ota-running-page">
      {/* 1. Header */}
      <div className="ota-running-header">
        <div className="ota-header-title-wrap">
          <div className="ota-header-icon">
            <i className="fa-solid fa-folder-open"></i>
          </div>
          <div>
            <h1>
              Running Folios
              <span className="ota-badge-live">
                {summary.inHouseCount > 0 ? `${summary.inHouseCount} In-House Stays` : 'Folio Accounts'}
              </span>
            </h1>
            <p className="ota-header-subtitle">
              Active in-house guest accounts, live charges, advance payments, and folio balance settlement.
            </p>
          </div>
        </div>

        <div className="ota-header-actions">
          <button
            type="button"
            className="ota-btn ota-btn-secondary"
            onClick={() => loadData(true)}
            disabled={refreshing}
            title="Refresh folios"
          >
            <i className={`fa-solid fa-rotate-right ${refreshing ? 'fa-spin' : ''}`}></i>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link to="/bookings/new" className="ota-btn ota-btn-primary">
            <i className="fa-solid fa-plus"></i> New Booking
          </Link>
        </div>
      </div>

      {/* 2. Summary Strip */}
      <div className="ota-summary-strip">
        <div className="ota-summary-item">
          <span className="ota-summary-label">In-House Stays</span>
          <span className="ota-summary-val">{summary.inHouseCount} Rooms</span>
        </div>
        <div className="ota-summary-divider"></div>
        <div className="ota-summary-item">
          <span className="ota-summary-label">Total Folio Charges</span>
          <span className="ota-summary-val">{formatINR(summary.charges)}</span>
        </div>
        <div className="ota-summary-divider"></div>
        <div className="ota-summary-item">
          <span className="ota-summary-label">Paid / Advances</span>
          <span className="ota-summary-val" style={{ color: '#059669' }}>
            {formatINR(summary.paid)}
          </span>
        </div>
        <div className="ota-summary-divider"></div>
        <div className="ota-summary-item">
          <span className="ota-summary-label">Outstanding Balance</span>
          <span
            className="ota-summary-val"
            style={{ color: summary.due > 0 ? '#dc2626' : '#059669' }}
          >
            {formatINR(summary.due)}
          </span>
        </div>
      </div>

      {/* 3. Main Data Panel */}
      <div className="ota-panel">
        <div className="ota-panel-topbar">
          <div className="ota-search-input-wrap">
            <i className="fa-solid fa-search"></i>
            <input
              type="text"
              className="ota-search-input"
              placeholder="Search guest name, room no, or booking ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="ota-tab-filters">
            <button
              type="button"
              className={`ota-tab-btn ${tab === 'in_house' ? 'active' : ''}`}
              onClick={() => setTab('in_house')}
            >
              In-House ({inHouseList.length})
            </button>
            <button
              type="button"
              className={`ota-tab-btn ${tab === 'all' ? 'active' : ''}`}
              onClick={() => setTab('all')}
            >
              All Folios ({list.length})
            </button>
            <button
              type="button"
              className={`ota-tab-btn ${tab === 'due' ? 'active' : ''}`}
              onClick={() => setTab('due')}
            >
              Balance Due ({dueList.length})
            </button>
            <button
              type="button"
              className={`ota-tab-btn ${tab === 'settled' ? 'active' : ''}`}
              onClick={() => setTab('settled')}
            >
              Settled ({settledList.length})
            </button>
            <button
              type="button"
              className={`ota-tab-btn ${tab === 'completed' ? 'active' : ''}`}
              onClick={() => setTab('completed')}
            >
              Completed ({completedList.length})
            </button>
          </div>
        </div>

        <div className="ota-table-wrap">
          <table className="ota-table">
            <thead>
              <tr>
                <th>Booking & Room</th>
                <th>Guest</th>
                <th>Stay Period</th>
                <th>Status</th>
                <th>Total Charges</th>
                <th>Paid Amount</th>
                <th>Folio Balance</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }}></i> Loading folios...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    {tab === 'in_house' ? (
                      <div>
                        <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: '#0a2240' }}>
                          No guests are currently checked-in (0 In-House).
                        </p>
                        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                          You have {list.length} total booking folios in the system. Switch to "All Folios" to view them.
                        </p>
                        <button
                          type="button"
                          className="ota-btn ota-btn-secondary"
                          onClick={() => setTab('all')}
                        >
                          View All Folios ({list.length})
                        </button>
                      </div>
                    ) : (
                      'No folios match the selected filter.'
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="ota-room-tag">Room {b.roomNumber}</div>
                      <div className="ota-room-sub">
                        <Link to={`/booking/${b.booking_code || b.id}/folio`} style={{ color: '#0071c2', textDecoration: 'none', fontWeight: 600 }}>
                          {b.booking_code || `#${b.id}`}
                        </Link>{' '}
                        • {b.roomType}
                      </div>
                    </td>

                    <td>
                      <div className="ota-guest-name">{b.guest_name || 'Guest'}</div>
                      <div className="ota-guest-phone">{b.guest_phone || b.mobile || '-'}</div>
                    </td>

                    <td>
                      <div className="ota-dates-main">
                        {b.checkIn} → {b.checkOut}
                      </div>
                      <div className="ota-dates-nights">{b.nights} {b.nights === 1 ? 'Night' : 'Nights'}</div>
                    </td>

                    <td>
                      {getStatusBadge(b.status)}
                    </td>

                    <td>
                      <strong>{formatINR(b.totalCharges)}</strong>
                    </td>

                    <td>
                      <span style={{ color: '#059669', fontWeight: 600 }}>{formatINR(b.totalPayments)}</span>
                    </td>

                    <td>
                      {b.balanceDue <= 0.01 ? (
                        <span className="ota-badge-settled" title="Folio fully settled">
                          <i className="fa-solid fa-check"></i> Settled
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="ota-badge-due"
                          onClick={() => openPayModal(b)}
                          title="Click to settle balance"
                          style={{ border: 'none', cursor: 'pointer' }}
                        >
                          <i className="fa-solid fa-credit-card"></i> Settle {formatINR(b.balanceDue)}
                        </button>
                      )}
                    </td>

                    <td>
                      <div className="ota-row-actions">
                        <Link
                          to={`/booking/${b.booking_code || b.id}/folio`}
                          className="ota-btn-sm"
                          title="Open Full Folio"
                        >
                          <i className="fa-solid fa-file-invoice"></i> View Folio
                        </Link>

                        {b.balanceDue > 0.01 && (
                          <button
                            type="button"
                            className="ota-btn-sm"
                            style={{ color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5' }}
                            onClick={() => openPayModal(b)}
                            title="Settle Folio Payment"
                          >
                            <i className="fa-solid fa-credit-card"></i> Settle
                          </button>
                        )}

                        <button
                          type="button"
                          className="ota-dropdown-btn"
                          onClick={() => setOpenDropdownId(openDropdownId === b.id ? null : b.id)}
                        >
                          <i className="fa-solid fa-ellipsis-vertical"></i>
                        </button>

                        {openDropdownId === b.id && (
                          <div className="ota-dropdown-box">
                            <ul>
                              <li>
                                <button type="button" onClick={() => openPayModal(b)}>
                                  <i className="fa-solid fa-credit-card"></i> Settle Payment
                                </button>
                              </li>
                              <li>
                                <button type="button" onClick={() => handleGenerateInvoice(b)}>
                                  <i className="fa-solid fa-print"></i> Generate Invoice
                                </button>
                              </li>
                              {b.isInHouse && (
                                <li>
                                  <button
                                    type="button"
                                    className="text-danger"
                                    onClick={() => handleCheckout(b)}
                                  >
                                    <i className="fa-solid fa-door-open"></i> Check-out
                                  </button>
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Quick Settlement / Payment Modal */}
      {payBooking && (
        <div className="ota-modal-overlay" onClick={() => setPayBooking(null)}>
          <div className="ota-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="ota-modal-header">
              <h3>Settle Folio • Room {payBooking.roomNumber}</h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}
                onClick={() => setPayBooking(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRecordPayment}>
              <div className="ota-modal-body">
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: '10px 14px',
                    marginBottom: 14,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0a2240' }}>{payBooking.guest_name || 'Guest'}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>Booking {payBooking.booking_code || `#${payBooking.id}`}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Balance Due</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#dc2626' }}>{formatINR(payBooking.balanceDue)}</div>
                  </div>
                </div>

                <div className="ota-form-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ margin: 0 }}>Settlement Amount (₹) *</label>
                    {payBooking.balanceDue > 0 && (
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0071c2',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        onClick={() => setPayAmount(String(payBooking.balanceDue))}
                      >
                        Settle Full Due ({formatINR(payBooking.balanceDue)})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    className="ota-input"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="ota-form-row">
                  <label>Payment Method *</label>
                  <select
                    className="ota-select"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    <option value="upi">UPI / QR (GPay, PhonePe, Paytm)</option>
                    <option value="cash">Cash Settlement</option>
                    <option value="card">Credit / Debit Card (POS)</option>
                    <option value="bank_transfer">Bank Transfer / NetBanking</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div className="ota-form-row">
                  <label>Transaction Reference / Txn ID</label>
                  <input
                    type="text"
                    className="ota-input"
                    placeholder="e.g. UPI-Ref-892347 / Cash Recpt #12"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                  />
                </div>
              </div>
              <div className="ota-modal-footer">
                <button
                  type="button"
                  className="ota-btn ota-btn-secondary"
                  onClick={() => setPayBooking(null)}
                  disabled={savingPayment}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ota-btn ota-btn-primary"
                  style={{ background: '#059669' }}
                  disabled={savingPayment}
                >
                  {savingPayment ? 'Processing...' : 'Confirm & Settle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
