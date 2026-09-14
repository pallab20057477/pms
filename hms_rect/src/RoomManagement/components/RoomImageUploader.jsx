import React, { useRef, useState } from "react";
import { resolveAssetUrl } from "../../Functions/assetUrl";
import { moveItem, ROOM_IMAGE_LIMIT } from "../roomUi";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

export default function RoomImageUploader({
  existingImages,
  setExistingImages,
  newImages,
  setNewImages,
  removedExistingIds,
  setRemovedExistingIds,
  primaryKey,
  setPrimaryKey,
  visibleExistingImages,
}) {
  const fileInputRef = useRef(null);
  const [dragItem, setDragItem] = useState(null);
  const [dropZoneActive, setDropZoneActive] = useState(false);

  const totalImages = visibleExistingImages.length + newImages.length;
  const remainingSlots = Math.max(0, ROOM_IMAGE_LIMIT - totalImages);

  const handleFilesAdded = (incomingFiles) => {
    const files = Array.from(incomingFiles || []);
    if (!files.length) return;

    if (remainingSlots <= 0) {
      alert(`Maximum ${ROOM_IMAGE_LIMIT} room images are allowed`);
      return;
    }

    const nextImages = [];
    for (const file of files) {
      if (nextImages.length >= remainingSlots) break;
      if (!ACCEPTED_IMAGE_TYPES.has((file.type || "").toLowerCase())) {
        alert(`${file.name} is not a supported image type`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name} is larger than 5 MB`);
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

  return (
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
  );
}
