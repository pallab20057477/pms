

import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import TableExportButtons from "../Component/TableExportButtons";
import { getWithAuth } from "../api";

const formatINR = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ExpenseCategory() {
  const token = useSelector((state) => state.auth?.accesstoken);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await getWithAuth("expenses?limit=100", token);
        const expenses = res?.data?.data?.items || res?.data?.data || [];
        const tableRows = expenses.map((e, idx) => ({
          no: idx + 1,
          date: e.expense_date || "-",
          type: e.category || "-",
          description: e.title || e.notes || "-",
          amount: e.amount ? formatINR(e.amount) : "-",
          status: e.status === true ? "Paid" : "Not pay"
        }));
        setRows(tableRows);
      } catch {
        setRows([]);
      }
      setLoading(false);
    };
    if (token) fetchData();
  }, [token]);

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-modx"></i>
        </div>
        <div className="header-title">
          <h1>Expense Category</h1>
          <small>Expense category details</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading">
                <div className="btn-group" id="buttonexport">
                  <h4>Expense category</h4>
                </div>
              </div>
              <div className="panel-body">
                <TableExportButtons tableId="categoryTable" filename="expense_category" />
                <div className="table-responsive">
                  <table id="categoryTable" className="table table-bordered table-striped table-hover">
                    <thead>
                      <tr className="info">
                        <th>Item no.</th>
                        <th>Date</th>
                        <th>type</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={6} className="text-center">Loading...</td></tr>
                      ) : rows.length === 0 ? (
                        <tr><td colSpan={6} className="text-center">No data found</td></tr>
                      ) : (
                        rows.map((row, i) => (
                          <tr key={i}>
                            <td>{row.no}</td>
                            <td>{row.date}</td>
                            <td>{row.type}</td>
                            <td>{row.description}</td>
                            <td>{row.amount}</td>
                            <td><span className={row.status === "Paid" ? "label-custom label label-default" : "label-danger label label-default"}>{row.status}</span></td>
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
