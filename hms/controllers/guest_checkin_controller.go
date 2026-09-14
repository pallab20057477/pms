package controllers

import (
	"hms/config"
	"hms/models"
	"hms/services"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// GET /checkin/qr?token=<qr_token>
// Public endpoint — guest scans QR from their phone/email.
// No authentication required. Validates the token and performs check-in.
func GuestScanQR(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or missing QR token"})
		return
	}

	var record models.BookingOTP
	if err := config.DB.Where("qr_token = ? AND qr_used = false AND qr_expiry > ?",
		token, time.Now()).First(&record).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "QR code has expired or already been used"})
		return
	}

	// Mark as used before check-in to prevent replay — but only after validating
	// the token is still valid. CheckIn is idempotent on the booking status,
	// so if it fails the guest can retry via the public QR URL again (token already consumed).
	// We mark used first here to prevent double-scan race conditions.
	result := config.DB.Model(&record).
		Where("qr_used = false").
		Updates(map[string]interface{}{"otp_used": true, "qr_used": true})
	if result.RowsAffected == 0 {
		// Another request already consumed this token
		c.JSON(http.StatusBadRequest, gin.H{"error": "QR code has already been used"})
		return
	}

	if err := services.CheckIn(record.BookingID, record.HotelID, 0); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Return booking summary for guest confirmation screen
	var booking models.Booking
	config.DB.Where("id = ?", record.BookingID).First(&booking)
	var guest models.Guest
	config.DB.Where("id = ?", booking.GuestID).First(&guest)
	var room models.Room
	config.DB.Preload("RoomType").Where("id = ?", booking.RoomID).First(&room)

	c.JSON(http.StatusOK, gin.H{
		"message":           "Check-in successful. Welcome!",
		"booking_code":      booking.BookingCode,
		"guest_name":        guest.Name,
		"room_number":       room.RoomNumber,
		"room_type":         room.RoomType.Name,
		"room_type_details": room.RoomType,
		"check_in_date":     booking.CheckInDate.Format("02 Jan 2006"),
		"check_out_date":    booking.CheckOutDate.Format("02 Jan 2006"),
	})
}
