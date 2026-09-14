  // Export helpers
  const getTableData = () => {
    const table = document.getElementById("recurringTable");
    if (!table) return { headers: [], rows: [] };
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.innerText.trim());
    const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim())
    );
    return { headers, rows };
  };
  const handleCopy = (e) => {
    e.preventDefault();
    const { headers, rows } = getTableData();
    const text = [headers, ...rows].map((r) => r.join("\t")).join("\n");
    navigator.clipboard.writeText(text);
  };
  const triggerDownload = (name, mime, content) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
  };
  const handleCSV = (e) => {
    e.preventDefault();
    const { headers, rows } = getTableData();
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    triggerDownload("recurring.csv", "text/csv", csv);
  };
  const handleExcel = (e) => {
    e.preventDefault();
    const { headers, rows } = getTableData();
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Recurring"><Table>${[headers, ...rows].map((r) => `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`;
    triggerDownload("recurring.xls", "application/vnd.ms-excel", xml);
  };
  const handlePrint = (e) => {
    e.preventDefault();
    const table = document.getElementById("recurringTable");
    if (!table) return;
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Recurring Invoices</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#009688;color:#fff}</style></head><body>${table.outerHTML}</body></html>`);
    win.document.close();
    win.print();
  };


import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { getWithAuth, postWithAuth, putWithAuth } from "../api";

