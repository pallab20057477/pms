

import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getWithAuth, postWithAuth } from "../api";
import Swal from "sweetalert2";

const initialForm = {
  account: "",
  date: "",
  description: "",
  amount: ""
};


function Deposit() {
  const token = useSelector((state) => state.auth.accesstoken);
  const [depositForm, setDepositForm] = useState(initialForm);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchDeposits = async () => {
    setLoading(true);
    try {
      const res = await getWithAuth('payments?limit=100', token);
      setDeposits(res?.data?.items || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchDeposits();
  }, [token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setDepositForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleReset = () => setDepositForm(initialForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await postWithAuth('payments', depositForm, token);
      const result = res?.data;
      if (result?.status) {
        Swal.fire({ icon: "success", title: "Deposit added successfully", timer: 1500, showConfirmButton: false });
        handleReset();
        fetchDeposits();
      } else {
        Swal.fire({ icon: "warning", title: result.error || "Failed to add deposit" });
      }
    } catch {
      Swal.fire({ icon: "error", title: "Server error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-shopping-basket"></i>
        </div>
        <div className="header-title">
          <h1>Deposit</h1>
          <small>Deposite list & new Deposits</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-4">
            <div className="panel lobidisable panel-bd">
              <div className="panel-heading">
                <div className="panel-title">
                  <h4>Add Deposit</h4>
                </div>
              </div>
              <div className="panel-body">
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label>Account</label>
                    <select className="form-control" name="account" value={depositForm.account} onChange={handleChange} required>
                      <option value="">Select Account</option>
                      <option value="Bank of asia">Bank of asia</option>
                      <option value="Brac Bank">Brac Bank</option>
                      <option value="National Bank">National Bank</option>
                      <option value="Exim Bank">Exim Bank</option>
                      <option value="datchbangla Bank">datchbangla Bank</option>
                      <option value="Sonali Bank">Sonali Bank</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <div className="input-group date form_date">
                      <input id="minMaxExample" type="date" className="form-control years" name="date" value={depositForm.date} onChange={handleChange} required />
                      <span className="input-group-addon"><a href="#"><i className="fa fa-calendar"></i></a></span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <input type="text" className="form-control" name="description" value={depositForm.description} onChange={handleChange} placeholder="Enter Short description" required />
                  </div>
                  <div className="form-group">
                    <label>Amount</label>
                    <input type="number" className="form-control" name="amount" value={depositForm.amount} onChange={handleChange} placeholder="Enter Amount" required />
                  </div>
                  <div className="form-group">
                    <button type="submit" className="btn btn-add" disabled={saving}>
                      <i className="fa fa-check"></i> {saving ? "Saving..." : "Submit"}
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
                  <h4>Recent Deposits</h4>
                </div>
              </div>
              <div className="panel-body">
                <div className="table-responsive">
                  <table className="table table-bordered table-hover">
                    <thead>
                      <tr className="info">
                        <th>Description</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr><td colSpan={2} className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading...</td></tr>
                      )}
                      {!loading && deposits.length === 0 && (
                        <tr><td colSpan={2} className="text-center">No deposits found</td></tr>
                      )}
                      {deposits.map((d) => (
                        <tr key={d.id}>
                          <td>{d.description}</td>
                          <td>${d.amount}</td>
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

export default Deposit;
