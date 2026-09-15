import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { deleteWithAuth, getWithAuth, patchWithAuth, postWithAuth } from "../api";
import { resolveAssetUrl } from "../Functions/assetUrl";
import { moveItem, ROOM_IMAGE_LIMIT, ROOM_TYPE_OPTIONS, sortRoomImages } from "./roomUi";
import "./RoomFormModern.css";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DEFAULT_AMENITIES = [
  { id: "wifi", name: "WiFi" },
  { id: "ac", name: "AC" },
  { id: "tv", name: "TV" },
  { id: "refrigerator", name: "Refrigerator" },
  { id: "balcony", name: "Balcony" },
  { id: "mini_bar", name: "Mini-bar" },
];

const emptyForm = {
  room_number: "",
  room_type: "",
  base_price: "",
  description: "",
  amenities: [],
  max_occupancy: 2,
  bed_type: "",
  room_size: "",
  view_type: "",
};

const sectionStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4f0",
  borderRadius: 18,
  padding: 22,
  marginBottom: 20,
  boxShadow: "0 16px 30px rgba(15, 23, 42, 0.06)",
};

const imageCardStyle = {
  width: 150,
  borderRadius: 16,
  border: "1px solid #dbe4f0",
  overflow: "hidden",
  background: "#ffffff",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
};

function toLocalImage(file) {
  return {
    localId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

function badgeStyle(active) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 34,
    height: 34,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.7)",
    background: active ? "#f59e0b" : "rgba(15, 23, 42, 0.65)",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  };
}

function getImageName(image, fallback) {
  if (image.file?.name) return image.file.name;
  if (image.url) {
    const parts = image.url.split("/");
    return parts[parts.length - 1];
  }
  return fallback;
}

