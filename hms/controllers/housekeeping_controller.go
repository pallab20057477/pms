package controllers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type housekeepingStartRequest struct {
	RoomID     uint   `json:"room_id" binding:"required"`
	AssignedTo string `json:"assigned_to" binding:"required"`
	Notes      string `json:"notes"`
}

type housekeepingCompleteRequest struct {
	RoomID uint   `json:"room_id" binding:"required"`
	Notes  string `json:"notes"`
}

type housekeepingRoomRow struct {
	RoomID        uint   `json:"room_id"`
	RoomNumber    string `json:"room_number"`
	RoomType      string `json:"room_type"`
	RoomStatus    string `json:"room_status"`
	GuestName     string `json:"guest_name"`
	CheckoutTime  string `json:"checkout_time"`
	DirtySinceMin int64  `json:"dirty_since_min"`
	AssignedTo    string `json:"assigned_to"`
	StartTime     string `json:"start_time"`
	DurationMin   int64  `json:"duration_min"`
	Notes         string `json:"notes"`
}

func parseTimeFlexible(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, value); err == nil {
			return t
		}
	}
	return time.Time{}
}

func ensureHousekeepingRow(tx *gorm.DB, roomID uint) (*models.Housekeeping, error) {
	var h models.Housekeeping
	err := tx.Where("room_id = ?", roomID).First(&h).Error
	if err == nil {
		return &h, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	h = models.Housekeeping{RoomID: roomID, Status: "dirty"}
	if err := tx.Create(&h).Error; err != nil {
		return nil, err
	}
	return &h, nil
}

func ListHousekeeping(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	var hk []models.Housekeeping
	if err := config.DB.Joins("JOIN rooms r ON r.id = housekeepings.room_id").Where("r.hotel_id = ?", hotelID).Order("housekeepings.id desc").Find(&hk).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch housekeeping records"})
		return
	}
	c.JSON(http.StatusOK, hk)
}

