import React, { useEffect, useMemo, useState } from "react";
import { ROOM_STATUS_OPTIONS, getStatusMeta } from "./roomUi";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.58)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 1050,
};

const dialogStyle = {
  width: "100%",
  maxWidth: 560,
  background: "#ffffff",
  borderRadius: 18,
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
  border: "1px solid #dbe4f0",
  overflow: "hidden",
};

const buttonStyle = {
  minWidth: 110,
};

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  const confirmClass = tone === "danger" ? "btn btn-danger" : "btn btn-success";

  return (
    <div style={overlayStyle}>
      <div style={{ ...dialogStyle, maxWidth: 460 }}>
        <div style={{ padding: "20px 24px 8px" }}>
          <h4 style={{ margin: 0, color: "#0f172a" }}>{title}</h4>
        </div>
        <div style={{ padding: "0 24px 20px", color: "#475569", lineHeight: 1.6 }}>
          {message}
        </div>
        <div style={{ padding: "0 24px 24px", textAlign: "right" }}>
          <button type="button" className="btn btn-default" style={{ marginRight: 10 }} onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={confirmClass} style={buttonStyle} onClick={onConfirm} disabled={busy}>
            {busy ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoomStatusDialog({
  open,
  room,
  initialStatus,
  busy = false,
  onClose,
  onSubmit,
}) {
  const defaultStatus = useMemo(() => initialStatus || room?.status || "available", [initialStatus, room]);
  const [status, setStatus] = useState(defaultStatus);
  const [reason, setReason] = useState("");
  const [expectedReady, setExpectedReady] = useState("");

  useEffect(() => {
    if (!open) return;
    const nextStatus = initialStatus || room?.status || "available";
    setStatus(nextStatus);
    setReason(nextStatus === "maintenance" ? room?.maintenance_reason || "" : "");
    setExpectedReady(nextStatus === "maintenance" ? toDateInput(room?.maintenance_until) : "");
  }, [open, room, initialStatus]);

  if (!open || !room) return null;

  const meta = getStatusMeta(status);

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <div style={{ padding: "22px 24px 18px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h4 style={{ margin: "0 0 6px", color: "#0f172a" }}>Update Room Status</h4>
              <p style={{ margin: 0, color: "#64748b" }}>
                Room {room.room_number} is currently{" "}
                <span style={{ background: meta.bg, color: meta.color, borderRadius: 999, padding: "4px 10px", fontWeight: 700 }}>
                  {meta.label}
                </span>
              </p>
            </div>
            <button type="button" className="btn btn-default" onClick={onClose} disabled={busy}>
              Close
            </button>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              status,
              reason: status === "maintenance" ? reason.trim() : "",
              expected_ready: status === "maintenance" ? expectedReady : "",
            });
          }}
          style={{ padding: 24 }}
        >
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={status} onChange={(event) => setStatus(event.target.value)} disabled={busy}>
              {ROOM_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getStatusMeta(option).label}
                </option>
              ))}
            </select>
          </div>

          {status === "maintenance" ? (
            <React.Fragment>
              <div className="form-group">
                <label>Maintenance Reason</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is this room under maintenance?"
                  required
                  disabled={busy}
                />
              </div>
              <div className="form-group">
                <label>Expected Ready Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={expectedReady}
                  onChange={(event) => setExpectedReady(event.target.value)}
                  required
                  disabled={busy}
                />
              </div>
            </React.Fragment>
          ) : null}

          <div style={{ textAlign: "right", marginTop: 24 }}>
            <button type="button" className="btn btn-default" style={{ marginRight: 10 }} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-success" style={buttonStyle} disabled={busy}>
              {busy ? "Saving..." : "Save Status"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
