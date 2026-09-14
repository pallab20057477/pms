
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getWithAuth, postWithAuth } from "../api";
import Swal from "sweetalert2";


const initialForm = {
  title: "",
  category: "",
  amount: "",
  expense_date: "",
  notes: "",
  status: true
};

function Expense() {
  const token = useSelector((state) => state.auth.accesstoken);
  const [expenseForm, setExpenseForm] = useState(initialForm);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await getWithAuth('expenses?limit=100', token);
      setExpenses(res?.data?.data?.items || res?.data?.items || res?.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchExpenses();
  }, [token]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setExpenseForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleReset = () => setExpenseForm(initialForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Prepare payload for backend
      const payload = {
        title: expenseForm.title,
        category: expenseForm.category,
        amount: String(expenseForm.amount),
        expense_date: expenseForm.expense_date,
        notes: expenseForm.notes,
        status: expenseForm.status
      };
      const res = await postWithAuth('expenses', payload, token);
      const result = res?.data;
      if (result?.status || result?.id || result?.data?.id) {
        Swal.fire({ icon: "success", title: "Expense added successfully", timer: 1500, showConfirmButton: false });
        handleReset();
        // Optimistically add the new expense to the table
        const tempId = result.data?.id || result.id || Math.random();
        setExpenses((prev) => [
          {
            id: tempId,
            title: payload.title,
            category: payload.category,
            expense_date: payload.expense_date,
            amount: payload.amount,
            notes: payload.notes,
            status: payload.status,
            _temp: true
          },
          ...prev
        ]);
        // Remove the temp row after backend refresh
        setTimeout(() => {
          fetchExpenses();
          setExpenses((prev) => prev.filter(e => !e._temp));
        }, 1000);
      } else {
        Swal.fire({ icon: "warning", title: result.error || "Failed to add expense" });
      }
    } catch (error) {
      Swal.fire({ icon: "error", title: "Server error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-money"></i>
        </div>
        <div className="header-title">
          <h1>Expense</h1>
          <small>Expense list & Add Expense</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-4">
            <div className="panel lobidisable panel-bd">
              <div className="panel-heading">
                <div className="panel-title">
                  <h4>Add Expense</h4>
                </div>
              </div>
              <div className="panel-body">
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label>Title</label>
                    <input type="text" className="form-control" name="title" value={expenseForm.title} onChange={handleChange} placeholder="Expense Title" required minLength={2} maxLength={200} />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <input type="text" className="form-control" name="category" value={expenseForm.category} onChange={handleChange} placeholder="Category" required minLength={2} maxLength={100} />
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" className="form-control" name="expense_date" value={expenseForm.expense_date} onChange={handleChange} required />
                  </div>
                  <div className="form-group">
                    <label>Amount</label>
                    <input type="number" className="form-control" name="amount" value={expenseForm.amount} onChange={handleChange} placeholder="Enter Amount" required />
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <input type="text" className="form-control" name="notes" value={expenseForm.notes} onChange={handleChange} placeholder="Enter Short description" />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <input type="checkbox" name="status" checked={expenseForm.status} onChange={handleChange} /> Active
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
                  <h4>Recent Expense</h4>
                </div>
              </div>
              <div className="panel-body">
                <div className="table-responsive">
                  <table className="table table-bordered table-hover">
                    <thead>
                      <tr className="info">
                        <th>Title</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr><td colSpan={2} className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading...</td></tr>
                      )}
                      {!loading && expenses.length === 0 && (
                        <tr><td colSpan={2} className="text-center">No expenses found</td></tr>
                      )}
                      {expenses.map((e) => (
                        <tr key={e.id}>
                          <td>{e.title}</td>
                          <td>{e.category}</td>
                          <td>{e.expense_date}</td>
                          <td>{e.amount}</td>
                          <td>{e.notes}</td>
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

export default Expense;
