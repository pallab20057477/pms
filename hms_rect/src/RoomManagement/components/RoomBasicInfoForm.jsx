import React from "react";
import { ROOM_TYPE_OPTIONS } from "../roomUi";

export default function RoomBasicInfoForm({ form, setForm }) {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="room-form-section">
      <h4 className="room-form-section-title">
        <i className="fa-solid fa-circle-info" /> Basic Information
      </h4>
      <div className="row">
        <div className="col-sm-6">
          <div className="form-group">
            <label>Room Number</label>
            <input
              type="text"
              className={`form-control room-form-input ${form.room_number.length > 0 ? "is-valid" : ""}`}
              placeholder="Example: 101"
              value={form.room_number}
              onChange={(e) => updateField("room_number", e.target.value)}
              required
            />
          </div>
        </div>
        <div className="col-sm-6">
          <div className="form-group">
            <label>Room Type</label>
            <select
              className={`form-control room-form-input ${form.room_type ? "is-valid" : ""}`}
              value={form.room_type}
              onChange={(e) => updateField("room_type", e.target.value)}
              required
            >
              <option value="">Select room type</option>
              {ROOM_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-sm-6">
          <div className="form-group">
            <label>Base Price per Night</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={`form-control room-form-input ${form.base_price !== "" ? "is-valid" : ""}`}
              placeholder="Enter nightly price"
              value={form.base_price}
              onChange={(e) => updateField("base_price", e.target.value)}
              required
            />
          </div>
        </div>
        <div className="col-sm-6">
          <div className="form-group">
            <label>Max Occupancy (Adults)</label>
            <input
              type="number"
              min="1"
              max="20"
              className={`form-control room-form-input ${form.max_occupancy ? "is-valid" : ""}`}
              value={form.max_occupancy}
              onChange={(e) => updateField("max_occupancy", e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-sm-4">
          <div className="form-group">
            <label>Bed Type</label>
            <select
              className={`form-control room-form-input ${form.bed_type ? "is-valid" : ""}`}
              value={form.bed_type}
              onChange={(e) => updateField("bed_type", e.target.value)}
            >
              <option value="">Select Bed</option>
              <option value="1 King Bed">1 King Bed</option>
              <option value="1 Queen Bed">1 Queen Bed</option>
              <option value="2 Twin Beds">2 Twin Beds</option>
              <option value="2 Double Beds">2 Double Beds</option>
            </select>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="form-group">
            <label>Room Size (sq ft)</label>
            <input
              type="number"
              min="0"
              className={`form-control room-form-input ${form.room_size ? "is-valid" : ""}`}
              placeholder="e.g. 350"
              value={form.room_size}
              onChange={(e) => updateField("room_size", e.target.value)}
            />
          </div>
        </div>
        <div className="col-sm-4">
          <div className="form-group">
            <label>View Type</label>
            <select
              className={`form-control room-form-input ${form.view_type ? "is-valid" : ""}`}
              value={form.view_type}
              onChange={(e) => updateField("view_type", e.target.value)}
            >
              <option value="">Select View</option>
              <option value="City View">City View</option>
              <option value="Ocean View">Ocean View</option>
              <option value="Garden View">Garden View</option>
              <option value="Pool View">Pool View</option>
              <option value="No View">No View</option>
            </select>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          className="form-control room-form-input"
          rows={4}
          placeholder="Add room highlights, layout, and customer notes"
          value={form.description}
          onChange={(e) => updateField("description", e.target.value)}
        />
      </div>
    </div>
  );
}
