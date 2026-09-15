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

	
	// Auto-migrate old rooms that have no RoomType assigned
	if room.RoomTypeID == 0 {
		rtName := "Custom - Room " + room.RoomNumber
		rt := models.RoomType{
			HotelID:      hotelID,
			Name:         rtName,
			MaxOccupancy: 2,
		}
		if err := config.DB.Create(&rt).Error; err == nil {
			room.RoomTypeID = rt.ID
			config.DB.Save(room)
		}
	}

	var newAmenities []models.RoomAmenity


	// If amenity IDs supplied
	if len(req.AmenityIDs) > 0 {
		for _, aid := range req.AmenityIDs {
			newAmenities = append(newAmenities, models.RoomAmenity{ID: aid})
		}
	} else if len(req.AmenityNames) > 0 {
		// If amenity names supplied, find or create amenities
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
			newAmenities = append(newAmenities, models.RoomAmenity{ID: a.ID})
		}
	}

	// Update RoomType's Amenities
	if err := config.DB.Model(&models.RoomType{ID: room.RoomTypeID}).Association("Amenities").Replace(newAmenities); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update amenities"})
		return
	}

	// Invalidate room cache (delete both the list and the specific room's detail cache)
	roomListCacheKey := "room_list:" + strconv.FormatUint(uint64(hotelID), 10)
	roomDetailCacheKey := "room:" + strconv.FormatUint(uint64(hotelID), 10) + ":" + strconv.FormatUint(uint64(room.ID), 10)
	config.CacheDelete(c.Request.Context(), roomListCacheKey, roomDetailCacheKey)

	utils.LogActivity(hotelID, "Amenity", c.GetUint("admin_id"), "Amenities updated for room "+room.RoomNumber)
	c.JSON(http.StatusOK, gin.H{"message": "Assigned"})
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
