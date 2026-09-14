
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getWithAuth } from "../api";

const formatINR = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function TReport() {
  const token = useSelector((state) => state.auth.accesstoken);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await getWithAuth("reports/overview", token);
      const raw = res?.data?.data?.items ?? res?.data?.data ?? [];
      const items = Array.isArray(raw) ? raw : [];
      setReports(items);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-file-text"></i>
        </div>
        <div className="header-title">
          <h1>Transfer Report</h1>
          <small>Transfer Reports List</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading">
                <div className="btn-group" id="buttonexport">
                  <a href="#">
                    <h4>Transfer Report</h4>
                  </a>
                </div>
              </div>
              <div className="panel-body">
                <div className="btn-group" style={{ marginBottom: 16 }}>
                  <button className="btn btn-exp btn-sm dropdown-toggle" data-toggle="dropdown">
                    <i className="fa fa-bars"></i> Export Table Data
                  </button>
                  {/* Export dropdown omitted for brevity */}
                </div>
                <div className="table-responsive">
                  <table className="table table-bordered table-striped table-hover">
                    <thead>
                      <tr className="info">
                        <th>Date</th>
                        <th>Account</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Description</th>
                        <th>Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr><td colSpan={7} className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading...</td></tr>
                      )}
                      {!loading && reports.length === 0 && (
                        <tr><td colSpan={7} className="text-center">No reports found</td></tr>
                      )}
                      {!loading && reports.map((r, idx) => (
                        <tr key={r.id || idx}>
                          <td>{r.date || r.expense_date}</td>
                          <td>{r.account || r.account_name}</td>
                          <td>{r.type || '-'}</td>
                          <td>{formatINR(r.amount || r.total_amount)}</td>
                          <td>{r.description || r.notes}</td>
                          <td>{r.balance !== undefined ? formatINR(r.balance) : '-'}</td>
                          <td>
                            <span className={
                              r.status === "send"
                                ? "label-custom label label-default"
                                : "label-danger label label-default"
                            }>
                              {r.status || '-'}
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

export default TReport;
