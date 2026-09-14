package controllers

import (
	"net/http"
	"strconv"

	"hms/config"
	"hms/models"

	"github.com/gin-gonic/gin"
)

// GetChannelMappings returns mappings for a specific hotel and partner
func GetMappingResources(c *gin.Context) {
	hotelID, _ := strconv.ParseUint(c.Param("hotel_id"), 10, 32)

	var roomTypes []models.RoomType
	config.DB.Where("hotel_id = ? AND deleted_at IS NULL", hotelID).Find(&roomTypes)

	// Fetch rate plans for this hotel
	var ratePlans []models.RatePlan
	config.DB.Where("hotel_id = ? AND is_active = true", hotelID).Find(&ratePlans)

	c.JSON(http.StatusOK, gin.H{
		"room_types": roomTypes,
		"rate_plans": ratePlans,
	})
}

// GetChannelMappings returns mappings for a specific hotel and partner
func GetChannelMappings(c *gin.Context) {
	hotelID, _ := strconv.ParseUint(c.Param("hotel_id"), 10, 32)
	partnerID, _ := strconv.ParseUint(c.Query("partner_id"), 10, 32)

	if partnerID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "partner_id is required"})
		return
	}

	var hotelMapping models.ChannelHotelMapping
	config.DB.Where("hotel_id = ? AND partner_integration_id = ?", hotelID, partnerID).First(&hotelMapping)

	var roomMappings []models.ChannelRoomMapping
	config.DB.Where("hotel_id = ? AND partner_integration_id = ?", hotelID, partnerID).Find(&roomMappings)

	var rateMappings []models.ChannelRateMapping
	config.DB.Where("hotel_id = ? AND partner_integration_id = ?", hotelID, partnerID).Find(&rateMappings)

	c.JSON(http.StatusOK, gin.H{
		"hotel_mapping": hotelMapping,
		"room_mappings": roomMappings,
		"rate_mappings": rateMappings,
	})
}

type SaveMappingsRequest struct {
	PartnerID    uint                        `json:"partner_id" binding:"required"`
	OTAHotelCode string                      `json:"ota_hotel_code"`
	OTAUsername  string                      `json:"ota_username"`
	OTAPassword  string                      `json:"ota_password"`
	RoomMappings []models.ChannelRoomMapping `json:"room_mappings"`
	RateMappings []models.ChannelRateMapping `json:"rate_mappings"`
}

// SaveChannelMappings bulk saves all mappings for a specific partner and hotel
func SaveChannelMappings(c *gin.Context) {
	hotelID, _ := strconv.ParseUint(c.Param("hotel_id"), 10, 32)

	var req SaveMappingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Save Hotel Mapping
	var hotelMapping models.ChannelHotelMapping
	config.DB.Where("hotel_id = ? AND partner_integration_id = ?", hotelID, req.PartnerID).First(&hotelMapping)
	hotelMapping.HotelID = uint(hotelID)
	hotelMapping.PartnerIntegrationID = req.PartnerID
	hotelMapping.OTAHotelCode = req.OTAHotelCode
	hotelMapping.OTAUsername = req.OTAUsername
	if req.OTAPassword != "" || hotelMapping.ID == 0 { // allow partial update without overriding password
		hotelMapping.OTAPassword = req.OTAPassword
	}
	hotelMapping.IsActive = true
	config.DB.Save(&hotelMapping)

	// 2. Save Room Mappings
	// First delete existing mappings for this partner to avoid duplicates, then recreate
	config.DB.Where("hotel_id = ? AND partner_integration_id = ?", hotelID, req.PartnerID).Delete(&models.ChannelRoomMapping{})
	for _, rm := range req.RoomMappings {
		rm.ID = 0 // Ensure it's treated as a new record
		rm.HotelID = uint(hotelID)
		rm.PartnerIntegrationID = req.PartnerID
		if rm.OTARoomTypeCode != "" && rm.RoomTypeID > 0 {
			config.DB.Create(&rm)
		}
	}

	// 3. Save Rate Mappings
	config.DB.Where("hotel_id = ? AND partner_integration_id = ?", hotelID, req.PartnerID).Delete(&models.ChannelRateMapping{})
	for _, rm := range req.RateMappings {
		rm.ID = 0 // Ensure it's treated as a new record
		rm.HotelID = uint(hotelID)
		rm.PartnerIntegrationID = req.PartnerID
		if rm.OTARatePlanCode != "" && rm.PlanID > 0 {
			config.DB.Create(&rm)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Mappings saved successfully"})
}
