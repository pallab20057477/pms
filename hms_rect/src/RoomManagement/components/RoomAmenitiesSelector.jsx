import React, { useMemo, useState } from "react";

export default function RoomAmenitiesSelector({ form, setForm, amenityOptions }) {
  const [amenityQuery, setAmenityQuery] = useState("");

  const filteredAmenityOptions = useMemo(() => {
    const q = amenityQuery.trim().toLowerCase();
    const ordered = [...amenityOptions].sort((a, b) => {
      const aSelected = form.amenities.includes(String(a.id));
      const bSelected = form.amenities.includes(String(b.id));
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    if (!q) return ordered;
    return ordered.filter((item) => String(item?.name || "").toLowerCase().includes(q));
  }, [amenityOptions, amenityQuery, form.amenities]);

  const toggleAmenity = (id) => {
    const strId = String(id);
    setForm((current) => {
      const currentList = Array.isArray(current.amenities) ? current.amenities : [];
      if (currentList.includes(strId)) {
        return { ...current, amenities: currentList.filter((v) => v !== strId) };
      }
      return { ...current, amenities: [...currentList, strId] };
    });
  };

  return (
    <div className="room-form-section">
      <h4 className="room-form-section-title">
        <i className="fa-solid fa-bell-concierge" /> Amenities
      </h4>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            className="form-control room-form-input"
            placeholder="Search amenities (WiFi, Balcony, AC...)"
            value={amenityQuery}
            onChange={(event) => setAmenityQuery(event.target.value)}
          />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, maxHeight: 400, overflowY: "auto", padding: "4px 4px 12px 4px" }}>
        {filteredAmenityOptions.map((item) => {
          const isSelected = form.amenities.includes(String(item.id));
          return (
            <button
              key={item.id}
              type="button"
              className={`btn btn-sm ${isSelected ? "btn-success" : "btn-default"}`}
              style={{
                borderRadius: 20,
                padding: "6px 14px",
                fontWeight: 600,
                border: isSelected ? "none" : "1px solid #cbd5e1",
                background: isSelected ? "var(--sa-accent)" : "#ffffff",
                color: isSelected ? "#ffffff" : "#475569",
                boxShadow: isSelected ? "0 4px 10px rgba(16, 185, 129, 0.3)" : "none",
                transition: "all 0.2s ease",
              }}
              onClick={() => toggleAmenity(item.id)}
            >
              {isSelected && <i className="fa-solid fa-check" style={{ marginRight: 6 }} />}
              {item.name}
            </button>
          );
        })}
        {!filteredAmenityOptions.length && (
          <div style={{ color: "#64748b", padding: 12, fontSize: 13, textAlign: "center", width: "100%" }}>
            No amenities match your search.
          </div>
        )}
      </div>
    </div>
  );
}
