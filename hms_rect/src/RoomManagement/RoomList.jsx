import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { deleteWithAuth, getWithAuth, patchWithAuth } from "../api";
import { resolveAssetUrl } from "../Functions/assetUrl";
import { ConfirmDialog, RoomStatusDialog } from "./RoomDialogs";
import { formatCurrency, formatShortDate, getStatusMeta, sortRoomImages } from "./roomUi";
import "./RoomListModern.css";

function getRoomImages(room) {
  return sortRoomImages(room?.images || []);
}

function getPrimaryImage(room) {
  const orderedImages = getRoomImages(room);
  return room?.image || orderedImages[0]?.url || "";
}

function getAmenityNames(room) {
  return Array.isArray(room?.amenities) ? room.amenities.map((amenity) => amenity.name).filter(Boolean) : [];
}

function getRoomTypeName(room) {
  if (!room) return "-";
  if (typeof room.room_type === "string") return room.room_type;
  if (room.room_type && typeof room.room_type === "object") return room.room_type.name || "-";
  if (room.room_type_details && typeof room.room_type_details === "object") return room.room_type_details.name || "-";
  return "-";
}

function EmptyState({ isMaintenanceView }) {
  return (
    <div style={{ padding: 36, textAlign: "center", color: "#64748b" }}>
      <div style={{ fontSize: 38, marginBottom: 10 }}>
        <i className="fa-solid fa-bed" />
      </div>
      <h4 style={{ color: "#0f172a" }}>{isMaintenanceView ? "No rooms in maintenance" : "No rooms found"}</h4>
      <p style={{ marginBottom: 0 }}>
        {isMaintenanceView
          ? "Rooms moved into maintenance will appear here automatically."
          : "Try adjusting your filters or add a new room for the selected hotel."}
      </p>
    </div>
  );
}

