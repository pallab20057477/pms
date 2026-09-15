import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { deleteWithAuth, getWithAuth, patchWithAuth } from "../api";
import { resolveAssetUrl } from "../Functions/assetUrl";
import { ConfirmDialog, RoomStatusDialog } from "./RoomDialogs";
import { formatCurrency, formatDateTime, formatShortDate, getStatusMeta, sortRoomImages } from "./roomUi";
import "./RoomDetailModern.css";

function getRoomImages(room) {
  return sortRoomImages(room?.images || []);
}

function getAmenityNames(room) {
  return Array.isArray(room?.amenities) ? room.amenities.map((amenity) => amenity.name).filter(Boolean) : [];
}

function getRoomTypeName(room) {
  if (!room) return "-";
  if (typeof room.room_type === "string") {
    return room.room_type.trim() === "" ? "No Type Assigned" : room.room_type;
  }
  if (room.room_type && typeof room.room_type === "object") {
    return room.room_type.name || "No Type Assigned";
  }
  if (room.room_type_details && typeof room.room_type_details === "object") {
    return room.room_type_details.name || "No Type Assigned";
  }
  return "No Type Assigned";
}

export default function RoomDetail() {
  const { id } = useParams();
  const token = useSelector((state) => state.auth.accesstoken);
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusDialog, setStatusDialog] = useState({ open: false, initialStatus: "" });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const loadRoom = async () => {
    setLoading(true);
    try {
      const response = await getWithAuth(`/rooms/${id}`, token);
      const data = response.data?.data ? response.data.data : response.data;
      setRoom(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load room");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadRoom();
    }
  }, [id, token]);

  const images = useMemo(() => getRoomImages(room), [room]);
  const amenityNames = useMemo(() => getAmenityNames(room), [room]);
  const activeImage = images[activeImageIndex] || images[0] || null;
  const statusMeta = getStatusMeta(room?.status);

  const goToPrevImage = () => {
    if (!images.length) return;
    setActiveImageIndex((current) => (current - 1 + images.length) % images.length);
  };

  const goToNextImage = () => {
    if (!images.length) return;
    setActiveImageIndex((current) => (current + 1) % images.length);
  };

  useEffect(() => {
    if (activeImageIndex > images.length - 1) {
      setActiveImageIndex(0);
    }
  }, [activeImageIndex, images.length]);

  const handleStatusSubmit = async (payload) => {
    if (!room) return;
    setBusy(true);
    try {
      await patchWithAuth(`/rooms/${room.id}/status`, payload, token);
      setStatusDialog({ open: false, initialStatus: "" });
      toast.success("Room status updated");
      await loadRoom();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || "Failed to update room status");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!room) return;
    setBusy(true);
    try {
      await deleteWithAuth(`/rooms/${room.id}`, token);
      toast.success("Room deleted successfully");
      navigate("/rooms");
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || "Failed to delete room");
    } finally {
      setBusy(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return <div className="content" style={{ padding: 24, textAlign: "center" }}>Loading room details...</div>;
  }

  if (!room) {
    return <div className="content" style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Room not found.</div>;
  }

  return (
    <div className="content">
      <div className="ep-header">
        <div className="ep-title-block">
          <h1 className="ep-title">Room {room.room_number}</h1>
          <div className="ep-meta-row">
            <span className="ep-meta-tag">{getRoomTypeName(room)}</span>
            <span className="ep-meta-tag" style={{ background: statusMeta.bg, color: statusMeta.color, borderColor: "transparent" }}>
              {statusMeta.label}
            </span>
          </div>
        </div>
        <div>
          <button type="button" className="ep-btn" style={{ marginRight: 8 }} onClick={() => navigate(-1)}>
            Back
          </button>
          <button
            type="button"
            className="ep-btn"
            style={{ marginRight: 8 }}
            onClick={() => setStatusDialog({ open: true, initialStatus: room.status })}
          >
            Change Status
          </button>
          <Link to={`/rooms/${room.id}/edit`} className="ep-btn ep-btn-primary">
            Edit Room
          </Link>
        </div>
      </div>

      <div className="ep-panel">
        <div className="ep-panel-header">
          <h4 className="ep-panel-title">Inventory Data</h4>
        </div>
        <div className="ep-panel-body">
          <div className="ep-grid" style={{ marginBottom: 24 }}>
            <div className="ep-data-group">
              <span className="ep-label">Base Price</span>
              <span className="ep-value">{formatCurrency(room.base_price)}</span>
            </div>
            <div className="ep-data-group">
              <span className="ep-label">Max Occupancy</span>
              <span className="ep-value">{room.max_occupancy || 2} Pax</span>
            </div>
            <div className="ep-data-group">
              <span className="ep-label">Bed Type</span>
              <span className="ep-value">{room.bed_type || "N/A"}</span>
            </div>
            <div className="ep-data-group">
              <span className="ep-label">Room Size</span>
              <span className="ep-value">{room.room_size ? `${room.room_size} sqft` : "N/A"}</span>
            </div>
            <div className="ep-data-group">
              <span className="ep-label">View Type</span>
              <span className="ep-value">{room.view_type || "N/A"}</span>
            </div>
          </div>
          
          <div className="ep-data-group" style={{ marginBottom: 24 }}>
            <span className="ep-label">Description</span>
            <span className="ep-value" style={{ fontWeight: 400 }}>{room.description || "No description provided."}</span>
          </div>
          
          <div className="ep-data-group">
            <span className="ep-label">Amenities</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {amenityNames.length ? (
                amenityNames.map((name) => (
                  <span key={name} className="ep-meta-tag">{name}</span>
                ))
              ) : (
                <span className="ep-value" style={{ fontWeight: 400 }}>No amenities assigned.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="ep-panel">
        <div className="ep-panel-header">
          <h4 className="ep-panel-title">Gallery</h4>
          <span className="ep-meta-tag">{images.length} Images</span>
        </div>
        <div className="ep-panel-body" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {images.length ? (
            images.map((image, index) => (
              <button
                key={image.id || image.url || index}
                type="button"
                onClick={() => {
                  setActiveImageIndex(index);
                  setIsLightboxOpen(true);
                }}
                style={{
                  width: 140,
                  height: 100,
                  border: "1px solid #E0E0E0",
                  padding: 2,
                  background: "#fff",
                  cursor: "zoom-in"
                }}
              >
                <img
                  src={resolveAssetUrl(image.url, "rooms")}
                  alt={`Room ${room.room_number}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </button>
            ))
          ) : (
            <div className="text-muted">No images uploaded.</div>
          )}
        </div>
      </div>

      <div className="ep-panel">
        <div className="ep-panel-header">
          <h4 className="ep-panel-title">Recent Bookings</h4>
        </div>
        <div className="ep-panel-body">
          {!room.recent_bookings || !room.recent_bookings.length ? (
            <div className="text-muted">No recent bookings found for this room.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-bordered table-hover" style={{ marginBottom: 0 }}>
                <thead>
                  <tr className="info">
                    <th>Booking</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {room.recent_bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.booking_code || `#${booking.id}`}</td>
                      <td>{booking.guest_name || `Customer ${booking.guest_id}`}</td>
                      <td>{booking.status || "-"}</td>
                      <td>{formatShortDate(booking.check_in_date)}</td>
                      <td>{formatShortDate(booking.check_out_date)}</td>
                      <td>{formatCurrency(booking.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <RoomStatusDialog
        open={statusDialog.open}
        room={room}
        initialStatus={statusDialog.initialStatus}
        busy={busy}
        onClose={() => setStatusDialog({ open: false, initialStatus: "" })}
        onSubmit={handleStatusSubmit}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete room"
        message={`Room ${room.room_number} will be deleted permanently. This action cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
      />

      {isLightboxOpen && activeImage ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.92)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <button
            type="button"
            className="btn btn-default"
            onClick={() => setIsLightboxOpen(false)}
            style={{ position: "absolute", top: 20, right: 20 }}
          >
            Close
          </button>

          {images.length > 1 ? (
            <button
              type="button"
              className="btn btn-default"
              onClick={goToPrevImage}
              style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)" }}
            >
              <i className="fa fa-chevron-left" />
            </button>
          ) : null}

          <img
            src={resolveAssetUrl(activeImage.url, "rooms")}
            alt={`Room ${room.room_number}`}
            style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 8 }}
          />

          {images.length > 1 ? (
            <button
              type="button"
              className="btn btn-default"
              onClick={goToNextImage}
              style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)" }}
            >
              <i className="fa fa-chevron-right" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
