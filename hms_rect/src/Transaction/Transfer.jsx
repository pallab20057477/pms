import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Swal from "sweetalert2";
import { getWithAuth, postWithAuth } from "../api";

const formatINR = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BANKS = [
  "Bank of asia",
  "Brac Bank",
  "National Bank",
  "Exim Bank",
  "datchbangla Bank",
  "Sonali Bank",
];

function Transfer() {
  const token = useSelector((state) => state.auth.accesstoken);
  const [invoices, setInvoices] = useState([]);
  const transferInitialForm = {
    invoice_id: "",
    from: BANKS[0],
    to: BANKS[1],
    method: "bank transfer",
    amount: "",
    paid_on: "",
    status: "success",
    description: "",
    tags: ""
  };
  const [form, setForm] = useState(transferInitialForm);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const res = await getWithAuth("payments?limit=100", token);
      setTransfers(res?.data?.data?.items || []);
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchTransfers();
    if (token) getWithAuth("invoices?limit=100", token).then(res => {
      setInvoices(res?.data?.data?.items || []);
    });
  }, [token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleReset = () => setForm(transferInitialForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Validate required fields
      if (!form.method || form.method.length < 2) {
        Swal.fire({ icon: "warning", title: "Method must be at least 2 characters" });
        return;
      }
      if (!form.amount) {
        Swal.fire({ icon: "warning", title: "Amount is required" });
        return;
      }
      if (!form.paid_on) {
        Swal.fire({ icon: "warning", title: "Payment date is required" });
        return;
      }
      if (!form.status || !['success', 'failed', 'pending'].includes(form.status)) {
        Swal.fire({ icon: "warning", title: "Invalid status" });
        return;
      }

      const payload = {
        method: form.method,
        amount: form.amount,
        paid_on: form.paid_on,
        status: form.status,
        from: form.from,
        to: form.to,
        description: form.description,
        tags: form.tags
      };
      if (form.invoice_id) {
        payload.invoice_id = parseInt(form.invoice_id);
      }
      console.log("Sending payload:", payload);
      console.log("Form values:", form);
      const res = await postWithAuth("payments", payload, token);
      const result = res.data;
      if (result.status) {
        Swal.fire({ icon: "success", title: "Transfer added successfully", timer: 1500, showConfirmButton: false });
        handleReset();
        fetchTransfers();
      } else {
        Swal.fire({ icon: "warning", title: result.error || "Failed to add transfer" });
      }
    } catch (error) {
      console.error("Payment creation error:", error);
      console.error("Error response:", error.response);
      console.error("Error status:", error.response?.status);
      console.error("Error data:", error.response?.data);
      
      if (error.response && error.response.data) {
        Swal.fire({ icon: "error", title: error.response.data.message || error.response.data.error || "Server error" });
      } else {
        Swal.fire({ icon: "error", title: "Server error" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-send"></i>
        </div>
        <div className="header-title">
          <h1>Transfer</h1>
          <small>Transfer list & Add transfer</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-4">
            <div className="panel lobidisable panel-bd">
              <div className="panel-heading">
                <div className="panel-title">
                  <h4>Add Transfer</h4>
                </div>
              </div>
              <div className="panel-body">
                <form onSubmit={handleSubmit} autoComplete="off">
                  <div className="form-group">
                    <label>Invoice</label>
                    <select
                      className="form-control"
                      name="invoice_id"
                      value={form.invoice_id}
                      onChange={handleChange}
                    >
                      <option value="">Select Invoice</option>
                      {invoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_no || inv.id}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>From</label>
                    <select
                      className="form-control"
                      name="from"
                      value={form.from}
                      onChange={handleChange}
                    >
                      {BANKS.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>To</label>
                    <select
                      className="form-control"
                      name="to"
                      value={form.to}
                      onChange={handleChange}
                    >
                      {BANKS.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Method</label>
                    <input
                      name="method"
                      value={form.method}
                      onChange={handleChange}
                      className="form-control"
                      required
                      minLength={2}
                      maxLength={50}
                    />
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      className="form-control years"
                      name="paid_on"
                      value={form.paid_on}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <input
                      type="text"
                      className="form-control"
                      name="description"
                      placeholder="Enter Short description"
                      value={form.description}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Amount</label>
                    <input
                      type="number"
                      className="form-control"
                      name="amount"
                      placeholder="Enter Amount"
                      value={form.amount}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      className="form-control"
                      required
                    >
                      <option value="success">Success</option>
                      <option value="failed">Failed</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tags</label>
                    <input
                      type="text"
                      className="form-control"
                      name="tags"
                      placeholder="Enter tags"
                      value={form.tags}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group">
                    <button
                      type="submit"
                      className="btn btn-add"
                      disabled={loading || saving}
                    >
                      <i className="fa fa-check"></i> {saving ? "Saving..." : loading ? "Submitting..." : "Submit"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="col-sm-8">
            <div className="panel lobidisable panel-bd">
              <div className="panel-heading">
                <div className="panel-title">
                  <h4>Recent Transfers</h4>
                </div>
              </div>
              <div className="panel-body">
                <div className="table-responsive">
                  <table className="table table-bordered table-hover">
                    <thead>
                      <tr className="info">
                        <th>From</th>
                        <th>To</th>
                        <th>Amount</th>
                        <th>Description</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr><td colSpan={6} className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading...</td></tr>
                      )}
                      {!loading && transfers.length === 0 && (
                        <tr><td colSpan={6} className="text-center">No transfers found</td></tr>
                      )}
                      {!loading && transfers.map((t, idx) => (
                        <tr key={t.id || idx}>
                          <td>{t.from || '-'}</td>
                          <td>{t.to || '-'}</td>
                          <td>{formatINR(t.amount)}</td>
                          <td>{t.description || '-'}</td>
                          <td>{t.paid_on || '-'}</td>
                          <td>
                            <span className={`badge badge-${t.status === 'success' ? 'success' : t.status === 'failed' ? 'danger' : 'warning'}`}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
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

export default Transfer;
