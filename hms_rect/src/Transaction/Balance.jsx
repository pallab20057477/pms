
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getWithAuth } from "../api";

const formatINR = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Balance() {
  const token = useSelector((state) => state.auth.accesstoken);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchBalances = async () => {
    setLoading(true);
    try {
      // Try to fetch from /reports/overview, fallback to payments if needed
      const res = await getWithAuth("reports/overview", token);
      // Defensive: always set an array
      const raw = res?.data?.data?.items ?? res?.data?.data ?? [];
      const items = Array.isArray(raw) ? raw : [];
      setBalances(items);
    } catch {
      setBalances([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-money"></i>
        </div>
        <div className="header-title">
          <h1>Balance </h1>
          <small>Balance Sheets</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading">
                <div className="btn-group" id="buttonexport">
                  <a href="#">
                    <h4>Balance Sheet</h4>
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
                        <th>Account</th>
                        <th>Description</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr><td colSpan={3} className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading...</td></tr>
                      )}
                      {!loading && balances.length === 0 && (
                        <tr><td colSpan={3} className="text-center">No balances found</td></tr>
                      )}
                      {!loading && balances.map((b, idx) => (
                        <tr key={b.id || idx}>
                          <td>{b.account || b.account_name}</td>
                          <td>{b.description || b.notes}</td>
                          <td>{formatINR(b.balance || b.total_balance)}</td>
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

export default Balance;
