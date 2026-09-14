package controllers

import (
	"fmt"
	"hms/config"
	"hms/models"
	"hms/services"
	"hms/utils"
	"net/http"
	// "os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// POST /api/bookings/:id/checkin/send-otp
// Generates OTP + QR token, sends confirmation card to guest (email + WhatsApp).
// Returns QR base64 + OTP for admin to display on folio page.
func SendCheckinOTP(c *gin.Context) {
	bookingID, err := resolveBookingID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hotelID := c.GetUint("active_hotel_id")

	var booking models.Booking
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", bookingID, hotelID).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}
	if strings.ToLower(strings.TrimSpace(booking.Status)) != "reserved" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Booking is not in reserved state"})
		return
	}

	var guest models.Guest
	config.DB.Where("id = ?", booking.GuestID).First(&guest)
	var hotel models.Hotel
	config.DB.First(&hotel, hotelID)
	var room models.Room
	config.DB.Preload("RoomType").Where("id = ?", booking.RoomID).First(&room)

	// Invalidate previous unused OTPs for this booking
	config.DB.Model(&models.BookingOTP{}).
		Where("booking_id = ? AND hotel_id = ? AND otp_used = false", bookingID, hotelID).
		Updates(map[string]interface{}{"otp_used": true, "qr_used": true})

	otp := utils.GenerateOTP()
	qrToken := utils.RandomString(48) // secure random token — QR encodes this
	now := time.Now()

	record := models.BookingOTP{
		BookingID: bookingID,
		HotelID:   hotelID,
		OTP:       otp,
		QRToken:   qrToken,
		OTPExpiry: now.Add(24 * time.Hour), // OTP valid 24h (guest arrives same day)
		QRExpiry:  now.Add(24 * time.Hour),
	}
	if err := config.DB.Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate check-in credentials"})
		return
	}

	// QR encodes a full URL for guest self-scan: GET /checkin/qr?token=<token>
	// Admin scan uses the raw token via POST /api/bookings/checkin/verify-qr
	publicBase := utils.PublicBaseURL(nil)
	guestQRURL := fmt.Sprintf("%s/checkin/qr?token=%s", publicBase, qrToken)
	qrBase64, _ := utils.GenerateQRBase64WithSize(guestQRURL, 300)

	nights := int(booking.CheckOutDate.Sub(booking.CheckInDate).Hours() / 24)
	if nights < 1 {
		nights = 1
	}

	// Authoritative grand total — folio + tax, same formula as booking_controller
	var folioItems []models.FolioItem
	config.DB.Where("booking_id = ?", bookingID).Find(&folioItems)
	var folioSum float64
	for _, item := range folioItems {
		folioSum += item.Amount
	}
	taxRate := booking.TaxRate
	if taxRate < 0 {
		taxRate = 0
	}
	// Note: booking.TotalAmount already has discount baked in
	taxableSubtotal := booking.TotalAmount + folioSum
	if taxableSubtotal < 0 {
		taxableSubtotal = 0
	}
	tax := 0.0
	if taxRate > 0 {
		tax = taxableSubtotal * taxRate / 100
	}
	grandTotal := taxableSubtotal + tax

	var totalPaid float64
	config.DB.Model(&models.Payment{}).Where("booking_id = ? AND (status = 'success' OR status = '')", booking.ID).Select("COALESCE(SUM(amount), 0)").Scan(&totalPaid)
	balanceDue := grandTotal - totalPaid
	if balanceDue < 0 {
		balanceDue = 0
	}

	// Send confirmation card to guest (async)
	utils.SendBookingConfirmation(utils.BookingNotifyData{
		GuestName:      guest.Name,
		GuestEmail:     guest.Email,
		GuestPhone:     guest.Phone,
		BookingCode:    booking.BookingCode,
		RoomNumber:     room.RoomNumber,
		RoomType:       room.RoomType.Name,
		HotelName:      hotel.Name,
		HotelAddress:   hotel.Address1,
		CheckInDate:    booking.CheckInDate.Format("02 Jan 2006"),
		CheckOutDate:   booking.CheckOutDate.Format("02 Jan 2006"),
		Nights:         nights,
		TotalAmount:    grandTotal,
		OTP:            otp,
		QRBase64:       qrBase64,
		QRToken:        qrToken,
		BaseRate:       booking.BaseRate,
		DiscountAmount: booking.Discount,
		RoomChargesNet: booking.TotalAmount,
		FolioTotal:     folioSum,
		Subtotal:       taxableSubtotal,
		TaxAmount:      tax,
		TaxRate:        taxRate,
		GrandTotal:     grandTotal,
		TotalPaid:      totalPaid,
		BalanceDue:     balanceDue,
		FolioItems:     folioItems,
	})

	c.JSON(http.StatusOK, gin.H{
		"message":    "Check-in credentials sent to guest",
		"otp":        otp,      // shown to admin on folio so they can verify verbally
		"qr_base64":  qrBase64, // shown on folio for admin to scan from guest's phone
		"otp_expiry": record.OTPExpiry,
	})
}

