package controllers

import (
	"math"
	"net/http"
	"strings"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

func GetFolio(c *gin.Context) {
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
	var items []models.FolioItem
	if err := config.DB.Where("booking_id = ?", b.ID).Order("id asc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch folio"})
		return
	}
	c.JSON(http.StatusOK, items)
}
func AddFolioItem(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	var f models.FolioItem
	if err := c.ShouldBindJSON(&f); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	f.Description = strings.TrimSpace(f.Description)
	f.Type = strings.ToLower(strings.TrimSpace(f.Type))
	if f.Description == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "description is required"})
		return
	}
	if f.Type == "" {
		f.Type = "service"
	}
	if f.Type != "service" && f.Type != "extra" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be service or extra"})
		return
	}
	if f.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be > 0"})
		return
	}
	if !f.Taxable {
		f.Taxable = false
	} else {
		f.Taxable = true
	}

	var booking models.Booking
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", f.BookingID, hotelID).First(&booking).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "booking not found"})
		return
	}
	if err := utils.EnsureTodayOpen(hotelID); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}
	status := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(booking.Status), "-", "_"))
	if status == "completed" || status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "folio is locked for this booking"})
		return
	}
	if err := config.DB.Create(&f).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add folio item"})
		return
	}
	utils.LogActivity(c.GetUint("active_hotel_id"), "Folio", c.GetUint("admin_id"), "Folio item added: "+f.Description)
	c.JSON(http.StatusCreated, f)
}
func ApplyFolioDiscount(c *gin.Context) {
	var req struct {
		BookingID      uint    `json:"booking_id" binding:"required"`
		Discount       float64 `json:"discount"`
		DiscountType   string  `json:"discount_type"`
		DiscountReason string  `json:"discount_reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var b models.Booking
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", req.BookingID, c.GetUint("active_hotel_id")).First(&b).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}
	if err := utils.EnsureTodayOpen(c.GetUint("active_hotel_id")); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}
	status := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(b.Status), "-", "_"))
	if status == "completed" || status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "folio is locked for this booking"})
		return
	}
	typeVal := strings.ToLower(strings.TrimSpace(req.DiscountType))
	if typeVal == "" {
		typeVal = "amount"
	}
	if typeVal != "amount" && typeVal != "percentage" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "discount_type must be amount or percentage"})
		return
	}
	if req.Discount > 0 && strings.TrimSpace(req.DiscountReason) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "discount_reason is required when discount is applied"})
		return
	}
	applied := req.Discount
	if typeVal == "percentage" {
		if applied < 0 || applied > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "percentage discount must be between 0 and 100"})
			return
		}
		var folioSum float64
		config.DB.Model(&models.FolioItem{}).Where("booking_id = ?", b.ID).Select("COALESCE(SUM(amount),0)").Scan(&folioSum)
		base := b.TotalAmount + folioSum
		applied = (base * applied) / 100
	}
	b.Discount = applied
	b.DiscountType = typeVal
	b.DiscountReason = strings.TrimSpace(req.DiscountReason)
	if err := config.DB.Save(&b).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to apply discount"})
		return
	}
	utils.LogActivity(b.HotelID, "Folio", c.GetUint("admin_id"), "Discount applied: "+strings.TrimSpace(req.DiscountReason))
	c.JSON(http.StatusOK, gin.H{"message": "Discount applied", "discount_amount": applied, "discount_type": typeVal})
}
func DeleteFolioItem(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	var item models.FolioItem
	if err := config.DB.Where("id = ?", c.Param("id")).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folio item not found"})
		return
	}
	var booking models.Booking
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", item.BookingID, hotelID).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}
	if err := utils.EnsureTodayOpen(hotelID); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}
	status := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(booking.Status), "-", "_"))
	if status == "completed" || status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "folio is locked for this booking"})
		return
	}
	if err := config.DB.Where("id = ?", c.Param("id")).Delete(&models.FolioItem{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folio item"})
		return
	}
	utils.LogActivity(c.GetUint("active_hotel_id"), "Folio", c.GetUint("admin_id"), "Folio item deleted")
	c.JSON(http.StatusOK, gin.H{"message": "Deleted"})
}

// Handles: View running bill, Add charges, Apply discount

// CalculateBookingBalance returns the authoritative current balance breakdown for a booking.
func CalculateBookingBalance(b *models.Booking) (gross float64, advance float64, paymentsTotal float64, taxTotal float64, due float64) {
	status := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(b.Status), "-", "_"))
	if status == "cancelled" || status == "canceled" {
		return 0, b.AdvancePayment, 0, 0, 0
	}

	totalAmount := b.TotalAmount
	// If total_amount is 0, recalculate it from room base price
	if totalAmount <= 0 {
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
			totalAmount = float64(nights)*basePrice - b.Discount
		}
	}

	var folioSum float64
	config.DB.Model(&models.FolioItem{}).Where("booking_id = ?", b.ID).Select("COALESCE(SUM(amount),0)").Scan(&folioSum)

	// Payments table: sum all payments for this booking
	config.DB.Table("payments").Where("booking_id = ? AND status = ? AND deleted_at IS NULL", b.ID, "success").Select("COALESCE(SUM(amount),0)").Scan(&paymentsTotal)

	taxRate := b.TaxRate
	if taxRate < 0 {
		taxRate = 0
	}

	taxableSubtotal := totalAmount + folioSum
	if taxableSubtotal < 0 {
		taxableSubtotal = 0
	}

	if b.Tax > 0 {
		// Use explicit tax for the base room amount (from OTA channel), plus dynamic tax for extra folio items
		taxTotal = b.Tax
		if taxRate > 0 && folioSum > 0 {
			taxTotal += (folioSum * taxRate) / 100
		}
	} else {
		// Calculate dynamically for manual bookings
		if taxRate > 0 {
			taxTotal = taxableSubtotal * taxRate / 100
		} else {
			taxTotal = 0
		}
	}

	gross = taxableSubtotal + taxTotal
	advance = b.AdvancePayment
	due = gross - paymentsTotal
	if due < 0.01 {
		due = 0
	}
	due = math.Round(due*100) / 100.0
	gross = math.Round(gross*100) / 100.0
	taxTotal = math.Round(taxTotal*100) / 100.0

	return gross, advance, paymentsTotal, taxTotal, due
}

// GetBookingBalance returns the authoritative current balance for a booking (for checkout, list, etc.)
func GetBookingBalance(c *gin.Context) {
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

	gross, advance, paymentsTotal, taxTotal, due := CalculateBookingBalance(&b)

	c.JSON(http.StatusOK, gin.H{
		"booking_id":      b.ID,
		"gross":           gross,
		"advance":         advance,
		"payments_total":  paymentsTotal,
		"discount":        b.Discount,
		"tax":             taxTotal,
		"current_balance": due,
	})
}
