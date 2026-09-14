import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { getWithAuth } from "../api";
import "./CleaningHistoryModern.css";

function formatDuration(mins, startTime, endTime) {
  const m = Number(mins || 0);
  if (m > 0) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h > 0 ? `${h}h ${r}m` : `${r}m`;
  }

  // For quick transitions (< 1 minute), backend minute rounding can be 0.
  // Fall back to second-level duration using start/end timestamps.
  if (startTime && endTime) {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      const seconds = Math.floor((end - start) / 1000);
      if (seconds > 0) return `${seconds}s`;
      return "< 1s";
    }
  }

  return "-";
}

export default function CleaningHistory() {
  const token = useSelector((state) => state.auth?.accesstoken);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const completedCount = useMemo(() => rows.filter((r) => (r.current_status || "").toLowerCase() === "available" || (r.current_status || "").toLowerCase() === "clean").length, [rows]);
  const avgDuration = useMemo(() => {
    const durations = rows.map((r) => Number(r.duration_min || 0)).filter((n) => Number.isFinite(n) && n > 0)
    if (durations.length === 0) return 0
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  }, [rows])
  const uniqueStaff = useMemo(() => new Set(rows.map((r) => String(r.assigned_to || "").trim()).filter(Boolean)).size, [rows])

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getWithAuth("housekeeping/history?limit=300", token);
      const items = res?.data?.items || res?.data?.data?.items || [];
      setRows(Array.isArray(items) ? items : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <>
      <section className="content-header">
        <div className="header-icon"><i className="glyphicon glyphicon-time"></i></div>
        <div className="header-title">
          <h1>Cleaning History</h1>
          <small>Audit trail and performance records</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="row cleaning-history-kpi-row">
              <div className="col-sm-3 col-xs-6">
                <div className="cleaning-history-kpi-card cleaning-history-kpi-total">
                  <span className="cleaning-history-kpi-label">Records</span>
                  <div className="cleaning-history-kpi-value">{rows.length}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="cleaning-history-kpi-card cleaning-history-kpi-completed">
                  <span className="cleaning-history-kpi-label">Completed</span>
                  <div className="cleaning-history-kpi-value">{completedCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="cleaning-history-kpi-card cleaning-history-kpi-duration">
                  <span className="cleaning-history-kpi-label">Avg Duration</span>
                  <div className="cleaning-history-kpi-value">{avgDuration}m</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="cleaning-history-kpi-card cleaning-history-kpi-staff">
                  <span className="cleaning-history-kpi-label">Staff Covered</span>
                  <div className="cleaning-history-kpi-value">{uniqueStaff}</div>
                </div>
              </div>
            </div>

            <div className="panel panel-bd lobidrag cleaning-history-panel">
              <div className="panel-heading cleaning-history-panel-heading">
                <div>
                  <h4 className="cleaning-history-panel-title">Housekeeping Activity History</h4>
                  <p className="cleaning-history-panel-subtitle">Review room transitions and team turnaround performance.</p>
                </div>
                <button className="btn btn-default btn-sm" onClick={load}><i className="glyphicon glyphicon-refresh"></i> Refresh</button>
              </div>
              <div className="panel-body">
                <div className="table-responsive">
                  <table className="table table-bordered table-striped table-hover cleaning-history-table">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Transition</th>
                        <th>Assigned Staff</th>
                        <th>Start Time</th>
                        <th>End Time</th>
                        <th>Duration</th>
                        <th>Notes</th>
                        <th>Logged At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={8} className="text-center"><i className="glyphicon glyphicon-refresh cleaning-history-spin"></i> Loading...</td></tr>
                      ) : rows.length === 0 ? (
                        <tr><td colSpan={8} className="text-center">No history found</td></tr>
                      ) : rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.room_number || `#${r.room_id}`}</td>
                          <td>{(r.previous_status || "-") + " → " + (r.current_status || "-")}</td>
                          <td>{r.assigned_to || "-"}</td>
                          <td>{r.start_time ? new Date(r.start_time).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "-"}</td>
                          <td>{r.end_time ? new Date(r.end_time).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "-"}</td>
                          <td>{formatDuration(r.duration_min, r.start_time, r.end_time)}</td>
                          <td>{r.notes || "-"}</td>
                          <td>{r.created_at ? new Date(r.created_at * 1000).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "-"}</td>
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
