package controllers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hms/config"
	"hms/models"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	razorpay "github.com/razorpay/razorpay-go"
)

// razorpayClientForHotel returns a Razorpay client using the credentials
// stored on the Hotel record, falling back gracefully if not configured.
func razorpayClientForHotel(hotelID uint) (*razorpay.Client, string, string, error) {
	var hotel models.Hotel
	if err := config.DB.Select("razorpay_key_id, razorpay_key_secret").First(&hotel, hotelID).Error; err != nil {
		return nil, "", "", fmt.Errorf("hotel not found")
	}
	keyID := strings.TrimSpace(hotel.RazorpayKeyID)
	keySecret := strings.TrimSpace(hotel.RazorpayKeySecret)
	if keyID == "" || keySecret == "" {
		return nil, "", "", fmt.Errorf("Razorpay is not configured for this hotel — please set credentials in the Super Admin dashboard")
	}
	client := razorpay.NewClient(keyID, keySecret)
	return client, keyID, keySecret, nil
}

// GET /api/payments/razorpay/health
// Test endpoint to verify Razorpay credentials for a hotel
func RazorpayHealth(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	if hotelID == 0 {
		if hidStr := c.Query("hotel_id"); hidStr != "" {
			if id, err := strconv.ParseUint(hidStr, 10, 32); err == nil {
				hotelID = uint(id)
			}
		}
	}
	if hotelID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hotel_id required"})
		return
	}
	_, _, _, err := razorpayClientForHotel(hotelID)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Razorpay credentials valid & initialized successfully!"})
}

// GET /api/payments/razorpay/test
// Simple test endpoint
func RazorpayTest(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"message": "Razorpay test endpoint working",
	})
}

// POST /api/payments/razorpay/create-order
// Creates a Razorpay order for a booking's outstanding balance.
func CreateRazorpayOrder(c *gin.Context) {
	defer func() {
		if r := recover(); r != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error", "details": fmt.Sprintf("%v", r)})
		}
	}()

	hotelID := c.GetUint("active_hotel_id")

	var req struct {
		BookingID uint    `json:"booking_id" binding:"required"`
		Amount    float64 `json:"amount" binding:"required"`
		HotelID   uint    `json:"hotel_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be greater than 0"})
		return
	}

	if hotelID == 0 && req.HotelID > 0 {
		hotelID = req.HotelID
	}

	var booking models.Booking
	if hotelID > 0 {
		if err := config.DB.Where("id = ? AND hotel_id = ?", req.BookingID, hotelID).First(&booking).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
			return
		}
	} else {
		if err := config.DB.Where("id = ?", req.BookingID).First(&booking).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
			return
		}
		hotelID = booking.HotelID
	}

	outstanding := bookingOutstandingBalance(req.BookingID)
	const epsilon = 0.01
	if outstanding <= epsilon {
		c.JSON(http.StatusBadRequest, gin.H{"error": "booking is already fully paid"})
		return
	}
	if req.Amount > outstanding+epsilon {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":       fmt.Sprintf("amount exceeds outstanding balance of %.2f", outstanding),
			"outstanding": outstanding,
		})
		return
	}

	client, keyID, _, err := razorpayClientForHotel(hotelID)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	amountPaise := int(req.Amount * 100)
	notes := map[string]interface{}{
		"booking_id": req.BookingID,
		"hotel_id":   hotelID,
	}

	var order map[string]interface{}
	data := map[string]interface{}{
		"amount":   amountPaise,
		"currency": "INR",
		"receipt":  fmt.Sprintf("booking_%d", req.BookingID),
		"notes":    notes,
	}
	order, err = client.Order.Create(data, nil)

	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "401") || strings.Contains(errMsg, "Unauthorized") || strings.Contains(errMsg, "Authentication") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Razorpay authentication failed - check your API credentials", "details": errMsg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create Razorpay order", "details": errMsg})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"order_id":   order["id"],
		"amount":     amountPaise,
		"currency":   "INR",
		"key_id":     keyID,
		"booking_id": req.BookingID,
	})
}

// POST /api/payments/razorpay/verify
// Verifies Razorpay payment signature and records the payment.
func VerifyRazorpayPayment(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")

	var req struct {
		RazorpayOrderID   string  `json:"razorpay_order_id" binding:"required"`
		RazorpayPaymentID string  `json:"razorpay_payment_id" binding:"required"`
		RazorpaySignature string  `json:"razorpay_signature" binding:"required"`
		BookingID         uint    `json:"booking_id" binding:"required"`
		Amount            float64 `json:"amount" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify HMAC-SHA256 signature using the hotel's secret
	_, _, secret, err := razorpayClientForHotel(hotelID)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	message := req.RazorpayOrderID + "|" + req.RazorpayPaymentID
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(message))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expectedSig), []byte(req.RazorpaySignature)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payment signature verification failed"})
		return
	}

	// Verify booking belongs to this hotel
	var booking models.Booking
	if err := config.DB.Where("id = ? AND hotel_id = ?", req.BookingID, hotelID).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}

	// Record the payment
	now := time.Now()
	payment := models.Payment{
		BookingID: req.BookingID,
		Amount:    req.Amount,
		Method:    "razorpay",
		Reference: req.RazorpayPaymentID,
		PaidOn:    &now,
	}
	if err := config.DB.Create(&payment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment verified but failed to record"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Payment verified and recorded",
		"payment_id": payment.ID,
		"reference":  req.RazorpayPaymentID,
	})
}
