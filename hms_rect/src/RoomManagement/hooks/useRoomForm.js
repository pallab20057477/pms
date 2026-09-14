import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { getWithAuth, postWithAuth, patchWithAuth, deleteWithAuth } from "../../api";
import { sortRoomImages } from "../roomUi";

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

const DEFAULT_AMENITIES = [
  { id: "wifi", name: "WiFi" },
  { id: "ac", name: "AC" },
  { id: "tv", name: "TV" },
  { id: "refrigerator", name: "Refrigerator" },
  { id: "balcony", name: "Balcony" },
  { id: "mini_bar", name: "Mini-bar" },
];

export default function useRoomForm(id, token) {
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [removedExistingIds, setRemovedExistingIds] = useState([]);
  const [primaryKey, setPrimaryKey] = useState(null);
  
  const [amenitiesList, setAmenitiesList] = useState([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);

  const latestNewImagesRef = useRef([]);

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
        if (mounted) setAmenitiesList(Array.isArray(data) ? data : []);
      } catch (error) {
        if (mounted) setAmenitiesList([]);
      }
    }
    if (token) loadAmenities();
    return () => { mounted = false; };
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
        toast.error("Failed to load room");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (token) loadRoom();
    return () => { mounted = false; };
  }, [id, token]);

  const visibleExistingImages = useMemo(
    () => existingImages.filter((image) => !removedExistingIds.includes(image.id)),
    [existingImages, removedExistingIds]
  );

  const amenityOptions = useMemo(() => {
    const byName = new Map();
    amenitiesList.forEach((item) => {
      const name = String(item?.name || "").trim();
      if (!name || /^\d+$/.test(name)) return;
      byName.set(name.toLowerCase(), { id: String(item.id), name });
    });
    DEFAULT_AMENITIES.forEach((item) => {
      const name = String(item?.name || "").trim();
      const key = name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, { id: String(item.id), name });
      }
    });
    return Array.from(byName.values());
  }, [amenitiesList]);

  const resetForm = () => {
    latestNewImagesRef.current.forEach((image) => {
      try { URL.revokeObjectURL(image.previewUrl); } catch (_) {}
    });
    setForm(emptyForm);
    setExistingImages([]);
    setNewImages([]);
    setRemovedExistingIds([]);
    setPrimaryKey(null);
  };

  const submit = async (event) => {
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
      const numericIds = selectedAmenities.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
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
      toast.error(error?.response?.data?.error || "Failed to save room");
    } finally {
      setSaving(false);
    }
  };

  return {
    form, setForm,
    existingImages, setExistingImages,
    newImages, setNewImages,
    removedExistingIds, setRemovedExistingIds,
    primaryKey, setPrimaryKey,
    visibleExistingImages,
    amenityOptions,
    loading, saving,
    resetForm, submit
  };
}