func ListDirtyRooms(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	filter := strings.ToLower(strings.TrimSpace(c.DefaultQuery("filter", "all")))

	var rooms []models.Room
	if err := config.DB.Preload("RoomType").Where("hotel_id = ? AND status IN ? AND deleted_at IS NULL", hotelID, []string{"dirty", "maintenance"}).Order("room_number asc").Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch dirty rooms"})
		return
	}

	rows := make([]housekeepingRoomRow, 0, len(rooms))
	now := time.Now()
	for _, room := range rooms {
		var h models.Housekeeping
		_ = config.DB.Where("room_id = ?", room.ID).First(&h).Error

		var guestName string
		checkoutTime := ""
		dirtySinceMin := int64(0)

		var b models.Booking
		if err := config.DB.Where("room_id = ? AND hotel_id = ? AND deleted_at IS NULL", room.ID, hotelID).
			Order("id desc").First(&b).Error; err == nil {
			if b.GuestID > 0 {
				var g models.Guest
				if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", b.GuestID, hotelID).First(&g).Error; err == nil {
					guestName = g.Name
				}
			}
			if b.ActualCheckOutAt != nil {
				checkoutTime = b.ActualCheckOutAt.Format(time.RFC3339)
				dirtySinceMin = int64(now.Sub(*b.ActualCheckOutAt).Minutes())
			}
		}

		if filter == "today" && checkoutTime != "" {
			t := parseTimeFlexible(checkoutTime)
			if t.IsZero() || t.Format("2006-01-02") != now.Format("2006-01-02") {
				continue
			}
		}
		if filter == "high_priority" && dirtySinceMin < 240 {
			continue
		}

		rows = append(rows, housekeepingRoomRow{
			RoomID:        room.ID,
			RoomNumber:    room.RoomNumber,
			RoomType:      room.RoomType.Name,
			RoomStatus:    room.Status,
			GuestName:     guestName,
			CheckoutTime:  checkoutTime,
			DirtySinceMin: dirtySinceMin,
			AssignedTo:    h.AssignedTo,
			Notes:         h.Notes,
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": rows, "total": len(rows)})
}

func ListCleaningRooms(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	var rooms []models.Room
	if err := config.DB.Preload("RoomType").Where("hotel_id = ? AND status = ? AND deleted_at IS NULL", hotelID, "cleaning").Order("room_number asc").Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch cleaning rooms"})
		return
	}

	now := time.Now()
	rows := make([]housekeepingRoomRow, 0, len(rooms))
	for _, room := range rooms {
		var h models.Housekeeping
		if err := config.DB.Where("room_id = ?", room.ID).First(&h).Error; err != nil {
			continue
		}
		startAt := parseTimeFlexible(h.StartTime)
		duration := int64(0)
		if !startAt.IsZero() {
			duration = int64(now.Sub(startAt).Minutes())
		}
		rows = append(rows, housekeepingRoomRow{
			RoomID:      room.ID,
			RoomNumber:  room.RoomNumber,
			RoomType:    room.RoomType.Name,
			RoomStatus:  room.Status,
			AssignedTo:  h.AssignedTo,
			StartTime:   h.StartTime,
			DurationMin: duration,
			Notes:       h.Notes,
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": rows, "total": len(rows)})
}

func ListCleaningHistory(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	limit := 100
	if q := strings.TrimSpace(c.Query("limit")); q != "" {
		if n, err := fmt.Sscanf(q, "%d", &limit); err == nil && n == 1 {
			if limit < 1 {
				limit = 1
			}
			if limit > 1000 {
				limit = 1000
			}
		}
	}

	var rows []models.HousekeepingHistory
	if err := config.DB.Where("hotel_id = ?", hotelID).Order("id desc").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch housekeeping history"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": rows, "total": len(rows)})
}

func StartCleaning(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req housekeepingStartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room_id and assigned_to are required"})
		return
	}
	req.AssignedTo = strings.TrimSpace(req.AssignedTo)
	if req.AssignedTo == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "assigned_to is required"})
		return
	}

	now := time.Now().Format(time.RFC3339)
	if err := config.DB.Transaction(func(tx *gorm.DB) error {
		var room models.Room
		if err := tx.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", req.RoomID, hotelID).First(&room).Error; err != nil {
			return errors.New("room not found")
		}
		if room.Status == "maintenance" {
			return errors.New("room in maintenance cannot enter housekeeping flow")
		}
		if room.Status != "dirty" {
			return errors.New("only dirty rooms can start cleaning")
		}

		// Look up StaffID from AssignedTo name for strict relational tracking
		var staffID *uint
		var staff models.Staff
		if err := tx.Where("hotel_id = ? AND TRIM(name) = ? AND deleted_at IS NULL", hotelID, req.AssignedTo).First(&staff).Error; err == nil {
			staffID = &staff.ID
		}

		h, err := ensureHousekeepingRow(tx, room.ID)
		if err != nil {
			return err
		}
		h.Status = "in_progress"
		h.AssignedTo = req.AssignedTo
		h.StaffID = staffID
		h.StartTime = now
		h.EndTime = ""
		h.Notes = strings.TrimSpace(req.Notes)
		if err := tx.Save(h).Error; err != nil {
			return err
		}

		if err := tx.Model(&room).Update("status", "cleaning").Error; err != nil {
			return err
		}

		history := models.HousekeepingHistory{
			HotelID:        hotelID,
			RoomID:         room.ID,
			RoomNumber:     room.RoomNumber,
			PreviousStatus: "dirty",
			CurrentStatus:  "cleaning",
			AssignedTo:     req.AssignedTo,
			StaffID:        staffID,
			StartTime:      now,
			Notes:          strings.TrimSpace(req.Notes),
		}
		if err := tx.Create(&history).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	utils.LogActivity(hotelID, "Housekeeping", adminID, fmt.Sprintf("Room %d assigned to %s for cleaning", req.RoomID, req.AssignedTo))
	c.JSON(http.StatusOK, gin.H{"status": true, "message": "Cleaning started"})
}

