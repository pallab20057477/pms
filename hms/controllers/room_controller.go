package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/repositories"
	"hms/services"
	"hms/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	roomListCacheTTL   = 30 * time.Second
	roomDetailCacheTTL = 60 * time.Second
)

func roomListCacheKey(hotelID uint) string {
	return fmt.Sprintf("hms:rooms:list:%d", hotelID)
}

func roomDetailCacheKey(hotelID uint, roomID string) string {
	return fmt.Sprintf("hms:rooms:detail:%d:%s", hotelID, roomID)
}

func invalidateRoomCache(hotelID uint, roomID ...string) {
	ctx := context.Background()
	keys := []string{roomListCacheKey(hotelID)}
	for _, id := range roomID {
		keys = append(keys, roomDetailCacheKey(hotelID, id))
	}
	config.CacheDelete(ctx, keys...)
	InvalidateDashboardCache(hotelID)
}

var roomService = services.NewRoomService(repositories.NewRoomRepository())

const roomImageLimit = 8

type roomRecentBooking struct {
	ID           uint      `json:"id"`
	BookingCode  string    `json:"booking_code"`
	GuestID      uint      `json:"guest_id"`
	GuestName    string    `json:"guest_name"`
	Status       string    `json:"status"`
	CheckInDate  time.Time `json:"check_in_date"`
	CheckOutDate time.Time `json:"check_out_date"`
	TotalAmount  float64   `json:"total_amount"`
}

type roomDetailResponse struct {
	models.Room
	RecentBookings  []roomRecentBooking `json:"recent_bookings"`
	StatusUpdatedAt time.Time           `json:"status_updated_at"`
}

func (r roomDetailResponse) MarshalJSON() ([]byte, error) {
	roomBytes, err := json.Marshal(r.Room)
	if err != nil {
		return nil, err
	}
	var roomMap map[string]interface{}
	if err := json.Unmarshal(roomBytes, &roomMap); err != nil {
		return nil, err
	}
	roomMap["recent_bookings"] = r.RecentBookings
	roomMap["status_updated_at"] = r.StatusUpdatedAt
	return json.Marshal(roomMap)
}

func roomQueryWithRelations(db *gorm.DB) *gorm.DB {
	return db.Preload("RoomType").
		Preload("RoomType.Images", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("\"is_primary\" desc, \"order\" asc, id asc")
		}).
		Preload("RoomType.Amenities", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("name asc")
		})
}

func roomQueryForHotel(hotelID uint) *gorm.DB {
	return config.DB.Where("hotel_id = ? AND deleted_at IS NULL", hotelID)
}

func loadRoomWithRelationsForHotel(room *models.Room, hotelID uint) error {
	return roomQueryWithRelations(roomQueryForHotel(hotelID)).First(room, room.ID).Error
}

func loadRecentBookings(roomID uint, hotelID uint) []roomRecentBooking {
	var items []roomRecentBooking
	_ = config.DB.Table("bookings").
		Select("bookings.id, bookings.booking_code, bookings.guest_id, bookings.status, bookings.check_in_date, bookings.check_out_date, bookings.total_amount, COALESCE(guests.name, '') AS guest_name").
		Joins("LEFT JOIN guests ON guests.id = bookings.guest_id").
		Where("bookings.room_id = ? AND bookings.hotel_id = ? AND bookings.deleted_at IS NULL", roomID, hotelID).
		Order("bookings.check_in_date desc").
		Limit(5).
		Scan(&items).Error
	return items
}

