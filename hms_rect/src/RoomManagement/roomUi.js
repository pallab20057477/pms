export const ROOM_IMAGE_LIMIT = 8;

export const ROOM_TYPE_OPTIONS = [
  "Deluxe",
  "Standard",
  "Suite",
  "Executive",
  "Family",
  "Premium",
  "Twin",
];

export const ROOM_STATUS_OPTIONS = [
  "available",
  "reserved",
  "occupied",
  "dirty",
  "cleaning",
  "maintenance",
];

export const ROOM_STATUS_META = {
  available: { label: "Available", bg: "#d1fae5", color: "#065f46" },
  reserved: { label: "Reserved", bg: "#dbeafe", color: "#1d4ed8" },
  occupied: { label: "Occupied", bg: "#fee2e2", color: "#b91c1c" },
  dirty: { label: "Dirty", bg: "#fef3c7", color: "#92400e" },
  cleaning: { label: "Cleaning", bg: "#ede9fe", color: "#6d28d9" },
  maintenance: { label: "Maintenance", bg: "#e5e7eb", color: "#374151" },
};

export function getStatusMeta(status) {
  return ROOM_STATUS_META[status] || {
    label: status || "Unknown",
    bg: "#e5e7eb",
    color: "#374151",
  };
}

export function formatCurrency(value) {
  const amount = Number(value || 0);
  return `₹ ${amount.toFixed(2)}`;
}

export function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString('en-GB');
}

export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function sortRoomImages(images = []) {
  return [...images].sort((a, b) => {
    const aPrimary = a.is_primary || a.isPrimary ? 1 : 0;
    const bPrimary = b.is_primary || b.isPrimary ? 1 : 0;
    if (aPrimary !== bPrimary) return bPrimary - aPrimary;
    const aOrder = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
    const bOrder = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.id || 0) - (b.id || 0);
  });
}

export function moveItem(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