export default function RoomForm() {
  const token = useSelector((state) => state.auth.accesstoken);
  const navigate = useNavigate();
  const { id } = useParams();
  const fileInputRef = useRef(null);
  const latestNewImagesRef = useRef([]);

  const [form, setForm] = useState(emptyForm);
  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [removedExistingIds, setRemovedExistingIds] = useState([]);
  const [primaryKey, setPrimaryKey] = useState(null);
  const [amenitiesList, setAmenitiesList] = useState([]);
  const [amenityQuery, setAmenityQuery] = useState("");
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [existingRoomTypes, setExistingRoomTypes] = useState([]);
  const [dropZoneActive, setDropZoneActive] = useState(false);


  useEffect(() => {
    let mounted = true;
    async function loadRoomTypes() {
      try {
        const response = await getWithAuth("/room-types", token);
        const data = response.data?.data ? response.data.data : response.data;
        if (mounted && Array.isArray(data)) {
          setExistingRoomTypes(data);
        }
      } catch (error) {
        console.error("Failed to load room types", error);
      }
    }
    if (token) loadRoomTypes();
    return () => { mounted = false; };
  }, [token]);

  useEffect(() => {
    latestNewImagesRef.current = newImages;
  }, [newImages]);

  useEffect(() => {
    return () => {
      latestNewImagesRef.current.forEach((image) => {
        try {
          URL.revokeObjectURL(image.previewUrl);
        } catch (_) {}
      });
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadAmenities() {
      try {
        const response = await getWithAuth("/amenities", token);
        const data = response.data?.data ? response.data.data : response.data;
        if (mounted) {
          setAmenitiesList(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Failed to load amenities", error);
        if (mounted) {
          setAmenitiesList([]);
        }
      }
    }

    if (token) {
      loadAmenities();
    }

    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    let mounted = true;

    async function loadRoom() {
      if (!id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await getWithAuth(`/rooms/${id}`, token);
        const data = response.data?.data ? response.data.data : response.data;
        const sortedImages = sortRoomImages(data?.images || []);
        const initialPrimary = sortedImages.find((image) => image.is_primary || image.isPrimary);

        const rawType = data?.room_type || data?.room_type_details?.name || "";
        const roomTypeName = typeof rawType === "object" ? (rawType?.name || "") : String(rawType);

        setForm({
          room_number: data?.room_number || "",
          room_type: roomTypeName,
          base_price: data?.base_price ?? "",
          description: data?.description || "",
          amenities: Array.isArray(data?.amenities) ? data.amenities.map((item) => String(item.id)) : [],
          max_occupancy: data?.max_occupancy || 2,
          bed_type: data?.bed_type || "",
          room_size: data?.room_size || "",
          view_type: data?.view_type || "",
        });
        setExistingImages(sortedImages);
        setRemovedExistingIds([]);
        setPrimaryKey(initialPrimary ? `existing:${initialPrimary.id}` : sortedImages[0] ? `existing:${sortedImages[0].id}` : null);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load room");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (token) {
      loadRoom();
    }

    return () => {
      mounted = false;
    };
  }, [id, token]);

  useEffect(() => {
    const activeExisting = existingImages.filter((image) => !removedExistingIds.includes(image.id));
    const primaryStillValid =
      (primaryKey && primaryKey.startsWith("existing:") && activeExisting.some((image) => `existing:${image.id}` === primaryKey)) ||
      (primaryKey && primaryKey.startsWith("new:") && newImages.some((image) => `new:${image.localId}` === primaryKey));

    if (primaryStillValid) return;

    const nextPrimary = activeExisting[0]
      ? `existing:${activeExisting[0].id}`
      : newImages[0]
        ? `new:${newImages[0].localId}`
        : null;

    if (nextPrimary !== primaryKey) {
      setPrimaryKey(nextPrimary);
    }
  }, [existingImages, newImages, primaryKey, removedExistingIds]);

  const visibleExistingImages = useMemo(
    () => existingImages.filter((image) => !removedExistingIds.includes(image.id)),
    [existingImages, removedExistingIds]
  );

  const amenityOptions = useMemo(() => {
    // Prefer backend amenity IDs when names overlap with defaults so edit flows
    // don't show raw numeric IDs in selected chips.
    const byName = new Map();

    amenitiesList.forEach((item) => {
      const name = String(item?.name || "").trim();
      if (!name) return;
      if (/^\d+$/.test(name)) return;
      byName.set(name.toLowerCase(), { id: String(item.id), name });
    });

    DEFAULT_AMENITIES.forEach((item) => {
      const name = String(item?.name || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, { id: String(item.id), name });
      }
    });

    return Array.from(byName.values());
  }, [amenitiesList]);

  useEffect(() => {
    if (!amenityOptions.length) return;

    const idToOption = new Map(amenityOptions.map((a) => [String(a.id), a]));
    const nameToOption = new Map(amenityOptions.map((a) => [String(a.name || "").trim().toLowerCase(), a]));

    setForm((current) => {
      if (!Array.isArray(current.amenities) || !current.amenities.length) return current;

      const normalized = [];
      current.amenities.forEach((raw) => {
        const value = String(raw).trim();
        if (!value) return;

        if (idToOption.has(value)) {
          normalized.push(String(idToOption.get(value).id));
          return;
        }

        const asName = value.toLowerCase();
        if (nameToOption.has(asName)) {
          normalized.push(String(nameToOption.get(asName).id));
          return;
        }

        // Drop legacy numeric-only orphan values like "1,2,3,7,8" from old payloads.
        if (!/^\d+$/.test(value)) {
          normalized.push(value);
        }
      });

      const deduped = Array.from(new Set(normalized));
      const same = deduped.length === current.amenities.length && deduped.every((v, i) => v === current.amenities[i]);
      if (same) return current;
      return { ...current, amenities: deduped };
    });
  }, [amenityOptions]);

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

  const totalImages = visibleExistingImages.length + newImages.length;
  const remainingSlots = Math.max(0, ROOM_IMAGE_LIMIT - totalImages);

  const handleFilesAdded = (incomingFiles) => {
    const files = Array.from(incomingFiles || []);
    if (!files.length) return;

    if (remainingSlots <= 0) {
      toast.error(`Maximum ${ROOM_IMAGE_LIMIT} room images are allowed`);
      return;
    }

    const nextImages = [];
    for (const file of files) {
      if (nextImages.length >= remainingSlots) break;
      if (!ACCEPTED_IMAGE_TYPES.has((file.type || "").toLowerCase())) {
        toast.error(`${file.name} is not a supported image type`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 5 MB`);
        continue;
      }
      nextImages.push(toLocalImage(file));
    }

    if (!nextImages.length) return;

    setNewImages((current) => [...current, ...nextImages]);
  };

  const removeNewImage = (localId) => {
    setNewImages((current) => {
      const target = current.find((image) => image.localId === localId);
      if (target?.previewUrl) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch (_) {}
      }
      return current.filter((image) => image.localId !== localId);
    });
  };

  const toggleRemoveExisting = (imageId) => {
    setRemovedExistingIds((current) =>
      current.includes(imageId) ? current.filter((value) => value !== imageId) : [...current, imageId]
    );
  };

  const moveExistingImage = (fromIndex, toIndex) => {
    setExistingImages((current) => moveItem(current, fromIndex, toIndex));
  };

  const moveNewImage = (fromIndex, toIndex) => {
    setNewImages((current) => moveItem(current, fromIndex, toIndex));
  };

  const handleThumbDrop = (type, targetIndex) => {
    if (!dragItem || dragItem.type !== type || dragItem.index === targetIndex) return;
    if (type === "existing") {
      moveExistingImage(dragItem.index, targetIndex);
    } else {
      moveNewImage(dragItem.index, targetIndex);
    }
    setDragItem(null);
  };

  const resetForm = () => {
    latestNewImagesRef.current.forEach((image) => {
      try {
        URL.revokeObjectURL(image.previewUrl);
      } catch (_) {}
    });
    setForm(emptyForm);
    setExistingImages([]);
    setNewImages([]);
    setRemovedExistingIds([]);
    setPrimaryKey(null);
  };

  async function submit(event) {
    event.preventDefault();
    setSaving(true);

    try {
      if (removedExistingIds.length) {
        for (const imageId of removedExistingIds) {
          await deleteWithAuth(`/rooms/images/${imageId}`, token);
        }
      }

      const payload = new FormData();
      payload.append("room_number", form.room_number.trim());
      payload.append("room_type", form.room_type);
      payload.append("base_price", String(form.base_price || 0));
      payload.append("description", form.description || "");
      payload.append("max_occupancy", String(form.max_occupancy || 2));
      payload.append("bed_type", form.bed_type || "");
      payload.append("room_size", String(form.room_size || 0));
      payload.append("view_type", form.view_type || "");

      const orderedExistingIds = visibleExistingImages.map((image) => image.id);
      if (orderedExistingIds.length) {
        payload.append("existing_image_order", orderedExistingIds.join(","));
      }

      if (primaryKey?.startsWith("existing:")) {
        payload.append("primary_existing_id", primaryKey.replace("existing:", ""));
      }
      if (primaryKey?.startsWith("new:")) {
        const primaryNewIndex = newImages.findIndex((image) => `new:${image.localId}` === primaryKey);
        if (primaryNewIndex >= 0) {
          payload.append("primary_new_index", String(primaryNewIndex));
        }
      }

      newImages.forEach((image) => {
        payload.append("images[]", image.file);
      });

      const response = id
        ? await patchWithAuth(`/rooms/${id}`, payload, token)
        : await postWithAuth("/rooms", payload, token);

      const room = response.data?.data ? response.data.data : response.data;
      const selectedAmenities = form.amenities || [];
      const numericIds = selectedAmenities
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);

      if (numericIds.length === selectedAmenities.length) {
        await postWithAuth(`/rooms/${room.id}/amenities`, { amenity_ids: numericIds }, token);
      } else {
        const amenityNames = selectedAmenities
          .map((value) => amenityOptions.find((item) => String(item.id) === String(value))?.name || String(value))
          .filter(Boolean);
        await postWithAuth(`/rooms/${room.id}/amenities`, { amenity_names: amenityNames }, token);
      }

      toast.success(id ? "Room updated successfully" : "Room created successfully");
      navigate(id ? `/rooms/${room.id}` : "/rooms");
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || "Failed to save room");
    } finally {
      setSaving(false);
    }
  }


  const handleAmenityChange = (amenityId) => {
    setForm((prev) => {
      const amenities = [...prev.amenities];
      const index = amenities.indexOf(amenityId);
      if (index >= 0) {
        amenities.splice(index, 1);
      } else {
        amenities.push(amenityId);
      }
      return { ...prev, amenities };
    });
  };

  if (loading) {
    return <div className="content" style={{ padding: 24, textAlign: "center" }}>Loading room details...</div>;
  }

  return (
    <>
      <section className="room-page-header">
        <div className="room-page-header-icon">
          <i className="fa-solid fa-bed" />
        </div>
        <div className="room-page-header-title">
          <h1>{id ? "Edit Room" : "Add New Room"}</h1>
          <p>Manage rooms for the selected hotel with multi-image support and amenities.</p>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag room-form-panel">
        <div className="panel-heading room-form-heading">
          <div>
            <h4 className="room-form-title">{id ? "Edit Room" : "Add New Room"}</h4>
            <p className="room-form-subtitle">Manage rooms for the selected hotel with multi-image support and amenities.</p>
          </div>
          <Link to="/rooms" className="btn room-list-btn">
            <i className="fa-solid fa-list" style={{ marginRight: 6 }} />
            All Rooms
          </Link>
        </div>

        <div className="panel-body room-form-layout">
          <div className="room-form-topbar">
            <div>
              <span className="label label-primary">
                Default room status: Available
              </span>
            </div>
            <div>
              <button type="button" className="btn btn-warning" onClick={id ? () => navigate("/rooms") : resetForm} style={{ borderRadius: 8, padding: "8px 16px", fontWeight: 600 }}>
                <i className="fa-solid fa-rotate-left" style={{ marginRight: 6 }} />
                {id ? "Cancel" : "Reset Form"}
              </button>
            </div>
          </div>

        <form onSubmit={submit}>
          <div className="room-form-grid">
            <div className="room-form-main-col">
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
                        onChange={(event) => setForm((current) => ({ ...current, room_number: event.target.value }))}
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
                        
                        onChange={(event) => {
                          const selectedType = event.target.value;
                          const existing = existingRoomTypes.find(rt => rt.name === selectedType);
                          if (existing && !id) {
                            setForm((current) => ({
                              ...current,
                              room_type: selectedType,
                              base_price: existing.base_price || "",
                              max_occupancy: existing.max_occupancy || 2,
                              bed_type: existing.bed_type || "",
                              room_size: existing.room_size || "",
                              view_type: existing.view_type || "",
                              description: existing.description || "",
                              amenities: Array.isArray(existing.amenities) ? existing.amenities.map(a => String(a.id)) : []
                            }));
                            if (Array.isArray(existing.images) && existing.images.length > 0) {
                              const sortedImages = sortRoomImages(existing.images);
                              setExistingImages(sortedImages);
                              setRemovedExistingIds([]);
                              const initialPrimary = sortedImages.find((img) => img.is_primary || img.isPrimary);
                              setPrimaryKey(initialPrimary ? `existing:${initialPrimary.id}` : `existing:${sortedImages[0].id}`);
                            } else {
                              setExistingImages([]);
                              setRemovedExistingIds([]);
                              setPrimaryKey(null);
                            }
                          } else {
                            setForm((current) => ({ ...current, room_type: selectedType }));
                          }
                        }}

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
                        onChange={(event) => setForm((current) => ({ ...current, base_price: event.target.value }))}
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
                        onChange={(event) => setForm((current) => ({ ...current, max_occupancy: event.target.value }))}
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
                        onChange={(event) => setForm((current) => ({ ...current, bed_type: event.target.value }))}
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
                        onChange={(event) => setForm((current) => ({ ...current, room_size: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="col-sm-4">
                    <div className="form-group">
                      <label>View Type</label>
                      <select
                        className={`form-control room-form-input ${form.view_type ? "is-valid" : ""}`}
                        value={form.view_type}
                        onChange={(event) => setForm((current) => ({ ...current, view_type: event.target.value }))}
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
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </div>
              </div>

              <div className="room-form-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  <div>
                    <h4 className="room-form-section-title" style={{ marginBottom: 4 }}>
                      <i className="fa-solid fa-images" /> Room Images
                    </h4>
                    <p style={{ margin: "0", color: "#64748b", fontSize: 13 }}>
                      Upload up to {ROOM_IMAGE_LIMIT} photos. Click the star to choose the primary cover image.
                    </p>
                  </div>
                  <div>
                    <span className="label label-primary" style={{ padding: "8px 12px", background: "#eff6ff", color: "#1d4ed8" }}>
                      {totalImages}/{ROOM_IMAGE_LIMIT} images
                    </span>
                  </div>
                </div>

                <div
                  className={`room-upload-zone ${dropZoneActive ? "active" : "inactive"}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropZoneActive(true);
                  }}
                  onDragLeave={() => setDropZoneActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropZoneActive(false);
                    handleFilesAdded(event.dataTransfer.files);
                  }}
                >
                  <div className="room-upload-icon">
                    <i className="fa-solid fa-cloud-arrow-up" />
                  </div>
                  <h4 className="room-upload-title">Drag images here or select files</h4>
                  <p className="room-upload-subtitle">
                    JPG, PNG, and WEBP files up to 5 MB each.
                  </p>
                  <button type="button" className="btn btn-success" onClick={() => fileInputRef.current?.click()} disabled={remainingSlots <= 0}>
                    Select Images
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    style={{ display: "none" }}
                    onChange={(event) => {
                      handleFilesAdded(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <strong style={{ color: "#0f172a" }}>Existing Images</strong>
                  <span style={{ marginLeft: 10, color: "#64748b" }}>Drag thumbnails to reorder them.</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  {existingImages.length ? (
                    existingImages.map((image, index) => {
                      const isRemoved = removedExistingIds.includes(image.id);
                      const isPrimary = primaryKey === `existing:${image.id}`;
                      return (
                        <div
                          key={image.id}
                          draggable={!isRemoved}
                          onDragStart={() => setDragItem({ type: "existing", index })}
                          onDragEnd={() => setDragItem(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => handleThumbDrop("existing", index)}
                          style={{
                            ...imageCardStyle,
                            opacity: isRemoved ? 0.45 : 1,
                            transform: dragItem?.type === "existing" && dragItem.index === index ? "scale(0.98)" : "none",
                          }}
                        >
                          <div style={{ position: "relative", height: 110, background: "#e2e8f0" }}>
                            <img
                              src={resolveAssetUrl(image.url, "rooms")}
                              alt={getImageName(image, `room-image-${index + 1}`)}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                            <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 8 }}>
                              <button type="button" style={badgeStyle(isPrimary)} onClick={() => setPrimaryKey(`existing:${image.id}`)}>
                                <i className="fa-solid fa-star" />
                              </button>
                              <button
                                type="button"
                                style={{ ...badgeStyle(false), background: isRemoved ? "#64748b" : "#ef4444" }}
                                onClick={() => toggleRemoveExisting(image.id)}
                              >
                                <i className={`fa-solid ${isRemoved ? "fa-rotate-left" : "fa-xmark"}`} />
                              </button>
                            </div>
                            {isRemoved ? (
                              <div style={{ position: "absolute", left: 10, top: 10, background: "#ef4444", color: "#ffffff", borderRadius: 999, padding: "4px 10px", fontSize: 11 }}>
                                Will be removed
                              </div>
                            ) : null}
                          </div>
                          <div style={{ padding: 12 }}>
                            <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {getImageName(image, `Image ${index + 1}`)}
                            </div>
                            <div style={{ color: "#64748b", fontSize: 12 }}>
                              {isPrimary ? "Primary image" : "Secondary image"}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ color: "#64748b" }}>No saved images yet.</div>
                  )}
                </div>

                <div style={{ marginTop: 24, marginBottom: 12 }}>
                  <strong style={{ color: "#0f172a" }}>New Uploads</strong>
                  <span style={{ marginLeft: 10, color: "#64748b" }}>You can also drag these thumbnails to reorder before saving.</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  {newImages.length ? (
                    newImages.map((image, index) => {
                      const isPrimary = primaryKey === `new:${image.localId}`;
                      return (
                        <div
                          key={image.localId}
                          draggable
                          onDragStart={() => setDragItem({ type: "new", index })}
                          onDragEnd={() => setDragItem(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => handleThumbDrop("new", index)}
                          style={{
                            ...imageCardStyle,
                            transform: dragItem?.type === "new" && dragItem.index === index ? "scale(0.98)" : "none",
                          }}
                        >
                          <div style={{ position: "relative", height: 110, background: "#e2e8f0" }}>
                            <img src={image.previewUrl} alt={image.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 8 }}>
                              <button type="button" style={badgeStyle(isPrimary)} onClick={() => setPrimaryKey(`new:${image.localId}`)}>
                                <i className="fa-solid fa-star" />
                              </button>
                              <button type="button" style={{ ...badgeStyle(false), background: "#ef4444" }} onClick={() => removeNewImage(image.localId)}>
                                <i className="fa-solid fa-xmark" />
                              </button>
                            </div>
                          </div>
                          <div style={{ padding: 12 }}>
                            <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {image.file.name}
                            </div>
                            <div style={{ color: "#64748b", fontSize: 12 }}>{isPrimary ? "Primary image" : "Ready to upload"}</div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ color: "#64748b" }}>New uploads will appear here after you select images.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="room-form-side-col">
              <div className="room-form-section">
                <h4 className="room-form-section-title">
                  <i className="fa-solid fa-bell-concierge" /> Amenities
                </h4>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  {/* Search input removed per user request */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', maxHeight: '300px', overflowY: 'auto', padding: '4px' }}>
                    {filteredAmenityOptions.map(amenity => {
                      const isSelected = form.amenities.includes(String(amenity.id));
                      return (
                        <div 
                          key={amenity.id}
                          onClick={() => handleAmenityChange(String(amenity.id))}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '20px',
                            border: `1px solid ${isSelected ? '#3c8dbc' : '#d2d6de'}`,
                            backgroundColor: isSelected ? '#3c8dbc' : '#fff',
                            color: isSelected ? '#fff' : '#444',
                            cursor: 'pointer',
                            userSelect: 'none',
                            fontSize: '13px',
                            fontWeight: isSelected ? '600' : '400',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: isSelected ? '0 2px 4px rgba(60,141,188,0.2)' : 'none'
                          }}
                        >
                          <i className={isSelected ? "fa-solid fa-check" : "fa-solid fa-plus"} style={{ fontSize: '11px' }} />
                          {amenity.name}
                        </div>
                      );
                    })}
                    {filteredAmenityOptions.length === 0 && (
                      <div style={{ padding: '12px', color: '#777', fontSize: '13px', fontStyle: 'italic' }}>
                        No amenities match your search.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="room-form-actions" style={{ marginTop: 24, padding: 20, background: "#fff", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button type="button" className="btn btn-default" onClick={resetForm} disabled={saving}>Reset</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : id ? "Save Changes" : "Create Room"}</button>
          </div>
        </form>
        </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}