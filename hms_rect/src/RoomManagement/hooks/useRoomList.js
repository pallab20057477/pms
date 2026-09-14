import { useState, useEffect, useMemo } from "react";
import { getWithAuth, patchWithAuth, deleteWithAuth } from "../../api";
import toast from "react-hot-toast";

function getRoomTypeName(room) {
  if (!room) return "-";
  if (typeof room.room_type === "string") return room.room_type;
  if (room.room_type && typeof room.room_type === "object") return room.room_type.name || "-";
  if (room.room_type_details && typeof room.room_type_details === "object") return room.room_type_details.name || "-";
  return "-";
}

export default function useRoomList(isMaintenanceView, token) {
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
        if (mounted) setLoading(false);
      }
    }

    if (token) loadRooms();

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

  return {
    rooms,
    loading,
    query, setQuery,
    statusFilter, setStatusFilter,
    typeFilter, setTypeFilter,
    statusDialog, setStatusDialog,
    deleteTarget, setDeleteTarget,
    actionBusy,
    roomTypes,
    filteredRooms,
    availableCount,
    occupiedCount,
    maintenanceCount,
    handleStatusSubmit,
    handleDelete
  };
}