func parseOrderedImageIDs(raw string) []uint {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]uint, 0, len(parts))
	seen := map[uint]bool{}
	for _, part := range parts {
		id64, err := strconv.ParseUint(strings.TrimSpace(part), 10, 64)
		if err != nil {
			continue
		}
		id := uint(id64)
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

func applyExistingImageOrder(roomID uint, orderedIDs []uint) {
	for index, imageID := range orderedIDs {
		_ = config.DB.Model(&models.RoomImage{}).
			Where("room_id = ? AND id = ?", roomID, imageID).
			Update("\"order\"", index).Error
	}
}

func makeAbsoluteRoomImageURL(_ *gin.Context, raw string) string {
	return normalizeUploadPath(raw)
}

func normalizeRoomAssetURLs(room *models.Room) {
	if room == nil {
		return
	}
	room.RoomType.Image = normalizeUploadPath(room.RoomType.Image)
	for i := range room.RoomType.Images {
		room.RoomType.Images[i].URL = normalizeUploadPath(room.RoomType.Images[i].URL)
	}
	if room.RoomType.Image == "" && len(room.RoomType.Images) > 0 {
		room.RoomType.Image = room.RoomType.Images[0].URL
	}
}

func uploadRoomFile(c *gin.Context, file *multipart.FileHeader) string {
	f, ferr := file.Open()
	if ferr != nil {
		return ""
	}
	defer f.Close()

	if u, _, upErr := utils.UploadToServer(c.Request.Context(), f, filepath.Base(file.Filename), "rooms"); upErr == nil && u != "" {
		return normalizeUploadPath(u)
	}

	uploads := utils.UploadDir("rooms")
	_ = os.MkdirAll(uploads, 0755)
	fname := fmt.Sprintf("room_%d_%s", utils.RandomInt(), filepath.Base(file.Filename))
	dst := filepath.Join(uploads, fname)
	if err := c.SaveUploadedFile(file, dst); err == nil {
		return "/uploads/rooms/" + fname
	}

	return ""
}

func syncRoomCoverImage(room *models.Room) {
	if room == nil || room.RoomTypeID == 0 {
		return
	}
	var firstImg models.RoomImage
	if err := config.DB.Where("room_type_id = ?", room.RoomTypeID).Order("is_primary desc, \"order\" asc, id asc").First(&firstImg).Error; err == nil {
		room.RoomType.Image = firstImg.URL
	} else {
		room.RoomType.Image = ""
	}
}

type SaveRoomRequest struct {
	RoomNumber        string  `json:"room_number" form:"room_number"`
	RoomTypeID        uint    `json:"room_type_id" form:"room_type_id"`
	RoomTypeName      string  `json:"room_type" form:"room_type"`
	BasePrice         float64 `json:"base_price" form:"base_price"`
	MaxOccupancy      int     `json:"max_occupancy" form:"max_occupancy"`
	Description       string  `json:"description" form:"description"`
	BedType           string  `json:"bed_type" form:"bed_type"`
	RoomSize          int     `json:"room_size" form:"room_size"`
	ViewType          string  `json:"view_type" form:"view_type"`
	Status            string  `json:"status" form:"status"`
	MaintenanceReason string  `json:"maintenance_reason" form:"maintenance_reason"`
}

func upsertRoomType(hotelID uint, req *SaveRoomRequest) uint {
	if req.RoomTypeID != 0 {
		return req.RoomTypeID
	}
	if req.RoomTypeName == "" {
		return 0
	}
	var rt models.RoomType
	if req.MaxOccupancy == 0 {
		req.MaxOccupancy = 2
	}
	if err := config.DB.Where("hotel_id = ? AND name = ?", hotelID, req.RoomTypeName).First(&rt).Error; err != nil {
		rt = models.RoomType{
			HotelID:      hotelID,
			Name:         req.RoomTypeName,
			BasePrice:    req.BasePrice,
			Description:  req.Description,
			MaxOccupancy: req.MaxOccupancy,
			BedType:      req.BedType,
			RoomSize:     req.RoomSize,
			ViewType:     req.ViewType,
		}
		config.DB.Create(&rt)
	} else {
		rt.BasePrice = req.BasePrice
		rt.MaxOccupancy = req.MaxOccupancy
		rt.RoomSize = req.RoomSize
		rt.Description = req.Description
		rt.BedType = req.BedType
		rt.ViewType = req.ViewType
		config.DB.Save(&rt)
	}
	return rt.ID
}

func handleRoomImagesUpload(c *gin.Context, roomTypeID uint) {
	if form, err := c.MultipartForm(); err == nil && form != nil {
		files := form.File["images[]"]
		if len(files) == 0 {
			files = form.File["images"]
		}
		if len(files) > 0 {
			for _, file := range files {
				if url := uploadRoomFile(c, file); url != "" {
					img := models.RoomImage{
						RoomTypeID: roomTypeID,
						URL:        url,
						Order:      999,
					}
					config.DB.Create(&img)
				}
			}
			var firstImg models.RoomImage
			if err := config.DB.Where("room_type_id = ?", roomTypeID).Order("is_primary desc, \"order\" asc, id asc").First(&firstImg).Error; err == nil {
				config.DB.Model(&models.RoomType{}).Where("id = ?", roomTypeID).Update("image", firstImg.URL)
			}
		}
	}
}

// AddRoom supports JSON or multipart/form-data
func AddRoom(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	
	var req SaveRoomRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.RoomNumber = strings.TrimSpace(req.RoomNumber)
	if req.RoomNumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room_number is required"})
		return
	}

	roomTypeID := upsertRoomType(hotelID, &req)
	if roomTypeID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room_type_id (or room_type) is required"})
		return
	}

	var exist models.Room
	if err := config.DB.Where("hotel_id = ? AND room_number = ?", hotelID, req.RoomNumber).First(&exist).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room_number already exists for this hotel"})
		return
	}

	r := models.Room{
		HotelID:           hotelID,
		RoomNumber:        req.RoomNumber,
		RoomTypeID:        roomTypeID,
		Status:            req.Status,
		MaintenanceReason: req.MaintenanceReason,
	}
	if r.Status == "" {
		r.Status = "available"
	}

	if err := config.DB.Create(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room"})
		return
	}

	if c.ContentType() == "multipart/form-data" {
		handleRoomImagesUpload(c, r.RoomTypeID)
	}

	_ = loadRoomWithRelationsForHotel(&r, hotelID)
	utils.LogActivity(hotelID, "Room", c.GetUint("admin_id"), fmt.Sprintf("Room %s created", r.RoomNumber))
	
	services.DispatchChannelSyncForRoom(r.HotelID, r.ID, c.GetUint("admin_id"), "room.created", map[string]interface{}{
		"room_id":     r.ID,
		"room_number": r.RoomNumber,
		"status":      r.Status,
	})
	
	normalizeRoomAssetURLs(&r)
	invalidateRoomCache(hotelID)
	c.JSON(http.StatusCreated, r)
}