export default function RoomList() {
  const token = useSelector((state) => state.auth.accesstoken);
  const navigate = useNavigate();
  const location = useLocation();
  const isMaintenanceView = location.pathname === "/rooms/maintenance";

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusDialog, setStatusDialog] = useState({ open: false, room: null, initialStatus: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadRooms() {
      setLoading(true);
      try {
        const response = await getWithAuth(isMaintenanceView ? "/rooms/maintenance" : "/rooms", token);
        const data = response.data?.data ? response.data.data : response.data;
        if (mounted) {
          setRooms(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Failed to load rooms", error);
        toast.error("Failed to load rooms");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (token) {
      loadRooms();
    }

    return () => {
      mounted = false;
    };
  }, [isMaintenanceView, token]);

  useEffect(() => {
    setStatusFilter(isMaintenanceView ? "maintenance" : "");
  }, [isMaintenanceView]);

  const roomTypes = useMemo(() => {
    return [...new Set(rooms.map((room) => getRoomTypeName(room)).filter((t) => t && t !== "-"))].sort((a, b) => a.localeCompare(b));
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const roomNumber = String(room.room_number || "").toLowerCase();
      const roomType = getRoomTypeName(room).toLowerCase();
      const matchesQuery = !query.trim() || roomNumber.includes(query.trim().toLowerCase()) || roomType.includes(query.trim().toLowerCase());
      const matchesStatus = !statusFilter || room.status === statusFilter;
      const matchesType = !typeFilter || getRoomTypeName(room) === typeFilter;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [query, rooms, statusFilter, typeFilter]);

  const availableCount = useMemo(() => rooms.filter((room) => room.status === "available").length, [rooms]);
  const occupiedCount = useMemo(() => rooms.filter((room) => room.status === "occupied").length, [rooms]);
  const maintenanceCount = useMemo(() => rooms.filter((room) => room.status === "maintenance").length, [rooms]);

  const updateRoomInState = (updatedRoom) => {
    setRooms((current) => {
      if (isMaintenanceView && updatedRoom.status !== "maintenance") {
        return current.filter((room) => room.id !== updatedRoom.id);
      }
      return current.map((room) => (room.id === updatedRoom.id ? { ...room, ...updatedRoom } : room));
    });
  };

  const handleStatusSubmit = async (payload) => {
    if (!statusDialog.room) return;
    setActionBusy(true);
    try {
      const response = await patchWithAuth(`/rooms/${statusDialog.room.id}/status`, payload, token);
      const updatedRoom = response.data?.data ? response.data.data : response.data;
      updateRoomInState(updatedRoom);
      setStatusDialog({ open: false, room: null, initialStatus: "" });
      toast.success("Room status updated");
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || "Failed to update room status");
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await deleteWithAuth(`/rooms/${deleteTarget.id}`, token);
      setRooms((current) => current.filter((room) => room.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Room deleted successfully");
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || "Failed to delete room");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <section className="room-page-header">
        <div className="room-page-header-icon">
          <i className="fa-solid fa-bed" />
        </div>
        <div className="room-page-header-title">
          <h1>{isMaintenanceView ? "Maintenance Rooms" : "Room Management"}</h1>
          <p>{isMaintenanceView ? "Track blocked rooms and return them to service." : "Manage room inventory, images, statuses, and maintenance."}</p>
        </div>
      </section>

      <section className="content">
        <div className="row room-kpi-row">
          <div className="col-sm-6 col-md-3">
            <div className="room-kpi-card room-kpi-total">
              <div className="room-kpi-icon"><i className="fa-solid fa-list" /></div>
              <div>
                <div className="room-kpi-label">Total Rooms</div>
                <div className="room-kpi-value">{rooms.length}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-md-3">
            <div className="room-kpi-card room-kpi-available">
              <div className="room-kpi-icon"><i className="fa-solid fa-circle-check" /></div>
              <div>
                <div className="room-kpi-label">Available</div>
                <div className="room-kpi-value">{availableCount}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-md-3">
            <div className="room-kpi-card room-kpi-occupied">
              <div className="room-kpi-icon"><i className="fa-solid fa-user-check" /></div>
              <div>
                <div className="room-kpi-label">Occupied</div>
                <div className="room-kpi-value">{occupiedCount}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-md-3">
            <div className="room-kpi-card room-kpi-maintenance">
              <div className="room-kpi-icon"><i className="fa-solid fa-wrench" /></div>
              <div>
                <div className="room-kpi-label">Maintenance</div>
                <div className="room-kpi-value">{maintenanceCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel panel-bd lobidrag room-list-panel">
          <div className="panel-heading room-list-heading">
            <div className="row">
              <div className="col-sm-8">
                <div className="panel-title">
                  <h4 className="room-list-title">{isMaintenanceView ? "Maintenance Rooms" : "Room List"}</h4>
                  <div className="small text-muted room-list-subtitle">
                    {isMaintenanceView
                      ? "Track blocked rooms and return them to service."
                      : "Manage room inventory, images, statuses, and maintenance."}
                  </div>
                </div>
              </div>
              <div className="col-sm-4 text-right">
                <Link to="/rooms/new" className="btn room-add-btn">
                  <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                  Add New Room
                </Link>
              </div>
            </div>
          </div>

          <div className="panel-body">
            <div className="row room-filter-row">
              <div className="col-md-4">
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>Search</label>
                  <input
                    className="form-control"
                    placeholder="Room number or type"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
              <div className="col-md-3">
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>Status</label>
                  <select className="form-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} disabled={isMaintenanceView}>
                    <option value="">All statuses</option>
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="occupied">Occupied</option>
                    <option value="dirty">Dirty</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>
              <div className="col-md-3">
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>Room Type</label>
                  <select className="form-control" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                    <option value="">All room types</option>
                    {roomTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="col-md-2" />
            </div>
            <div className="text-muted room-filter-result">{filteredRooms.length} room(s) match the current filters.</div>
            {loading ? (
              <div className="text-center text-muted room-loading-wrap"><i className="fa-solid fa-spinner fa-spin spinning-icon" /> Loading rooms...</div>
            ) : !filteredRooms.length ? (
              <EmptyState isMaintenanceView={isMaintenanceView} />
            ) : (
              <div className="table-responsive room-table-wrap">
                <table className="table table-bordered table-hover room-table">
                  <thead>
                    <tr>
                      <th>Photo</th>
                      <th>Room</th>
                      <th>Inventory Config</th>
                      <th>Price</th>
                      <th>Amenities</th>
                      <th>Status</th>
                      <th>Maintenance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRooms.map((room) => {
                      const statusMeta = getStatusMeta(room.status);
                      const amenityNames = getAmenityNames(room);
                      const primaryImage = getPrimaryImage(room);
                      return (
                        <tr key={room.id}>
                          <td style={{ width: 74 }}>
                            {primaryImage ? (
                              <img src={resolveAssetUrl(primaryImage, "rooms")} alt={`Room ${room.room_number}`} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover" }} />
                            ) : (
                              <div style={{ width: 52, height: 52, borderRadius: 12, background: "#e2e8f0" }} />
                            )}
                          </td>
                          <td>
                            <strong>Room {room.room_number}</strong>
                            <div style={{ color: "#666666", fontSize: 11 }}>{getRoomImages(room).length} image(s)</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{getRoomTypeName(room)}</div>
                            <div style={{ color: "#666666", fontSize: 11 }}>
                              {room.bed_type || "N/A"} &bull; {room.max_occupancy || 2} Pax
                              <br/>
                              {room.room_size ? `${room.room_size} sqft` : "N/A"} &bull; {room.view_type || "N/A"}
                            </div>
                          </td>
                          <td>{formatCurrency(room.base_price)}</td>
                          <td>{amenityNames.length ? amenityNames.join(", ") : "-"}</td>
                          <td>
                            <span style={{ background: statusMeta.bg, color: statusMeta.color, borderRadius: 999, padding: "6px 12px", fontWeight: 700, fontSize: 12 }}>
                              {statusMeta.label}
                            </span>
                          </td>
                          <td>
                            {room.status === "maintenance" ? (
                              <div>
                                <div>{room.maintenance_reason || "No reason"}</div>
                                <small style={{ color: "#64748b" }}>{formatShortDate(room.maintenance_until)}</small>
                              </div>
                            ) : "-"}
                          </td>
                          <td>
                            <button type="button" className="room-action-btn room-btn-view" onClick={() => navigate(`/rooms/${room.id}`)}><i className="fa-solid fa-eye" /> View</button>
                            <button type="button" className="room-action-btn room-btn-edit" onClick={() => navigate(`/rooms/${room.id}/edit`)}><i className="fa-solid fa-pen-to-square" /> Edit</button>
                            <button type="button" className="room-action-btn room-btn-status" onClick={() => setStatusDialog({ open: true, room, initialStatus: room.status })}><i className="fa-solid fa-gear" /> Status</button>
                            <button type="button" className={`room-action-btn ${room.status === "maintenance" ? "room-btn-success" : "room-btn-warning"}`} onClick={() => setStatusDialog({ open: true, room, initialStatus: room.status === "maintenance" ? "available" : "maintenance" })}>
                              <i className={`fa-solid ${room.status === "maintenance" ? "fa-rotate-left" : "fa-wrench"}`} />
                              {room.status === "maintenance" ? "Restore" : "Maintenance"}
                            </button>
                            <button type="button" className="room-action-btn room-btn-delete" onClick={() => setDeleteTarget(room)}><i className="fa-solid fa-trash" /> Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      <RoomStatusDialog
        open={statusDialog.open}
        room={statusDialog.room}
        initialStatus={statusDialog.initialStatus}
        busy={actionBusy}
        onClose={() => setStatusDialog({ open: false, room: null, initialStatus: "" })}
        onSubmit={handleStatusSubmit}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete room"
        message={deleteTarget ? `Room ${deleteTarget.room_number} will be deleted permanently. This cannot be undone.` : ""}
        confirmLabel="Delete"
        tone="danger"
        busy={actionBusy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}
