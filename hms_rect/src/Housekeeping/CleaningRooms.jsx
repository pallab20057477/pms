import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { useSelector } from "react-redux";
import { getWithAuth, postWithAuth } from "../api";
import "./CleaningRoomsModern.css";

function durationLabel(minutes) {
  const mins = Number(minutes || 0);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

export default function CleaningRooms() {
  const token = useSelector((state) => state.auth?.accesstoken);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const activeCount = useMemo(() => items.length, [items]);
  const longRunningCount = useMemo(() => items.filter((x) => Number(x.duration_min || 0) >= 60).length, [items]);
  const assignedCount = useMemo(() => items.filter((x) => String(x.assigned_to || "").trim().length > 0).length, [items]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getWithAuth("housekeeping/cleaning", token);
      const rows = res?.data?.items || res?.data?.data?.items || [];
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const complete = async (row) => {
    const result = await Swal.fire({
      title: `Mark Room ${row.room_number} as Clean?`,
      input: "text",
      inputLabel: "Notes (optional)",
      showCancelButton: true,
      confirmButtonText: "Mark Clean",
    });
    if (!result.isConfirmed) return;

    try {
      await postWithAuth("housekeeping/complete", {
        room_id: row.room_id,
        notes: result.value || "",
      }, token);
      Swal.fire({ icon: "success", title: "Room marked available" });
      load();
    } catch (err) {
      Swal.fire({ icon: "error", title: err?.response?.data?.error || "Failed to complete cleaning" });
    }
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon"><i className="glyphicon glyphicon-repeat"></i></div>
        <div className="header-title">
          <h1>Rooms in Cleaning</h1>
          <small>Track ongoing cleaning tasks</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="row cleaning-kpi-row">
              <div className="col-sm-3 col-xs-6">
                <div className="cleaning-kpi-card cleaning-kpi-total">
                  <span className="cleaning-kpi-label">Active Rooms</span>
                  <div className="cleaning-kpi-value">{activeCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="cleaning-kpi-card cleaning-kpi-long">
                  <span className="cleaning-kpi-label">60+ Min Tasks</span>
                  <div className="cleaning-kpi-value">{longRunningCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="cleaning-kpi-card cleaning-kpi-assigned">
                  <span className="cleaning-kpi-label">Assigned</span>
                  <div className="cleaning-kpi-value">{assignedCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="cleaning-kpi-card cleaning-kpi-unassigned">
                  <span className="cleaning-kpi-label">Unassigned</span>
                  <div className="cleaning-kpi-value">{Math.max(0, activeCount - assignedCount)}</div>
                </div>
              </div>
            </div>

            <div className="panel panel-bd lobidrag cleaning-panel">
              <div className="panel-heading cleaning-panel-heading">
                <div>
                  <h4 className="cleaning-panel-title">Cleaning Queue</h4>
                  <p className="cleaning-panel-subtitle">Monitor current housekeeping operations and close tasks quickly.</p>
                </div>
                <button className="btn btn-default btn-sm" onClick={load}><i className="glyphicon glyphicon-refresh"></i> Refresh</button>
              </div>
              <div className="panel-body">
                <div className="table-responsive">
                  <table className="table table-bordered table-striped table-hover cleaning-table">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Staff</th>
                        <th>Start Time</th>
                        <th>Duration</th>
                        <th>Notes</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={6} className="text-center"><i className="glyphicon glyphicon-refresh cleaning-spin"></i> Loading...</td></tr>
                      ) : items.length === 0 ? (
                        <tr><td colSpan={6} className="text-center">No rooms currently in cleaning</td></tr>
                      ) : items.map((row) => (
                        <tr key={row.room_id}>
                          <td>{row.room_number} ({typeof row.room_type === "object" ? (row.room_type?.name || "-") : (row.room_type || "-")})</td>
                          <td>{row.assigned_to || "-"}</td>
                          <td>{row.start_time ? new Date(row.start_time).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "-"}</td>
                          <td>{durationLabel(row.duration_min)}</td>
                          <td>{row.notes || "-"}</td>
                          <td>
                            <button className="btn btn-success btn-sm cleaning-action-btn" onClick={() => complete(row)}>
                              <i className="glyphicon glyphicon-ok"></i> Mark as Clean
                            </button>
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