func ListRooms(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	ctx := c.Request.Context()
	includeVirtual := strings.EqualFold(strings.TrimSpace(c.Query("include_virtual")), "true")

	cacheKey := roomListCacheKey(hotelID)
	if includeVirtual {
		cacheKey += "_with_virtual"
	}

	// Try cache first
	var cachedRooms []models.Room
	if config.CacheGet(ctx, cacheKey, &cachedRooms) {
		for i := range cachedRooms {
			normalizeRoomAssetURLs(&cachedRooms[i])
		}
		c.JSON(http.StatusOK, cachedRooms)
		return
	}

	rooms, err := roomService.ListRooms(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rooms"})
		return
	}
	
	var filteredRooms []models.Room
	for i := range rooms {
		normalizeRoomAssetURLs(&rooms[i])
		filteredRooms = append(filteredRooms, rooms[i])
	}
	
	config.CacheSet(ctx, cacheKey, filteredRooms, roomListCacheTTL)
	c.JSON(http.StatusOK, filteredRooms)
}

// ListRoomsByStatus returns rooms filtered by status for the active hotel
func ListRoomsByStatus(c *gin.Context) {
	status := c.Param("status")
	hotelID := c.GetUint("active_hotel_id")
	SyncHotelRoomStatuses(hotelID)
	var rooms []models.Room
	if err := roomQueryWithRelations(config.DB.Where("hotel_id = ? AND status = ? AND deleted_at IS NULL", hotelID, status).Order("id desc")).Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rooms"})
		return
	}
	for i := range rooms {
		normalizeRoomAssetURLs(&rooms[i])
	}
	c.JSON(http.StatusOK, rooms)
}

