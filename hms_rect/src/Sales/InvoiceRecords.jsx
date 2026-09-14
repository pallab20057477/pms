import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { deleteWithAuth, getWithAuth, putWithAuth } from "../api";
import Swal from "sweetalert2";
import "./InvoicesModern.css";

const formatINR = (value) =>
  `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function InvoiceRecords() {
  const navigate = useNavigate();
  const token = useSelector((state) => state.auth.accesstoken);

  const [invoiceListLoading, setInvoiceListLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [editInvoice, setEditInvoice] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const customerMap = useMemo(() => {
    const map = {};
    for (const c of customers) {
      map[c.id] = `${c.first_name || ""} ${c.last_name || ""}`.trim();
    }
    return map;
  }, [customers]);

  const invoiceStatusClass = (status) => {
    const s = String(status || "").toLowerCase();
    if (s === "paid" || s === "active") return "label-custom label label-default";
    if (s === "partial") return "label label-warning";
    if (s === "cancelled" || s === "canceled") return "label label-info";
    if (s === "unpaid" || s === "inactive") return "label-danger label label-default";
    return "label label-default";
  };

  const formatInvoiceStatus = (status) => {
    const s = String(status || "").trim().toLowerCase();
    if (!s) return "Pending";
    if (s === "partial") return "Partially Paid";
    if (s === "paid") return "Paid in Full";
    if (s === "unpaid") return "Payment Pending";
    if (s === "cancelled" || s === "canceled") return "Cancelled";
    if (s === "active") return "Active";
    if (s === "inactive") return "Inactive";
    return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setInvoiceListLoading(true);
    try {
      const [invRes, custRes] = await Promise.all([
        getWithAuth("invoices?limit=200", token),
        getWithAuth("customers?limit=200", token),
      ]);
      setInvoices(invRes?.data?.data?.items || []);
      setCustomers(custRes?.data?.data?.items || []);
    } catch {
      setInvoices([]);
      setCustomers([]);
    } finally {
      setInvoiceListLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

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

  const handleEdit = (invoice) => {
    setOpenDropdownId(null);
    setEditInvoice(invoice);
    setEditForm({ ...invoice });
    setTimeout(() => {
      const modal = document.getElementById("editInvoiceModal");
      if (modal) modal.style.display = "block";
    }, 0);
  };

  const handleEditCancel = () => {
    setEditInvoice(null);
    setEditForm({});
  };

  const handleEditFormChange = (e) => {
    setEditForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const payload = {
        amount: Number(editForm.amount),
        due_date: editForm.due_date,
        status: editForm.status,
      };
      await putWithAuth(`invoices/${editInvoice.id}`, payload, token);
      Swal.fire({ icon: "success", title: "Invoice updated" });
      setEditInvoice(null);
      loadInvoices();
    } catch (err) {
      Swal.fire({ icon: "error", title: err?.response?.data?.error || "Failed to update invoice" });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (invoice) => {
    setOpenDropdownId(null);
    if (!window.confirm(`Are you sure you want to delete invoice #${invoice.invoice_no}?`)) return;
    setDeletingId(invoice.id);
    try {
      await deleteWithAuth(`invoices/${invoice.id}`, token);
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoice.id));
      Swal.fire({ icon: "success", title: "Invoice deleted" });
    } catch (err) {
      Swal.fire({ icon: "error", title: err?.response?.data?.error || "Failed to delete invoice" });
    } finally {
      setDeletingId(null);
    }
  };

  const getTableData = () => {
    const table = document.getElementById("invoiceTable");
    if (!table) return { headers: [], rows: [] };
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.innerText.trim());
    // Only get data rows, skip Action column data if needed, but simple map is fine for now
    const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim())
    );
    return { headers, rows };
  };

  const triggerDownload = (name, mime, content) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
  };

  const handleCopy = () => {
    const { headers, rows } = getTableData();
    const text = [headers, ...rows].map((r) => r.join("\t")).join("\n");
    navigator.clipboard.writeText(text);
  };

  const handleCSV = () => {
    const { headers, rows } = getTableData();
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    triggerDownload("invoices.csv", "text/csv", csv);
  };

  const handleExcel = () => {
    const { headers, rows } = getTableData();
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Invoices"><Table>${[headers, ...rows]
      .map(
        (r) =>
          `<Row>${r
            .map(
              (c) =>
                `<Cell><Data ss:Type="String">${c
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")}</Data></Cell>`
            )
            .join("")}</Row>`
      )
      .join("")}</Table></Worksheet></Workbook>`;
    triggerDownload("invoices.xls", "application/vnd.ms-excel", xml);
  };

  const handlePrint = () => {
    const table = document.getElementById("invoiceTable");
    if (!table) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      `<html><head><title>Invoices</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#009688;color:#fff}</style></head><body>${table.outerHTML}</body></html>`
    );
    win.document.close();
    win.print();
  };

  return (
    <>
      {editInvoice && (
        <div id="editInvoiceModal" className="invoice-modal-overlay">
          <div className="invoice-modal-card">
            <h4>Edit Invoice #{editInvoice.invoice_no}</h4>
            <form onSubmit={handleEditSave}>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="number"
                  name="amount"
                  className="form-control invoice-input"
                  value={editForm.amount || ""}
                  onChange={handleEditFormChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input
                  type="date"
                  name="due_date"
                  className="form-control invoice-input"
                  value={editForm.due_date || ""}
                  onChange={handleEditFormChange}
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  name="status"
                  className="form-control invoice-input"
                  value={editForm.status || ""}
                  onChange={handleEditFormChange}
                >
                  <option value="paid">Paid</option>
                  <option value="partial">Partially Paid</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="invoice-modal-actions">
                <button type="button" className="btn btn-default" onClick={handleEditCancel} disabled={savingEdit}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="content-header">
        <div className="header-icon">
          <i className="fa-solid fa-file-invoice-dollar"></i>
        </div>
        <div className="header-title">
          <h1>Invoice Records</h1>
          <small>All Existing Invoices</small>
          <div className="invoice-header-actions">
            <button type="button" className="btn btn-default" onClick={() => navigate("/folio/invoice")}
            >
              <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }}></i>
              Back To Invoice Generation
            </button>
          </div>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag invoice-panel">
              <div className="panel-heading invoice-panel-heading">
                <div>
                  <h4 className="invoice-panel-title">Invoice Table</h4>
                  <p className="invoice-panel-subtitle">View, edit, export, and manage all generated invoices.</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="btn-group buttonexport invoice-export-group">
                  <button type="button" className="btn btn-default btn-sm" onClick={handleCopy}>
                    <i className="fa-solid fa-copy"></i> Copy
                  </button>
                  <button type="button" className="btn btn-default btn-sm" onClick={handleExcel}>
                    <i className="fa-solid fa-file-excel"></i> Excel
                  </button>
                  <button type="button" className="btn btn-default btn-sm" onClick={handleCSV}>
                    <i className="fa-solid fa-file-csv"></i> CSV
                  </button>
                  <button type="button" className="btn btn-default btn-sm" onClick={handlePrint}>
                    <i className="fa-solid fa-print"></i> Print
                  </button>
                </div>

                <div className="table-responsive" style={{ overflow: 'visible' }}>
                  <table id="invoiceTable" className="table table-bordered table-striped table-hover invoice-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Account</th>
                        <th>Amount</th>
                        <th>Late Stay Charge</th>
                        <th>Invoice Date</th>
                        <th>Due Date</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th style={{ width: 80, textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceListLoading ? (
                        <tr>
                          <td colSpan={9} className="text-center">
                            <i className="fa-solid fa-spinner fa-spin invoice-spin"></i> Loading...
                          </td>
                        </tr>
                      ) : invoices.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center">No invoices found</td>
                        </tr>
                      ) : (
                        invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td><a href="#" className="invoice-number-link">{inv.invoice_no}</a></td>
                            <td>{customerMap[inv.customer_id] || inv.customer_id}</td>
                            <td>{formatINR(inv.amount)}</td>
                            <td>{formatINR(inv.late_stay_charge || inv.lateStayCharge || 0)}</td>
                            <td>{inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-GB') : "-"}</td>
                            <td>{inv.due_date || "-"}</td>
                            <td>Onetime</td>
                            <td><span className={invoiceStatusClass(inv.status)}>{formatInvoiceStatus(inv.status)}</span></td>
                            <td style={{ textAlign: 'center', position: 'relative' }}>
                              <button type="button" className="invoice-dropdown-btn" onClick={() => toggleDropdown(inv.id)}>
                                <i className="fa-solid fa-ellipsis-vertical"></i>
                              </button>
                              {openDropdownId === inv.id && (
                                <div className="invoice-actions-dropdown">
                                  <ul>
                                    <li>
                                      <button type="button" onClick={() => navigate(`/booking/${inv.booking_id}/folio`)}>
                                        <i className="fa-solid fa-file-invoice"></i> View Folio
                                      </button>
                                    </li>
                                    <li>
                                      <button type="button" onClick={() => handleEdit(inv)} disabled={deletingId === inv.id}>
                                        <i className="fa-solid fa-pen"></i> Edit
                                      </button>
                                    </li>
                                    <li>
                                      <button type="button" className="text-danger" style={{ color: '#ef4444' }} onClick={() => handleDelete(inv)} disabled={deletingId === inv.id}>
                                        <i className="fa-solid fa-trash"></i> Delete
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
      </section>
    </>
  );
}
