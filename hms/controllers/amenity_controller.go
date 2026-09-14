package controllers

import (
	"net/http"
	"strconv"
	"strings"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

func AddAmenity(c *gin.Context) {
	var a models.RoomAmenity
	if err := c.ShouldBindJSON(&a); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if a.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if err := config.DB.Create(&a).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create amenity"})
		return
	}
	utils.LogActivity(c.GetUint("active_hotel_id"), "Amenity", c.GetUint("admin_id"), "Amenity created")
	c.JSON(http.StatusCreated, a)
}

func ListAmenities(c *gin.Context) {
	var items []models.RoomAmenity
	if err := config.DB.Order("id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch amenities"})
		return
	}
	c.JSON(http.StatusOK, items)
}

func loadAmenityRoomForHotel(roomID uint, hotelID uint) (*models.Room, error) {
	var room models.Room
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", roomID, hotelID).First(&room).Error; err != nil {
		return nil, err
	}
	return &room, nil
}

func AssignAmenitiesToRoom(c *gin.Context) {
	// Accept either JSON body with amenity_ids or amenity_names, and use URL param for room id
	var req struct {
		RoomID       uint     `json:"room_id"`
		AmenityIDs   []uint   `json:"amenity_ids"`
		AmenityNames []string `json:"amenity_names"`
	}
	if err := c.ShouldBindJSON(&req); err != nil && err != http.ErrBodyNotAllowed {
		// If there's a binding error, continue to try reading via params below
		// but return on other serious errors
		// (we'll still allow an empty body when using default behavior)
	}
	// room id may be provided in URL param
	var roomID uint
	if idStr := c.Param("id"); idStr != "" {
		if id64, err := strconv.ParseUint(idStr, 10, 64); err == nil {
			roomID = uint(id64)
		}
	}
	if req.RoomID != 0 {
		roomID = req.RoomID
	}
	if roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room_id is required"})
		return
	}
	hotelID := c.GetUint("active_hotel_id")
	room, err := loadAmenityRoomForHotel(roomID, hotelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// remove existing mappings for room
	config.DB.Where("room_id = ?", roomID).Delete(&models.RoomAmenityMap{})

	// If amenity IDs supplied, attach them
	if len(req.AmenityIDs) > 0 {
		for _, aid := range req.AmenityIDs {
			m := models.RoomAmenityMap{RoomID: roomID, AmenityID: aid}
			config.DB.Create(&m)
		}
		utils.LogActivity(hotelID, "Amenity", c.GetUint("admin_id"), "Amenities assigned to room "+room.RoomNumber)
		c.JSON(http.StatusOK, gin.H{"message": "Assigned"})
		return
	}

	// If amenity names supplied, find or create amenities and attach
	if len(req.AmenityNames) > 0 {
		var ids []uint
		for _, name := range req.AmenityNames {
			n := strings.TrimSpace(name)
			if n == "" {
				continue
			}
			var a models.RoomAmenity
			if err := config.DB.Where("name = ?", n).First(&a).Error; err != nil {
				// create
				a = models.RoomAmenity{Name: n}
				if err2 := config.DB.Create(&a).Error; err2 != nil {
					continue
				}
			}
			ids = append(ids, a.ID)
		}
		for _, aid := range ids {
			m := models.RoomAmenityMap{RoomID: roomID, AmenityID: aid}
			config.DB.Create(&m)
		}
		utils.LogActivity(hotelID, "Amenity", c.GetUint("admin_id"), "Amenities assigned to room "+room.RoomNumber)
		c.JSON(http.StatusOK, gin.H{"message": "Assigned"})
		return
	}

	// an empty selection is a valid "clear amenities" request
	utils.LogActivity(hotelID, "Amenity", c.GetUint("admin_id"), "Amenities cleared from room "+room.RoomNumber)
	c.JSON(http.StatusOK, gin.H{"message": "Cleared"})
}

func GetRoomAmenities(c *gin.Context) {
	roomIDParam := c.Param("id")
	id64, err := strconv.ParseUint(roomIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid room id"})
		return
	}
	roomID := uint(id64)
	hotelID := c.GetUint("active_hotel_id")
	if _, err := loadAmenityRoomForHotel(roomID, hotelID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	var amenities []models.RoomAmenity
	if err := config.DB.Table("room_amenity_maps m").Select("room_amenities.*").Joins("join room_amenities on room_amenities.id = m.amenity_id").Where("m.room_id = ?", roomID).Scan(&amenities).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch amenities"})
		return
	}
	c.JSON(http.StatusOK, amenities)
}

// Handles: Add amenities, Assign amenities to room