// ListMaintenanceRooms is a compatibility handler for /api/rooms/maintenance
func ListMaintenanceRooms(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	var rooms []models.Room
	if err := roomQueryWithRelations(config.DB.Where("hotel_id = ? AND status = ? AND deleted_at IS NULL", hotelID, "maintenance").Order("id desc")).Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rooms"})
		return
	}
	for i := range rooms {
		normalizeRoomAssetURLs(&rooms[i])
	}
	c.JSON(http.StatusOK, rooms)
}

func GetRoom(c *gin.Context) {
	var r models.Room
	hotelID := c.GetUint("active_hotel_id")
	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()

	// Try cache first
	var cachedDetail roomDetailResponse
	if config.CacheGet(ctx, roomDetailCacheKey(hotelID, idStr), &cachedDetail) {
		normalizeRoomAssetURLs(&cachedDetail.Room)
		c.JSON(http.StatusOK, cachedDetail)
		return
	}

	r.ID = uint(id64)
	if err := loadRoomWithRelationsForHotel(&r, hotelID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	normalizeRoomAssetURLs(&r)
	detail := roomDetailResponse{
		Room:            r,
		RecentBookings:  loadRecentBookings(r.ID, r.HotelID),
		StatusUpdatedAt: r.UpdatedAt,
	}
	config.CacheSet(ctx, roomDetailCacheKey(hotelID, idStr), detail, roomDetailCacheTTL)
	c.JSON(http.StatusOK, detail)
}

func UpdateRoom(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var r models.Room
	if err := roomQueryForHotel(hotelID).First(&r, uint(id64)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	var req SaveRoomRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.RoomNumber = strings.TrimSpace(req.RoomNumber)
	if req.RoomNumber != "" && req.RoomNumber != r.RoomNumber {
		var exist models.Room
		if err := config.DB.Where("hotel_id = ? AND room_number = ? AND id <> ?", hotelID, req.RoomNumber, r.ID).First(&exist).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "room_number already exists for this hotel"})
			return
		}
		r.RoomNumber = req.RoomNumber
	}

	if newRoomTypeID := upsertRoomType(hotelID, &req); newRoomTypeID != 0 {
		r.RoomTypeID = newRoomTypeID
	}

	oldStatus := r.Status
	if req.Status != "" {
		r.Status = req.Status
	}
	if req.MaintenanceReason != "" {
		r.MaintenanceReason = req.MaintenanceReason
	}

	if err := config.DB.Save(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update room"})
		return
	}

	if r.Status != oldStatus {
		services.DispatchChannelSyncForRoom(hotelID, r.ID, c.GetUint("admin_id"), "room.status_changed", map[string]interface{}{
			"status": r.Status,
			"old_status": oldStatus,
		})
	}

	if c.ContentType() == "multipart/form-data" {
		handleRoomImagesUpload(c, r.RoomTypeID)
	}

	_ = loadRoomWithRelationsForHotel(&r, hotelID)
	normalizeRoomAssetURLs(&r)
	utils.LogActivity(hotelID, "Room", c.GetUint("admin_id"), fmt.Sprintf("Room %s updated", r.RoomNumber))
	config.CacheDelete(c.Request.Context(), roomDetailCacheKey(hotelID, idStr))
	utils.CacheDelPattern(fmt.Sprintf("availability:%d:*", hotelID))
	
	detail := roomDetailResponse{
		Room:            r,
		RecentBookings:  loadRecentBookings(r.ID, r.HotelID),
		StatusUpdatedAt: r.UpdatedAt,
	}
	config.CacheSet(c.Request.Context(), roomDetailCacheKey(hotelID, idStr), detail, roomDetailCacheTTL)
	c.JSON(http.StatusOK, detail)
}


