import base64

content = b'''
\t\t\t\tconflictQuery.Count(&conflict)
\t\t\t\tresp = gin.H{\"available\": conflict == 0}
\t\t\t}

\t\t\tutils.CacheSet(cacheKey, resp, 1*time.Minute)
\t\t\tc.JSON(http.StatusOK, resp)
\t\t\treturn
\t\t}

\t\ttoday := time.Now().Truncate(24 * time.Hour)
\t\tciDateOnly := ci.Truncate(24 * time.Hour)

\t\tvar excludedRoomID uint
\t\tif excludeBookingID != \"\" {
\t\t\tconfig.DB.Model(&models.Booking{}).Where(\"id = ?\", excludeBookingID).Pluck(\"room_id\", &excludedRoomID)
\t\t}

\t\tquery := config.DB.Model(&models.Room{}).
\t\t\tJoins(\"LEFT JOIN room_types rt ON rt.id = rooms.room_type_id AND rt.deleted_at IS NULL\").
\t\t\tWhere(\"rooms.hotel_id = ?\", hotelID).
\t\t\tWhere(\"LOWER(rooms.status) != 'blocked' OR rooms.id = ?\", excludedRoomID)

\t\tif ciDateOnly.Equal(today) {
\t\t\tquery = query.Where(\"LOWER(rooms.status) NOT IN ('dirty', 'cleaning') OR rooms.id = ?\", excludedRoomID)
\t\t}

\t\t// If it's in maintenance, it must have an end date that is <= check-in date
\t\tquery = query.Where(\"(LOWER(rooms.status) != 'maintenance' OR (LOWER(rooms.status) = 'maintenance' AND maintenance_until IS NOT NULL AND maintenance_until <= ?) OR rooms.id = ?)\", ciDateOnly, excludedRoomID)
\t\tif roomType != \"\" {
\t\t\tquery = query.Where(\"rt.name = ?\", roomType)
\t\t}

\t\tvar rooms []availableRoomRow
\t\terr = query.
\t\t\tSelect(\
\t\t\t\trooms.id,
\t\t\t\trooms.room_number,
\t\t\t\trt.name AS room_type,
\t\t\t\trt.base_price,
\t\t\t\trt.included_guests_override,
\t\t\t\trt.extra_guest_charge_per_night_override,
\t\t\t\tCASE
\t\t\t\t\tWHEN rt.included_guests_override IS NOT NULL AND rt.extra_guest_charge_per_night_override IS NOT NULL THEN true
\t\t\t\t\tELSE false
\t\t\t\tEND AS occupancy_override_active,
\t\t\t\tCOALESCE((
\t\t\t\t\tSELECT ri.url
\t\t\t\t\tFROM room_images ri
\t\t\t\t\tWHERE ri.room_type_id = rt.id AND ri.deleted_at IS NULL
\t\t\t\t\tORDER BY ri.is_primary DESC, ri.\"order\" ASC, ri.id ASC
\t\t\t\t\tLIMIT 1
\t\t\t\t), rt.image, '') AS primary_image
\t\t\).
\t\t\tWhere(\NOT EXISTS (
\t\t\t\tSELECT 1 FROM bookings b
\t\t\t\tWHERE b.room_id = rooms.id
\t\t\t\tAND b.hotel_id = rooms.hotel_id
\t\t\t\tAND b.deleted_at IS NULL
\t\t\t\tAND LOWER(b.status) NOT IN ('cancelled', 'completed', 'checked_out')
\t\t\t\tAND (b.check_in_date < ? AND b.check_out_date > ?)
\t\t\t\tAND (CAST(? AS TEXT) = '' OR CAST(b.id AS TEXT) != ?)
\t\t\t)\, co, ci, excludeBookingID, excludeBookingID).
\t\t\tOrder(\"rooms.room_number asc\").
\t\t\tScan(&rooms).Error

\t\tif err != nil {
\t\t\tc.JSON(http.StatusInternalServerError, gin.H{\"error\": \"Failed to fetch available rooms\"})
\t\t\treturn
\t\t}

\t\tadjustments, adjErr := activeSeasonalAdjustmentByRoomType(hotelID, ci)
\t\tif adjErr == nil {
\t\t\tfor i := range rooms {
\t\t\t\tkey := strings.ToLower(strings.TrimSpace(rooms[i].RoomType))
\t\t\t\tif pct, ok := adjustments[key]; ok {
\t\t\t\t\tnewPrice := rooms[i].BasePrice * (1.0 + pct/100.0)
\t\t\t\t\tif newPrice < 0 {
\t\t\t\t\t\tnewPrice = 0
\t\t\t\t\t}
\t\t\t\t\trooms[i].BasePrice = math.Round(newPrice*100) / 100
\t\t\t\t}
\t\t\t}
\t\t}
'''

with open('d:/GO/all/project1/hms/controllers/booking_controller.go', 'r') as f:
    lines = f.readlines()

out = []
# Keep lines up to 1372 (0-indexed, so 0 to 1371)
for i in range(1372):
    out.append(lines[i])

# append the new block
out.append(content.decode('utf-8'))

# Keep lines from 1380 onwards (0-indexed, so from 1379)
for i in range(1380, len(lines)):
    out.append(lines[i])

with open('d:/GO/all/project1/hms/controllers/booking_controller.go', 'w') as f:
    f.write(''.join(out))

print('SUCCESS')
