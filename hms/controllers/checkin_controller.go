package controllers

import (
	"errors"
	"hms/config"
	"hms/models"
	"hms/services"
	"hms/workers"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func resolveBookingID(c *gin.Context) (uint, error) {
	if idStr := c.Param("id"); idStr != "" {
		id64, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			return 0, errors.New("invalid booking id")
		}
		return uint(id64), nil
	}

	var req struct {
		BookingID uint `json:"booking_id"`
	}
	if c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			return 0, err
		}
	}
	if req.BookingID == 0 {
		return 0, errors.New("booking_id is required")
	}
	return req.BookingID, nil
}

// POST /api/checkin
func CheckIn(c *gin.Context) {
	bookingID, err := resolveBookingID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	if err := services.CheckIn(bookingID, hotelID, adminID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Check-in successful"})
}

// POST /api/checkout
func Checkout(c *gin.Context) {
	bookingID, err := resolveBookingID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	if err := services.Checkout(bookingID, hotelID, adminID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Trigger inventory sync for OTA
	var b models.Booking
	if err := config.DB.Where("id = ?", bookingID).First(&b).Error; err == nil {
		go workers.EnqueueInventorySyncTask(b.HotelID, b.RoomTypeID, b.CheckInDate, b.CheckOutDate)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Checkout successful"})
}