func UpdateRoomStatus(c *gin.Context) {
	var r models.Room
	hotelID := c.GetUint("active_hotel_id")
	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := roomQueryForHotel(hotelID).First(&r, uint(id64)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	var body struct {
		Status        string `json:"status"`
		Reason        string `json:"reason"`
		ExpectedReady string `json:"expected_ready"` // yyyy-mm-dd
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// validate allowed transitions (basic)
	old := r.Status
	allowed := map[string]bool{
		"available": true, "reserved": true, "occupied": true, "dirty": true, "cleaning": true, "maintenance": true,
	}
	if !allowed[body.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}
	// handle maintenance special fields
	if body.Status == "maintenance" {
		reason := strings.TrimSpace(body.Reason)
		if reason == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "maintenance reason is required"})
			return
		}
		if strings.TrimSpace(body.ExpectedReady) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expected_ready is required for maintenance"})
			return
		}
		t, parseErr := time.Parse("2006-01-02", body.ExpectedReady)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expected_ready must be yyyy-mm-dd"})
			return
		}
		r.Status = "maintenance"
		r.MaintenanceReason = reason
		r.MaintenanceUntil = &t
	} else {
		// clearing maintenance fields when leaving maintenance
		r.Status = body.Status
		r.MaintenanceReason = ""
		r.MaintenanceUntil = nil
	}
	if err := config.DB.Omit("created_at", "updated_at").Save(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
		return
	}
	utils.LogActivity(r.HotelID, "Room", c.GetUint("admin_id"), fmt.Sprintf("Room %s status changed from %s to %s", r.RoomNumber, old, r.Status))
	services.DispatchChannelSyncForRoom(r.HotelID, r.ID, c.GetUint("admin_id"), "room.status_changed", map[string]interface{}{
		"room_id":     r.ID,
		"room_number": r.RoomNumber,
		"status":      r.Status,
		"old_status":  old,
	})
	_ = loadRoomWithRelationsForHotel(&r, hotelID)
	normalizeRoomAssetURLs(&r)
	invalidateRoomCache(hotelID, idStr)
	c.JSON(http.StatusOK, r)
}

func DeleteRoom(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	id := uint(id64)
	var r models.Room
	if err := roomQueryForHotel(hotelID).First(&r, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	// check bookings
	var count int64
	config.DB.Model(&models.Booking{}).Where("hotel_id = ? AND room_id = ?", hotelID, id).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete room with bookings"})
		return
	}
	// no room images to delete directly since they belong to RoomType
	if err := roomService.DeleteRoom(uint(id), hotelID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	utils.LogActivity(r.HotelID, "Room", c.GetUint("admin_id"), fmt.Sprintf("Room %s deleted", r.RoomNumber))
	services.DispatchChannelSyncForRoom(r.HotelID, r.ID, c.GetUint("admin_id"), "room.deleted", map[string]interface{}{
		"room_id":     r.ID,
		"room_number": r.RoomNumber,
		"status":      "deleted",
	})
	invalidateRoomCache(hotelID, idStr)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteRoomImage(c *gin.Context) {
	id := c.Param("id")
	var img models.RoomImage
	if err := config.DB.First(&img, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
		return
	}
	
	hotelID := c.GetUint("active_hotel_id")
	var rt models.RoomType
	if err := config.DB.First(&rt, img.RoomTypeID).Error; err == nil && rt.HotelID == hotelID {
		config.DB.Delete(&img)
		
		// If it was the cover image, we should probably sync again, but we just leave it for now
		// or call syncRoomCoverImage(&models.Room{RoomTypeID: rt.ID}) if we want to be thorough.
		
		c.JSON(http.StatusOK, gin.H{"message": "Image deleted"})
	} else {
		c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized"})
	}
}

// Handles: Add room, Update room, Change status, List rooms, Delete room
