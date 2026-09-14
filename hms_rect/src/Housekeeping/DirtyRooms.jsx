import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { useSelector } from "react-redux";
import { getWithAuth, postWithAuth } from "../api";
import "./DirtyRoomsModern.css";

function formatAgo(minutes) {
  const mins = Number(minutes || 0);
  if (mins <= 0) return "-";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default function DirtyRooms() {
  const token = useSelector((state) => state.auth?.accesstoken);
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [activeRoom, setActiveRoom] = useState(null);
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Only allow staff with role Housekeeping or Maintenance
  const knownStaff = useMemo(() => {
    const allowedRoles = ["housekeeping", "maintenance"];
    const filtered = staff
      .filter((s) => allowedRoles.includes(String(s.role || "").trim().toLowerCase()))
      .map((s) => (s.name || "").trim())
      .filter(Boolean);
    if (filtered.length > 0) return filtered;
    // fallback: show only previously assigned staff if no staff loaded
    const names = items.map((x) => (x.assigned_to || "").trim()).filter(Boolean);
    return [...new Set(names)];
  }, [items, staff]);

  const totalDirty = useMemo(() => items.filter((r) => r.room_status !== "maintenance").length, [items]);
  const highPriority = useMemo(() => items.filter((r) => r.room_status !== "maintenance" && Number(r.dirty_since_min || 0) >= 240).length, [items]);
  const assignedCount = useMemo(() => items.filter((r) => String(r.assigned_to || "").trim().length > 0).length, [items]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getWithAuth(`housekeeping/dirty?filter=${filter}`, token);
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
  }, [token, filter]);

  useEffect(() => {
    const loadStaff = async () => {
      if (!token) return;
      try {
        const res = await getWithAuth("staff?limit=200", token);
        const rows = res?.data?.data?.items || [];
        setStaff(Array.isArray(rows) ? rows : []);
      } catch {
        setStaff([]);
      }
    };
    loadStaff();
  }, [token]);

  const openAssign = (row) => {
    setActiveRoom(row);
    setAssignedTo(row.assigned_to || "");
    setNotes(row.notes || "");
  };

  const startCleaning = async (e) => {
    e.preventDefault();
    if (!activeRoom) return;
    if (!assignedTo.trim()) {
      Swal.fire({ icon: "error", title: "Staff name is required" });
      return;
    }

    setSubmitting(true);
    try {
      await postWithAuth("housekeeping/start", {
        room_id: activeRoom.room_id,
        assigned_to: assignedTo.trim(),
        notes: notes.trim(),
      }, token);
      Swal.fire({ icon: "success", title: "Cleaning started" });
      setActiveRoom(null);
      setAssignedTo("");
      setNotes("");
      load();
    } catch (err) {
      Swal.fire({ icon: "error", title: err?.response?.data?.error || "Failed to start cleaning" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon"><i className="glyphicon glyphicon-alert"></i></div>
        <div className="header-title">
          <h1>Dirty Rooms</h1>
          <small>Assign staff and start cleaning</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="row dirty-kpi-row">
              <div className="col-sm-3 col-xs-6">
                <div className="dirty-kpi-card dirty-kpi-total">
                  <span className="dirty-kpi-label">Dirty Rooms</span>
                  <div className="dirty-kpi-value">{totalDirty}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="dirty-kpi-card dirty-kpi-priority">
                  <span className="dirty-kpi-label">High Priority</span>
                  <div className="dirty-kpi-value">{highPriority}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="dirty-kpi-card dirty-kpi-assigned">
                  <span className="dirty-kpi-label">Assigned</span>
                  <div className="dirty-kpi-value">{assignedCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="dirty-kpi-card dirty-kpi-unassigned">
                  <span className="dirty-kpi-label">Unassigned</span>
                  <div className="dirty-kpi-value">{Math.max(0, totalDirty - assignedCount)}</div>
                </div>
              </div>
            </div>

            <div className="panel panel-bd lobidrag dirty-panel">
              <div className="panel-heading dirty-panel-heading">
                <div>
                  <h4 className="dirty-panel-title">Dirty Rooms Dashboard</h4>
                  <p className="dirty-panel-subtitle">Prioritize room cleaning based on checkout timelines and staff assignment.</p>
                </div>
                <div className="btn-group dirty-filter-group">
                  <button className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-default"}`} onClick={() => setFilter("all")}>All Dirty Rooms</button>
                  <button className={`btn btn-sm ${filter === "today" ? "btn-primary" : "btn-default"}`} onClick={() => setFilter("today")}>Today's Dirty Rooms</button>
                  <button className={`btn btn-sm ${filter === "high_priority" ? "btn-danger" : "btn-default"}`} onClick={() => setFilter("high_priority")}>High Priority</button>
                </div>
              </div>

              <div className="panel-body">
                <div className="table-responsive">
                  <table className="table table-bordered table-striped table-hover dirty-table">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Checkout Time</th>
                        <th>Customer</th>
                        <th>Time Since Dirty</th>
                        <th>Assigned Staff</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={8} className="text-center"><i className="glyphicon glyphicon-refresh dirty-spin"></i> Loading...</td></tr>
                      ) : items.length === 0 ? (
                        <tr><td colSpan={8} className="text-center">No dirty rooms found</td></tr>
                      ) : items.map((row) => (
                        <tr key={row.room_id}>
                          <td>{row.room_number}</td>
                          <td>{typeof row.room_type === "object" ? (row.room_type?.name || "-") : (row.room_type || "-")}</td>
                          <td>
                            {row.room_status === "maintenance" ? (
                              <span className="label label-default">Maintenance</span>
                            ) : (
                              <span className="label label-warning">Dirty</span>
                            )}
                          </td>
                          <td>{row.checkout_time ? new Date(row.checkout_time).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "-"}</td>
                          <td>{row.guest_name || "-"}</td>
                          <td>
                            {row.room_status === "maintenance" ? (
                              <span className="label label-default">-</span>
                            ) : (
                              <span className={row.dirty_since_min >= 240 ? "label label-danger" : "label label-warning"}>
                                {formatAgo(row.dirty_since_min)}
                              </span>
                            )}
                          </td>
                          <td>{row.assigned_to || "-"}</td>
                          <td>
                            {row.room_status === "maintenance" ? (
                              <button className="btn btn-default btn-sm" disabled>
                                <i className="glyphicon glyphicon-ban-circle"></i> Blocked by Maintenance
                              </button>
                            ) : (
                              <button className="btn btn-info btn-sm dirty-action-btn" onClick={() => openAssign(row)}>
                                <i className="glyphicon glyphicon-user"></i> Assign Staff / Start Cleaning
                              </button>
                            )}
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

        {activeRoom && (
          <div className="dirty-modal-overlay">
            <div className="dirty-modal-card">
              <div className="dirty-modal-head">
                <h4>Room {activeRoom.room_number} - Start Cleaning</h4>
                <button className="btn btn-default btn-sm" onClick={() => setActiveRoom(null)}>Close</button>
              </div>
              <form onSubmit={startCleaning} className="dirty-modal-form">
                <div className="form-group">
                  <label>Assign Staff</label>
                  <select
                    className="form-control dirty-input"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    required
                  >
                    <option value="">Select Staff</option>
                    {knownStaff.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes (optional)</label>
                  <textarea className="form-control dirty-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Extra dirty - deep cleaning needed" />
                </div>
                <div className="dirty-modal-actions">
                  <button type="submit" className="btn btn-success" disabled={submitting}>
                    {submitting ? "Starting..." : "Start Cleaning"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
