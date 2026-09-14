import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { getWithAuth, postWithAuth } from "../api";
import Swal from "sweetalert2";
import "./InvoicesModern.css";

const formatINR = (value) =>
  `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function Invoices() {
  const navigate = useNavigate();
  const token = useSelector((state) => state.auth.accesstoken);
  const activeHotelId = useSelector((state) => state.auth.activeHotelId);

  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [hotelTaxPolicy, setHotelTaxPolicy] = useState({
    taxType: '',
    taxPercent: 0,
  });

  const [bookingSearch, setBookingSearch] = useState("");
  const [generatingBookingId, setGeneratingBookingId] = useState(null);

  const loadInvoicesAndBookings = async () => {
    const [bookRes, invRes] = await Promise.all([
      getWithAuth("bookings?page=1&page_size=200", token),
      getWithAuth("invoices?limit=100", token),
    ]);
    setBookings(bookRes?.data?.items || []);
    setInvoices(invRes?.data?.data?.items || []);
  };

  const paidCount = useMemo(
    () => invoices.filter((inv) => (inv.status || "").toLowerCase() === "paid").length,
    [invoices]
  );
  const unpaidCount = useMemo(
    () =>
      invoices.filter((inv) => {
        const s = String(inv.status || "").toLowerCase();
        return s === "unpaid" || s === "partial";
      }).length,
    [invoices]
  );
  const totalAmount = useMemo(
    () => invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0),
    [invoices]
  );

  const filteredBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    if (!q) return bookings.slice(0, 20);
    return bookings
      .filter((b) => {
        const bookingCode = String(b.booking_code || `#${b.id}`).toLowerCase();
        const guest = String(b.guest_name || "").toLowerCase();
        const room = String(b.room_number || "").toLowerCase();
        const status = String(b.status || "").toLowerCase();
        return (
          bookingCode.includes(q) ||
          guest.includes(q) ||
          room.includes(q) ||
          status.includes(q)
        );
      })
      .slice(0, 30);
  }, [bookings, bookingSearch]);

  const formatBookingStatus = (status) => {
    const s = String(status || "").toLowerCase();
    if (!s) return "-";
    return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const bookingStatusClass = (status) => {
    const s = String(status || "").toLowerCase();
    if (s === "reserved") return "label label-info";
    if (s === "checked_in") return "label label-success";
    if (s === "completed") return "label label-primary";
    if (s === "cancelled") return "label label-danger";
    return "label label-default";
  };

  useEffect(() => {
    if (!token) return;
    const fetchBase = async () => {
      setLoading(true);
      try {
        await loadInvoicesAndBookings();
      } catch {
        setBookings([]);
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };
    fetchBase();
  }, [token]);

  useEffect(() => {
    let mounted = true;
    const fetchTaxPolicy = async () => {
      if (!token || !activeHotelId) return;
      try {
        const res = await getWithAuth(`/hotels/${activeHotelId}`, token);
        const h = res?.data || {};
        if (mounted) {
          setHotelTaxPolicy({
            taxType: h.tax_type || '',
            taxPercent: Number(h.tax_percent || 0),
          });
        }
      } catch {
        if (mounted) {
          setHotelTaxPolicy({ taxType: '', taxPercent: 0 });
        }
      }
    };
    fetchTaxPolicy();
    return () => {
      mounted = false;
    };
  }, [token, activeHotelId]);

  const [openDropdownId, setOpenDropdownId] = useState(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.invoice-dropdown-btn') && !e.target.closest('.invoice-actions-dropdown')) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = (id) => {
    setOpenDropdownId(openDropdownId === id ? null : id);
  };

  const generateInvoiceForBooking = async (bookingId, bookingStatus) => {
    setOpenDropdownId(null);
    if (bookingStatus === "cancelled") {
      Swal.fire({
        icon: "info",
        title: "Booking Canceled",
        text: "This booking is canceled. No invoice will be generated.",
      });
      return;
    }

    setGeneratingBookingId(bookingId);
    try {
      const invoiceRes = await postWithAuth(`/invoices/${bookingId}`, {}, token);
      await loadInvoicesAndBookings();
      const invoiceId = invoiceRes?.data?.invoice_id || invoiceRes?.data?.id || bookingId;
      const pdfRes = await getWithAuth(`/invoices/${invoiceId}/pdf`, token, {
        responseType: "blob",
        params: { v: Date.now() },
      });
      const blobUrl = window.URL.createObjectURL(new Blob([pdfRes.data], { type: "application/pdf" }));
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
      Swal.fire({ icon: "success", title: "Invoice generated successfully" });
    } catch (err) {
      Swal.fire({ icon: "error", title: err?.response?.data?.error || "Failed to generate invoice" });
    } finally {
      setGeneratingBookingId(null);
    }
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa-solid fa-file-invoice"></i>
        </div>
        <div className="header-title">
          <h1>Invoices</h1>
          <small>Invoices List</small>
          {/* <div className="invoice-header-actions">
            <button
              type="button"
              className="btn btn-primary btn-add"
              onClick={() => navigate("/folio/invoice/records")}
            >
              <i className="fa-solid fa-table-list" style={{ marginRight: 6 }}></i>
              Show Invoice Table
            </button>
          </div> */}
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="row invoice-kpi-row">
              <div className="col-sm-3 col-xs-6">
                <div className="invoice-kpi-card invoice-kpi-total">
                  <span className="invoice-kpi-label">Total Invoices</span>
                  <div className="invoice-kpi-value">{invoices.length}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="invoice-kpi-card invoice-kpi-paid">
                  <span className="invoice-kpi-label">Paid</span>
                  <div className="invoice-kpi-value">{paidCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="invoice-kpi-card invoice-kpi-unpaid">
                  <span className="invoice-kpi-label">Unpaid</span>
                  <div className="invoice-kpi-value">{unpaidCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="invoice-kpi-card invoice-kpi-amount">
                  <span className="invoice-kpi-label">Total Amount</span>
                  <div className="invoice-kpi-value invoice-kpi-money">{formatINR(totalAmount)}</div>
                </div>
              </div>
            </div>

            <div className="panel panel-bd lobidrag invoice-panel">
              <div className="panel-heading invoice-panel-heading">
                <div>
                  <h4 className="invoice-panel-title">Invoices</h4>
                  <p className="invoice-panel-subtitle">
                    Track due dates, payment status, and maintain billing records.
                  </p>
                </div>
              </div>
              <div className="panel-body">
                <div className="alert alert-info invoice-policy-alert">
                  <strong>Hotel Tax Policy:</strong>{" "}
                  {hotelTaxPolicy.taxType
                    ? `${hotelTaxPolicy.taxType} @ ${hotelTaxPolicy.taxPercent.toFixed(2)}%`
                    : "No tax configured"}
                  {hotelTaxPolicy.taxType === "GST" && hotelTaxPolicy.taxPercent > 0 && (
                    <span style={{ marginLeft: 8, color: "#555" }}>
                      (CGST {(hotelTaxPolicy.taxPercent / 2).toFixed(2)}% + SGST {(hotelTaxPolicy.taxPercent / 2).toFixed(2)}%)
                    </span>
                  )}
                </div>
                <div className="invoice-generate-wrap">
                  <div className="invoice-generate-head">
                    <div>
                      <h5 className="invoice-generate-title">Invoice Generation Center</h5>
                      <p className="invoice-generate-subtitle">
                        Generate and open invoice PDFs directly from active bookings.
                      </p>
                    </div>
                    <input
                      className="form-control invoice-generate-search"
                      placeholder="Search booking code, customer, room or status"
                      value={bookingSearch}
                      onChange={(e) => setBookingSearch(e.target.value)}
                    />
                  </div>
                  <div className="table-responsive" style={{ overflow: 'visible' }}>
                    <table className="table table-bordered table-hover invoice-generate-table">
                      <thead>
                        <tr>
                          <th>Booking</th>
                          <th>Customer</th>
                          <th>Room</th>
                          <th>Status</th>
                          <th style={{ width: 80, textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={5} className="text-center">
                              <i className="fa-solid fa-spinner fa-spin invoice-spin"></i> Loading bookings...
                            </td>
                          </tr>
                        ) : filteredBookings.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center">No booking records available</td>
                          </tr>
                        ) : (
                          filteredBookings.map((b) => (
                            <tr key={b.id}>
                              <td>{b.booking_code || `#${b.id}`}</td>
                              <td>{b.guest_name || `Customer ${b.guest_id}`}</td>
                              <td>{b.room_number || b.room_id}</td>
                              <td>
                                <span className={bookingStatusClass(b.status)}>
                                  {b.status === "cancelled" ? "Returned" : formatBookingStatus(b.status)}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center', position: 'relative' }}>
                                {generatingBookingId === b.id ? (
                                  <button type="button" className="invoice-dropdown-btn" disabled>
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                  </button>
                                ) : (
                                  <button type="button" className="invoice-dropdown-btn" onClick={() => toggleDropdown(b.id)}>
                                    <i className="fa-solid fa-ellipsis-vertical"></i>
                                  </button>
                                )}
                                {openDropdownId === b.id && (
                                  <div className="invoice-actions-dropdown">
                                    <ul>
                                      <li>
                                        <button type="button" onClick={() => generateInvoiceForBooking(b.id, b.status)}>
                                          <i className="fa-solid fa-file-invoice"></i> Generate & Open
                                        </button>
                                      </li>
                                      <li>
                                        <button type="button" onClick={() => navigate(`/booking/${b.booking_code}/folio`)}>
                                          <i className="fa-solid fa-folder-open"></i> Open Folio
                                        </button>
                                      </li>
                                    </ul>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