export default function Recurring() {
  const token = useSelector((state) => state.auth.accesstoken);
  const [recurrings, setRecurrings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("add");
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({
    customer_id: "",
    amount: "",
    invoice_no: "",
    invoice_date: "",
    due_date: "",
    status: "draft",
  });
  const [reload, setReload] = useState(0);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  // Fetch customers and invoices for dropdowns
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [custRes, invRes] = await Promise.all([
          getWithAuth("customers?limit=100", token),
          getWithAuth("invoices?limit=100", token)
        ]);
        setCustomers(custRes?.data?.items || custRes?.data?.data?.items || []);
        setInvoices(invRes?.data?.items || invRes?.data?.data?.items || []);
      } catch {
        setCustomers([]);
        setInvoices([]);
      }
    };
    if (token) fetchDropdowns();
  }, [token]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await getWithAuth("/recurring?limit=100", token);
        if (isMounted) {
          setRecurrings(res?.data?.items || res?.data || []);
        }
      } catch {
        if (isMounted) {
          setRecurrings([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    if (token) fetchData();
    return () => { isMounted = false; };
  }, [token, reload]);

  const openModal = (type, item = null) => {
    setModalType(type);
    setCurrent(item);
    setForm(item ? {
      customer_id: item.customer_id || "",
      amount: item.amount || "",
      invoice_no: item.invoice_no || "",
      invoice_date: item.invoice_date || "",
      due_date: item.due_date || "",
      status: item.status || "draft",
    } : {
      customer_id: "",
      amount: "",
      invoice_no: "",
      invoice_date: "",
      due_date: "",
      status: "draft",
    });
    setShowModal(true);
  };
  const closeModal = () => {
    setShowModal(false);
    setCurrent(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    console.log("handleSave called", { form, modalType, current });
    try {
      // Ensure customer_id is a number
      const payload = { ...form, customer_id: Number(form.customer_id), is_recurring: true };
      if (modalType === "add") {
        const res = await postWithAuth("/recurring", payload, token);
        console.log("Recurring invoice added:", res?.data);
        Swal.fire({ icon: "success", title: "Added!", timer: 1200, showConfirmButton: false });
      } else if (modalType === "edit" && current) {
        const res = await putWithAuth(`/recurring/${current.id}`, payload, token);
        console.log("Recurring invoice updated:", res?.data);
        Swal.fire({ icon: "success", title: "Updated!", timer: 1200, showConfirmButton: false });
      }
      setReload(r => r + 1);
      closeModal();
    } catch (err) {
      if (err.response) {
        console.log("Error in handleSave:", err.response.data, err.response.status);
        Swal.fire({ icon: "error", title: "Error", text: err.response.data?.error || err.response.data?.message || "Could not save recurring invoice." });
      } else {
        console.log("Error in handleSave:", err);
        Swal.fire({ icon: "error", title: "Error", text: "Could not save recurring invoice." });
      }
    }
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-file-text-o"></i>
        </div>
        <div className="header-title">
          <h1>Recurring Invoices</h1>
          <small>Recurring Invoices List</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading">
                <div className="btn-group" id="buttonexport">
                  <button className="btn btn-add" onClick={() => openModal("add")}> <i className="fa fa-plus"></i> Add Recurring</button>
                </div>
                <div className="btn-group pull-right">
                  <button className="btn btn-exp btn-sm dropdown-toggle" data-toggle="dropdown">
                    <i className="fa fa-bars"></i> Export Table Data
                  </button>
                  <ul className="dropdown-menu exp-drop" role="menu">
                    <li>
                      <a href="#" onClick={handleExcel}><img src="/crmAdminBootstrapTempate-master/assets/dist/img/xls.png" width="24" alt="logo"/> Export as Excel</a>
                    </li>
                    <li>
                      <a href="#" onClick={handleCSV}><img src="/crmAdminBootstrapTempate-master/assets/dist/img/csv.png" width="24" alt="logo"/> Export as CSV</a>
                    </li>
                    <li>
                      <a href="#" onClick={handleCopy}><img src="/crmAdminBootstrapTempate-master/assets/dist/img/txt.png" width="24" alt="logo"/> Copy Table</a>
                    </li>
                    <li>
                      <a href="#" onClick={handlePrint}><img src="/crmAdminBootstrapTempate-master/assets/dist/img/pdf.png" width="24" alt="logo"/> Print Table</a>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="panel-body">
                <div className="table-responsive">
                  <table className="table table-bordered table-striped table-hover" id="recurringTable">
                    <thead>
                      <tr className="info">
                        <th>#</th>
                        <th>Account</th>
                        <th>Amount</th>
                        <th>Invoice Date</th>
                        <th>Due Date</th>
                        <th>Next Invoice</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={8} className="text-center">Loading...</td></tr>
                      ) : recurrings.length > 0 ? (
                        recurrings.map((recurring, idx) => (
                          <tr key={recurring.id}>
                            <td>
                              <div className="checkbox checkbox-info">
                                <input id={`checkbox${idx}`} type="checkbox" />
                                <label htmlFor={`checkbox${idx}`}></label>
                              </div>
                            </td>
                            <td>{
                              customers.find(c => String(c.id) === String(recurring.customer_id))
                                ? `${customers.find(c => String(c.id) === String(recurring.customer_id)).first_name || ''} ${customers.find(c => String(c.id) === String(recurring.customer_id)).last_name || ''}`.trim()
                                : recurring.customer_id
                            }</td>
                            <td>{recurring.amount}</td>
                            <td>{recurring.invoice_date}</td>
                            <td>{recurring.due_date}</td>
                            <td>{recurring.next_invoice || ''}</td>
                            <td>
                              <span className={`label label-default ${recurring.status === 'Active' ? 'label-custom' : 'label-danger'}`}>{recurring.status}</span>
                            </td>
                            <td>
                              <button type="button" className="btn btn-add btn-sm" onClick={() => openModal('edit', recurring)}><i className="fa fa-pencil"></i></button>
                              <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: 4 }}><i className="fa fa-trash-o"></i></button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={8} className="text-center">No records found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Modal for Add/Edit */}
        {showModal && (
          <div className="modal fade in" style={{ display: "block", background: "rgba(0,0,0,0.3)" }} tabIndex="-1" role="dialog">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header modal-header-primary">
                  <button type="button" className="close" onClick={closeModal}>&times;</button>
                  <h3><i className="fa fa-user m-r-5"></i> {modalType === "add" ? "Add recurring" : "Edit recurring"}</h3>
                </div>
                <div className="modal-body">
                  <div className="row">
                    <div className="col-md-12">
                      <form className="form-horizontal" onSubmit={handleSave} autoComplete="off">
                        <fieldset>
                          <div className="col-md-6 form-group">
                            <label className="control-label">Account</label>
                            <select
                              className="form-control"
                              value={form.customer_id}
                              onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
                              required
                            >
                              <option value="">Select Account</option>
                              {customers.map(c => (
                                <option key={c.id} value={c.id}>
                                  {`${c.first_name || ''} ${c.last_name || ''}`.trim()}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-md-6 form-group">
                            <label className="control-label">Invoice No</label>
                            <select
                              className="form-control"
                              value={form.invoice_no}
                              onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value }))}
                              required
                            >
                              <option value="">Select Invoice</option>
                              {invoices.map(inv => (
                                <option key={inv.id} value={inv.invoice_no}>
                                  {inv.invoice_no}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-md-6 form-group">
                            <label className="control-label">Amount</label>
                            <input type="number" placeholder="Amount" className="form-control" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
                          </div>
                          <div className="col-md-6 form-group">
                            <label className="control-label">Status</label>
                            <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} required>
                              <option value="draft">Draft</option>
                              <option value="unpaid">Unpaid</option>
                              <option value="paid">Paid</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>
                          <div className="col-md-6 form-group">
                            <label className="control-label">Invoice Date</label>
                            <input type="date" placeholder="Invoice Date" className="form-control" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} required />
                          </div>
                          <div className="col-md-6 form-group">
                            <label className="control-label">Due Date</label>
                            <input type="date" placeholder="Due Date" className="form-control" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} required />
                          </div>
                          <div className="col-md-12 form-group user-form-group">
                            <div className="pull-right">
                              <button type="button" className="btn btn-danger btn-sm" onClick={closeModal}>Cancel</button>
                              <button type="submit" className="btn btn-add btn-sm">Save</button>
                            </div>
                          </div>
                        </fieldset>
                      </form>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-danger pull-left" onClick={closeModal}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
