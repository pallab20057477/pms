import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getWithAuth } from "../api";

const formatINR = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ClientPayment() {
  const token = useSelector((state) => state.auth?.accesstoken);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch payments
        const payRes = await getWithAuth("payments?limit=100", token);
        const payments = payRes?.data?.data?.items || [];
        // Fetch all invoices in one go
        const invRes = await getWithAuth("invoices?limit=100", token);
        const invoices = invRes?.data?.data?.items || [];
        // Map invoice id to invoice
        const invoiceMap = invoices.reduce((acc, inv) => {
          acc[inv.id] = inv;
          return acc;
        }, {});
        // Build rows for table
        const tableRows = payments.map((p) => {
          const inv = invoiceMap[p.invoice_id] || {};
          // Calculate balance due (amount - paid)
          let balanceDue = "-";
          if (inv.amount && p.amount) {
            const amt = parseFloat(inv.amount.replace(/[^\d.]/g, ""));
            const paid = parseFloat(p.amount.replace(/[^\d.]/g, ""));
            if (!isNaN(amt) && !isNaN(paid)) {
              balanceDue = formatINR(amt - paid);
            }
          }
          return {
            invoiceNo: inv.invoice_no || p.invoice_id || "-",
            invoiceDate: inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-GB') : "-",
            invoiceAmount: inv.amount ? formatINR(inv.amount) : p.amount ? formatINR(p.amount) : "-",
            balanceDue,
            dueDate: inv.due_date || "-",
            status: p.status || inv.status || "-"
          };
        });
        setRows(tableRows);
      } catch {
        setRows([]);
      }
      setLoading(false);
    };
    if (token) fetchData();
  }, [token]);

  const getStatusLabel = (status) => {
    if (status === "draft") return "label-warning label label-default";
    if (status === "paid" || status === "success") return "label-custom label label-default";
    if (status === "unpaid") return "label-danger label label-default";
    return "label label-default";
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-paypal"></i>
        </div>
        <div className="header-title">
          <h1>Client payment Report</h1>
          <small>Client payment details</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading">
                <div className="btn-group" id="buttonexport">
                  <a href="#">
                    <h4>Client payment</h4>
                  </a>
                </div>
              </div>
              <div className="panel-body">
                <div className="table-responsive">
                  <table className="table table-bordered table-striped table-hover">
                    <thead>
                      <tr className="info">
                        <th>Invoice No.</th>
                        <th>Invoice date</th>
                        <th>Invoice amount</th>
                        <th>Balance due</th>
                        <th>Due date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan="6" className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading...</td></tr>
                      ) : rows.length === 0 ? (
                        <tr><td colSpan="6" className="text-center">No payments found</td></tr>
                      ) : (
                        rows.map((p, idx) => (
                          <tr key={idx}>
                            <td>{p.invoiceNo}</td>
                            <td>{p.invoiceDate}</td>
                            <td>{p.invoiceAmount}</td>
                            <td>{p.balanceDue}</td>
                            <td>{p.dueDate}</td>
                            <td>
                              <span className={getStatusLabel(p.status)}>{p.status}</span>
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