func CompleteCleaning(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req housekeepingCompleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room_id is required"})
		return
	}

	now := time.Now()
	endTime := now.Format(time.RFC3339)
	var assignedTo string
	var roomNumber string

	if err := config.DB.Transaction(func(tx *gorm.DB) error {
		var room models.Room
		if err := tx.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", req.RoomID, hotelID).First(&room).Error; err != nil {
			return errors.New("room not found")
		}
		if room.Status != "cleaning" {
			return errors.New("only cleaning rooms can be marked clean")
		}

		var h models.Housekeeping
		if err := tx.Where("room_id = ?", room.ID).First(&h).Error; err != nil {
			return errors.New("housekeeping record not found")
		}
		if h.Status != "in_progress" {
			return errors.New("room is not in cleaning progress")
		}

		startAt := parseTimeFlexible(h.StartTime)
		durationMin := int64(0)
		if !startAt.IsZero() {
			elapsed := now.Sub(startAt)
			if elapsed > 0 {
				durationMin = int64(math.Ceil(elapsed.Minutes()))
				if durationMin < 1 {
					durationMin = 1
				}
			}
		}

		h.Status = "clean"
		h.EndTime = endTime
		if strings.TrimSpace(req.Notes) != "" {
			h.Notes = strings.TrimSpace(req.Notes)
		}
		if err := tx.Save(&h).Error; err != nil {
			return err
		}

		if err := tx.Model(&room).Update("status", "available").Error; err != nil {
			return err
		}

		history := models.HousekeepingHistory{
			HotelID:        hotelID,
			RoomID:         room.ID,
			RoomNumber:     room.RoomNumber,
			PreviousStatus: "cleaning",
			CurrentStatus:  "available",
			AssignedTo:     h.AssignedTo,
			StaffID:        h.StaffID,
			StartTime:      h.StartTime,
			EndTime:        endTime,
			DurationMin:    durationMin,
			Notes:          h.Notes,
		}
		if err := tx.Create(&history).Error; err != nil {
			return err
		}

		assignedTo = h.AssignedTo
		roomNumber = room.RoomNumber
		return nil
	}); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	utils.LogActivity(hotelID, "Housekeeping", adminID, fmt.Sprintf("Room %s cleaning completed by %s", roomNumber, assignedTo))
	c.JSON(http.StatusOK, gin.H{"status": true, "message": "Room marked clean"})
}

func UpdateHousekeeping(c *gin.Context) {
	// Legacy compatibility endpoint.
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}
	status, _ := payload["status"].(string)
	roomIDFloat, ok := payload["room_id"].(float64)
	if !ok || roomIDFloat <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room_id is required"})
		return
	}
	roomID := uint(roomIDFloat)
	if status == "in_progress" || status == "cleaning" {
		req := housekeepingStartRequest{RoomID: roomID}
		if v, ok := payload["assigned_to"].(string); ok {
			req.AssignedTo = v
		}
		if v, ok := payload["notes"].(string); ok {
			req.Notes = v
		}
		if strings.TrimSpace(req.AssignedTo) == "" {
			req.AssignedTo = "Staff"
		}
		b, _ := json.Marshal(req)
		c.Request.Body = io.NopCloser(strings.NewReader(string(b)))
		StartCleaning(c)
		return
	}
	if status == "clean" || status == "available" {
		req := housekeepingCompleteRequest{RoomID: roomID}
		if v, ok := payload["notes"].(string); ok {
			req.Notes = v
		}
		b, _ := json.Marshal(req)
		c.Request.Body = io.NopCloser(strings.NewReader(string(b)))
		CompleteCleaning(c)
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported status transition"})
}

func HousekeepingRooms(c *gin.Context) {
	// Legacy alias for active housekeeping rooms.
	ListCleaningRooms(c)
}
