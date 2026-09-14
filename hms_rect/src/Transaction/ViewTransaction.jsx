
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Swal from "sweetalert2";
import { getWithAuth, deleteWithAuth, putWithAuth } from "../api";

const formatINR = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BANKS = [
  "Bank of asia",
  "Brac Bank", 
  "National Bank",
  "Exim Bank",
  "datchbangla Bank",
  "Sonali Bank",
];

function ViewTransaction() {
  const token = useSelector((state) => state.auth.accesstoken);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      // Fetch both payments and expenses, then merge for a unified transaction list
      const [paymentsRes, expensesRes] = await Promise.all([
        getWithAuth("payments?limit=100", token),
        getWithAuth("expenses?limit=100", token)
      ]);
      const payments = paymentsRes?.data?.data?.items || [];
      const expenses = expensesRes?.data?.data?.items || [];
      
      // Add type field and normalize data
      const txs = [
        ...payments.map((p) => ({ 
          ...p, 
          type: "Income",
          date: p.paid_on,
          amount: parseFloat(p.amount || 0)
        })),
        ...expenses.map((e) => ({ 
          ...e, 
          type: "Expense",
          date: e.date || e.expense_date,
          amount: parseFloat(e.amount || e.total_amount || 0)
        }))
      ];
      
      // Sort by date ascending for balance calculation
      txs.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Calculate running balance
      let runningBalance = 0;
      const transactionsWithBalance = txs.map(t => {
        if (t.type === "Income") {
          runningBalance += t.amount; // Credit increases balance
        } else {
          runningBalance -= t.amount; // Debit decreases balance
        }
        return {
          ...t,
          balance: runningBalance
        };
      });
      
      // Sort by date descending for display
      transactionsWithBalance.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      setTransactions(transactionsWithBalance);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (transaction) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Delete this ${transaction.type.toLowerCase()} transaction?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        const endpoint = transaction.type === "Income" ? `payments/${transaction.id}` : `expenses/${transaction.id}`;
        await deleteWithAuth(endpoint, token);
        Swal.fire('Deleted!', 'Transaction deleted successfully', 'success');
        fetchTransactions(); // Refresh the list
      } catch (error) {
        Swal.fire('Error!', 'Failed to delete transaction', 'error');
      }
    }
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    
    if (transaction.type === "Income") {
      // Payment edit form
      Swal.fire({
        title: 'Edit Payment Transaction',
        html: `
          <div style="text-align: left;">
            <div style="margin-bottom: 15px;">
              <label>From Account:</label>
              <select id="edit-from" class="swal2-input" style="width: 100%;">
                ${BANKS.map(bank => `<option value="${bank}" ${transaction.from === bank ? 'selected' : ''}>${bank}</option>`).join('')}
              </select>
            </div>
            <div style="margin-bottom: 15px;">
              <label>To Account:</label>
              <select id="edit-to" class="swal2-input" style="width: 100%;">
                ${BANKS.map(bank => `<option value="${bank}" ${transaction.to === bank ? 'selected' : ''}>${bank}</option>`).join('')}
              </select>
            </div>
            <div style="margin-bottom: 15px;">
              <label>Method:</label>
              <input id="edit-method" class="swal2-input" value="${transaction.method || ''}" placeholder="Payment method">
            </div>
            <div style="margin-bottom: 15px;">
              <label>Amount:</label>
              <input id="edit-amount" class="swal2-input" type="number" value="${transaction.amount || ''}" placeholder="Amount">
            </div>
            <div style="margin-bottom: 15px;">
              <label>Date:</label>
              <input id="edit-date" class="swal2-input" type="date" value="${transaction.paid_on || ''}">
            </div>
            <div style="margin-bottom: 15px;">
              <label>Description:</label>
              <input id="edit-description" class="swal2-input" value="${transaction.description || ''}" placeholder="Description">
            </div>
            <div style="margin-bottom: 15px;">
              <label>Status:</label>
              <select id="edit-status" class="swal2-input" style="width: 100%;">
                <option value="success" ${transaction.status === 'success' ? 'selected' : ''}>Success</option>
                <option value="failed" ${transaction.status === 'failed' ? 'selected' : ''}>Failed</option>
                <option value="pending" ${transaction.status === 'pending' ? 'selected' : ''}>Pending</option>
              </select>
            </div>
            <div style="margin-bottom: 15px;">
              <label>Tags:</label>
              <input id="edit-tags" class="swal2-input" value="${transaction.tags || ''}" placeholder="Tags">
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Update',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
          return {
            from: document.getElementById('edit-from').value,
            to: document.getElementById('edit-to').value,
            method: document.getElementById('edit-method').value,
            amount: document.getElementById('edit-amount').value,
            paid_on: document.getElementById('edit-date').value,
            description: document.getElementById('edit-description').value,
            status: document.getElementById('edit-status').value,
            tags: document.getElementById('edit-tags').value
          };
        }
      }).then((result) => {
        if (result.isConfirmed) {
          handleUpdatePayment(transaction.id, result.value);
        }
      });
    } else {
      // Expense edit form (simpler version)
      Swal.fire({
        title: 'Edit Expense Transaction',
        html: `
          <div style="text-align: left;">
            <div style="margin-bottom: 15px;">
              <label>Account:</label>
              <input id="edit-account" class="swal2-input" value="${transaction.account || transaction.account_name || ''}" placeholder="Account name">
            </div>
            <div style="margin-bottom: 15px;">
              <label>Amount:</label>
              <input id="edit-amount" class="swal2-input" type="number" value="${transaction.amount || transaction.total_amount || ''}" placeholder="Amount">
            </div>
            <div style="margin-bottom: 15px;">
              <label>Date:</label>
              <input id="edit-date" class="swal2-input" type="date" value="${transaction.date || transaction.expense_date || ''}">
            </div>
            <div style="margin-bottom: 15px;">
              <label>Description:</label>
              <input id="edit-description" class="swal2-input" value="${transaction.notes || transaction.description || ''}" placeholder="Description">
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Update',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
          return {
            account: document.getElementById('edit-account').value,
            amount: document.getElementById('edit-amount').value,
            date: document.getElementById('edit-date').value,
            notes: document.getElementById('edit-description').value
          };
        }
      }).then((result) => {
        if (result.isConfirmed) {
          handleUpdateExpense(transaction.id, result.value);
        }
      });
    }
  };

  const handleUpdatePayment = async (id, data) => {
    setSaving(true);
    try {
      const payload = {
        invoice_id: editingTransaction.invoice_id || 0,
        method: data.method,
        amount: data.amount,
        paid_on: data.paid_on,
        status: data.status,
        from: data.from,
        to: data.to,
        description: data.description,
        tags: data.tags
      };
      
      await putWithAuth(`payments/${id}`, payload, token);
      Swal.fire('Updated!', 'Payment updated successfully', 'success');
      fetchTransactions(); // Refresh the list
    } catch (error) {
      Swal.fire('Error!', 'Failed to update payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateExpense = async (id, data) => {
    setSaving(true);
    try {
      const payload = {
        account: data.account,
        amount: data.amount,
        date: data.date,
        notes: data.notes
      };
      
      await putWithAuth(`expenses/${id}`, payload, token);
      Swal.fire('Updated!', 'Expense updated successfully', 'success');
      fetchTransactions(); // Refresh the list
    } catch (error) {
      Swal.fire('Error!', 'Failed to update expense', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Export helpers
  const getTableData = () => {
    const table = document.getElementById("transactionTable")
    if (!table) return { headers: [], rows: [] }
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.innerText.trim())
    const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim())
    )
    return { headers, rows }
  }

  const handleCopy = () => {
    const { headers, rows } = getTableData()
    const text = [headers, ...rows].map((r) => r.join("\t")).join("\n")
    navigator.clipboard.writeText(text).then(() =>
      Swal.fire({ icon: "success", title: "Copied!", timer: 1200, showConfirmButton: false })
    )
  }

  const handleCSV = () => {
    const { headers, rows } = getTableData()
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
    triggerDownload("transactions.csv", "text/csv", csv)
  }

  const handleExcel = () => {
    const { headers, rows } = getTableData()
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Transactions"><Table>${[headers, ...rows].map((r) => `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`
    triggerDownload("transactions.xls", "application/vnd.ms-excel", xml)
  }

  const handlePrint = () => {
    const table = document.getElementById("transactionTable")
    if (!table) return
    const win = window.open("", "_blank")
    win.document.write(`<html><head><title>Transaction List</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#009688;color:#fff}</style></head><body>${table.outerHTML}</body></html>`)
    win.document.close()
    win.print()
  }

  const triggerDownload = (name, mime, content) => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([content], { type: mime }))
    a.download = name
    a.click()
  }

  useEffect(() => {
    if (token) fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-money"></i>
        </div>
        <div className="header-title">
          <h1>Transaction</h1>
          <small>Transaction List</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel lobidisable panel-bd">
              <div className="panel-heading">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div className="panel-title">
                    <h4>Transaction List</h4>
                  </div>
                  <div className="btn-group buttonexport">
                    <button type="button" className="btn btn-default btn-sm" onClick={handleCopy}>
                      <i className="fa fa-copy"></i> Copy
                    </button>
                    <button type="button" className="btn btn-default btn-sm" onClick={handleExcel}>
                      <i className="fa fa-file-excel-o"></i> Excel
                    </button>
                    <button type="button" className="btn btn-default btn-sm" onClick={handleCSV}>
                      <i className="fa fa-file-text-o"></i> CSV
                    </button>
                    <button type="button" className="btn btn-default btn-sm" onClick={handlePrint}>
                      <i className="fa fa-print"></i> Print
                    </button>
                  </div>
                </div>
              </div>
              <div className="panel-body">
                <div className="table-responsive">
                  <table id="transactionTable" className="table table-bordered table-hover">
                    <thead>
                      <tr className="info">
                        <th>Date</th>
                        <th>Account</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Description</th>
                        <th>Debit</th>
                        <th>Credit</th>
                        <th>Balance</th>
                        <th>Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr><td colSpan={9} className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading...</td></tr>
                      )}
                      {!loading && transactions.length === 0 && (
                        <tr><td colSpan={9} className="text-center">No transactions found</td></tr>
                      )}
                      {!loading && transactions.map((t, idx) => (
                        <tr key={t.id || idx}>
                          <td>{t.date}</td>
                          <td>{t.type === "Income" ? `${t.from || '-'} → ${t.to || '-'}` : (t.account || t.account_name || '-')}</td>
                          <td>
                            <span className={`badge badge-${t.type === "Income" ? 'success' : 'danger'}`}>
                              {t.type}
                            </span>
                          </td>
                          <td>{formatINR(t.amount)}</td>
                          <td>{t.description || t.notes || '-'}</td>
                          <td>
                            {t.type === "Expense" ? (
                              <span className="text-danger">{formatINR(t.amount)}</span>
                            ) : (
                              <span>-</span>
                            )}
                          </td>
                          <td>
                            {t.type === "Income" ? (
                              <span className="text-success">{formatINR(t.amount)}</span>
                            ) : (
                              <span>-</span>
                            )}
                          </td>
                          <td>
                            <span className={`font-weight-bold ${t.balance >= 0 ? 'text-success' : 'text-danger'}`}>
                              {formatINR(Math.abs(t.balance))}
                              {t.balance < 0 && ' (Dr)'}
                            </span>
                          </td>
                          <td>
                            <div className="btn-group">
                              <button className="btn btn-sm btn-info dropdown-toggle" data-toggle="dropdown">
                                <i className="fa fa-cog"></i> Manage
                              </button>
                              <ul className="dropdown-menu">
                                <li>
                                  <a href="#" onClick={(e) => { e.preventDefault(); handleEdit(t); }}>
                                    <i className="fa fa-edit"></i> Edit
                                  </a>
                                </li>
                                <li>
                                  <a href="#" onClick={(e) => { e.preventDefault(); handleDelete(t); }}>
                                    <i className="fa fa-trash"></i> Delete
                                  </a>
                                </li>
                              </ul>
                            </div>
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

export default ViewTransaction;
