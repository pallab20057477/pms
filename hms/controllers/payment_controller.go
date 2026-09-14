package controllers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

// bookingOutstandingBalance returns the amount still owed for a booking,
// accounting for folio items, advance payment, late checkout charges, and all recorded payments.
// Returns a negative value if the booking is already overpaid.
func bookingOutstandingBalance(bookingID uint) float64 {
	var b models.Booking
	if err := config.DB.Where("id = ?", bookingID).First(&b).Error; err != nil {
		return 0
	}

	// If total_amount is 0, recalculate it from room base price
	if b.TotalAmount <= 0 {
		var room models.Room
		if err := config.DB.Preload("RoomType").Where("id = ?", b.RoomID).First(&room).Error; err == nil {
			nights := int(b.CheckOutDate.Sub(b.CheckInDate).Hours() / 24)
			if nights <= 0 {
				nights = 1
			}
			basePrice := room.RoomType.BasePrice
			if basePrice <= 0 {
				basePrice = 1000.0 // Default fallback price
			}
			b.TotalAmount = float64(nights) * basePrice
		}
	}

	var folioSum float64
	config.DB.Model(&models.FolioItem{}).Where("booking_id = ?", bookingID).Select("COALESCE(SUM(amount),0)").Scan(&folioSum)
	var paymentsTotal float64
	config.DB.Table("payments").Where("booking_id = ? AND status = ? AND deleted_at IS NULL", bookingID, "success").Select("COALESCE(SUM(amount),0)").Scan(&paymentsTotal)

	// Calculate tax and gross
	taxRate := b.TaxRate
	if taxRate < 0 {
		taxRate = 0
	}
	taxableSubtotal := b.TotalAmount + folioSum
	if taxableSubtotal < 0 {
		taxableSubtotal = 0
	}
	taxTotal := 0.0
	if taxRate > 0 {
		taxTotal = taxableSubtotal * taxRate / 100
	}
	gross := taxableSubtotal + taxTotal
	if strings.ToLower(strings.ReplaceAll(strings.TrimSpace(b.Status), "-", "_")) == "cancelled" {
		return 0
	}
	return gross - paymentsTotal
}

func AddPayment(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	var req struct {
		BookingID uint    `json:"booking_id"`
		InvoiceID uint    `json:"invoice_id"`
		Amount    float64 `json:"amount" binding:"required"`
		Method    string  `json:"method"`
		Reference string  `json:"reference"`
		PaidOn    string  `json:"paid_on"`
		Status    string  `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid request: %v", err)})
		return
	}
	
	method := strings.ToLower(strings.TrimSpace(req.Method))
	if method == "" {
		method = "cash"
	}
	if method == "bank transfer" {
		method = "bank_transfer"
	}
	if method != "cash" && method != "upi" && method != "card" && method != "bank_transfer" && method != "razorpay" && method != "phonepe" && method != "cheque" && method != "other" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "method must be cash, upi, card, bank_transfer, razorpay, phonepe, cheque, or other"})
		return
	}
	
	statusField := strings.TrimSpace(strings.ToLower(req.Status))
	if statusField != "pending" && statusField != "failed" {
		statusField = "success"
	}

	if req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be > 0"})
		return
	}
	if req.BookingID == 0 && req.InvoiceID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "booking_id or invoice_id is required"})
		return
	}

	bookingID := req.BookingID
	if bookingID == 0 && req.InvoiceID > 0 {
		var invoice models.Invoice
		if err := config.DB.Where("id = ? AND hotel_id = ?", req.InvoiceID, hotelID).First(&invoice).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invoice not found"})
			return
		}
		bookingID = invoice.BookingID
	}

	var booking models.Booking
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", bookingID, hotelID).First(&booking).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "booking not found"})
		return
	}
	status := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(booking.Status), "-", "_"))
	if status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "payments are locked for cancelled bookings"})
		return
	}
	
	outstanding := bookingOutstandingBalance(bookingID)
	const epsilon = 0.01
	if outstanding <= epsilon {
		c.JSON(http.StatusBadRequest, gin.H{"error": "booking is already fully paid"})
		return
	}
	// We only strictly validate amount against outstanding if it's a successful payment
	if statusField == "success" && req.Amount > outstanding+epsilon {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":       fmt.Sprintf("amount exceeds outstanding balance of %.2f", outstanding),
			"outstanding": outstanding,
		})
		return
	}

	var paidOn *time.Time
	if strings.TrimSpace(req.PaidOn) != "" {
		t, err := time.Parse("2006-01-02", strings.TrimSpace(req.PaidOn))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "paid_on must be yyyy-mm-dd"})
			return
		}
		if err := utils.EnsureBusinessDateOpen(hotelID, t); err != nil {
			c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
			return
		}
		paidOn = &t
	} else {
		if err := utils.EnsureTodayOpen(hotelID); err != nil {
			c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
			return
		}
	}

	p := models.Payment{
		BookingID: bookingID,
		Amount:    req.Amount,
		Method:    method,
		Reference: strings.TrimSpace(req.Reference),
		Status:    statusField,
		PaidOn:    paidOn,
	}
	if err := config.DB.Create(&p).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record payment"})
		return
	}
	utils.LogActivity(c.GetUint("active_hotel_id"), "Payment", c.GetUint("admin_id"), "Payment recorded: "+method+" amount "+fmt.Sprintf("%.2f", req.Amount))
	c.JSON(http.StatusCreated, p)
}
func GetPaymentsForBooking(c *gin.Context) {
	bookingID := strings.TrimSpace(c.Param("booking_id"))
	hotelID := c.GetUint("active_hotel_id")
	var b models.Booking
	q := config.DB.Where("hotel_id = ? AND deleted_at IS NULL", hotelID)
	if strings.HasPrefix(bookingID, "BKG-") {
		q = q.Where("booking_code = ?", bookingID)
	} else {
		q = q.Where("id = ?", bookingID)
	}
	if err := q.First(&b).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}
	var payments []models.Payment
	if err := config.DB.Where("booking_id = ?", b.ID).Order("id desc").Find(&payments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payments"})
		return
	}
	c.JSON(http.StatusOK, payments)
}

func DeletePayment(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	paymentID := c.Param("payment_id")
	
	var payment models.Payment
	if err := config.DB.Where("id = ?", paymentID).First(&payment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment not found"})
		return
	}
	
	// Verify the booking belongs to this hotel (unscoped check in case booking was updated)
	var booking models.Booking
	if err := config.DB.Unscoped().Where("id = ?", payment.BookingID).First(&booking).Error; err == nil {
		if booking.HotelID != 0 && booking.HotelID != hotelID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized"})
			return
		}
	}
	
	// Delete the payment
	if err := config.DB.Delete(&payment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete payment"})
		return
	}
	
	utils.LogActivity(hotelID, "Payment", c.GetUint("admin_id"), "Payment deleted: "+fmt.Sprintf("%.2f", payment.Amount))
	c.JSON(http.StatusOK, gin.H{"message": "Payment deleted"})
}

func PaymentHistory(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	var payments []models.Payment
	if err := config.DB.Joins("JOIN bookings b ON b.id = payments.booking_id").Where("b.hotel_id = ?", hotelID).Order("payments.id desc").Find(&payments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payment history"})
		return
	}
	c.JSON(http.StatusOK, payments)
}

// Handles: Add payment, Delete payment, Payment history