// GET /api/bookings/:id/checkin/credentials
// Returns current valid OTP + QR for admin to display on folio (without resending).
func GetCheckinCredentials(c *gin.Context) {
	bookingID, err := resolveBookingID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hotelID := c.GetUint("active_hotel_id")

	var record models.BookingOTP
	if err := config.DB.Where("booking_id = ? AND hotel_id = ? AND otp_used = false AND qr_expiry > ?",
		bookingID, hotelID, time.Now()).
		Order("created_at desc").First(&record).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No active check-in credentials. Please send OTP first."})
		return
	}

	publicBase := utils.PublicBaseURL(nil)
	guestQRURL := fmt.Sprintf("%s/checkin/qr?token=%s", publicBase, record.QRToken)
	qrBase64, _ := utils.GenerateQRBase64WithSize(guestQRURL, 300)
	c.JSON(http.StatusOK, gin.H{
		"otp":        record.OTP,
		"qr_base64":  qrBase64,
		"qr_token":   record.QRToken, // raw token for admin scan via verify-qr
		"otp_expiry": record.OTPExpiry,
	})
}

// POST /api/bookings/:id/checkin/verify-otp
// Admin types the OTP shown on guest's phone/email → check-in.
func VerifyCheckinOTP(c *gin.Context) {
	bookingID, err := resolveBookingID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req struct {
		OTP string `json:"otp" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OTP is required"})
		return
	}

	// Find the most recent valid OTP record (without marking used yet)
	var record models.BookingOTP
	if err := config.DB.Where("booking_id = ? AND hotel_id = ? AND otp_used = false AND otp_expiry > ?",
		bookingID, hotelID, time.Now()).Order("created_at desc").First(&record).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OTP expired or not found. Please resend."})
		return
	}
	if record.OTP != req.OTP {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid OTP"})
		return
	}

	// Perform check-in first — only mark OTP used if it succeeds
	if err := services.CheckIn(bookingID, hotelID, adminID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Mark used after successful check-in
	config.DB.Model(&record).Updates(map[string]interface{}{"otp_used": true, "qr_used": true})

	c.JSON(http.StatusOK, gin.H{"message": "OTP verified. Check-in successful."})
}

// POST /api/bookings/checkin/verify-qr
// Admin scans QR from guest's phone → check-in.
func VerifyCheckinQR(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req struct {
		QRToken string `json:"qr_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "qr_token is required"})
		return
	}

	var record models.BookingOTP
	if err := config.DB.Where("qr_token = ? AND hotel_id = ? AND qr_used = false AND qr_expiry > ?",
		req.QRToken, hotelID, time.Now()).First(&record).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "QR code expired or already used"})
		return
	}

	config.DB.Model(&record).Updates(map[string]interface{}{"otp_used": true, "qr_used": true})

	if err := services.CheckIn(record.BookingID, hotelID, adminID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "QR verified. Check-in successful.", "booking_id": record.BookingID})
}
