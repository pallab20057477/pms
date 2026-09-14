package controllers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	// "hms/config"
	// "hms/models"
	"hms/services"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

// -----------------------------------------------------------------------------
// 1. PUSH BOOKING WEBHOOK (Receives Push Bookings from BookingHotel Channel Manager)
// -----------------------------------------------------------------------------

// HandleBookingHotelPushBooking handles incoming Book, Cancel, and Modify requests from BookingHotel
// Endpoint: POST /api/channel-manager/push-booking or /api/channel-manager/bookinghotel/push
func HandleBookingHotelPushBooking(c *gin.Context) {
	var req services.BookingHotelPushBookingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"Status":         "Fail",
			"ConfirmationNo": "",
			"Error":          "JSON binding error: " + err.Error(),
		})
		return
	}

	// Validate Authentication if required
	// In production, you can verify req.Authentication.UserName and req.Authentication.Password against hotel integration credentials

	resp, err := services.ProcessBookingHotelPushRequest(req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"Status":         "Fail",
			"ConfirmationNo": "",
			"Error":          err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// -----------------------------------------------------------------------------
// 2. UPDATE INVENTORY TO OTA (BookingHotel Channel Manager)
// -----------------------------------------------------------------------------

type UpdateInventoryManualRequest struct {
	Username       string `json:"username"`
	Password       string `json:"password"`
	HotelID        string `json:"hotel_id"`
	RoomTypeID     string `json:"room_type_id"`
	FromDate       string `json:"from_date"` // YYYY-MM-DD or DD/MM/YYYY
	ToDate         string `json:"to_date"`   // YYYY-MM-DD or DD/MM/YYYY
	InventoryCount int    `json:"inventory_count"`
}

// PushBookingHotelInventory allows PMS staff to manually or automatically trigger inventory updates to BookingHotel OTA
// Endpoint: POST /api/integrations/bookinghotel/inventory
func PushBookingHotelInventory(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req UpdateInventoryManualRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// If hotel_id or credentials are not passed in body, attempt to load from hotel integration settings
	if req.HotelID == "" && hotelID > 0 {
		req.HotelID = strconv.FormatUint(uint64(hotelID), 10)
	}

	// Parse Dates
	parseDate := func(dateStr string) (time.Time, error) {
		dateStr = strings.TrimSpace(dateStr)
		if t, err := time.Parse("2006-01-02", dateStr); err == nil {
			return t, nil
		}
		if t, err := time.Parse("02/01/2006", dateStr); err == nil {
			return t, nil
		}
		if t, err := time.Parse("02-01-2006", dateStr); err == nil {
			return t, nil
		}
		return time.Now(), nil
	}

	fromDate, _ := parseDate(req.FromDate)
	toDate, _ := parseDate(req.ToDate)
	if !toDate.After(fromDate) {
		toDate = fromDate.AddDate(0, 0, 1)
	}

	// Convert string IDs to uints for internal mapping
	parsedHotelID, _ := strconv.ParseUint(req.HotelID, 10, 32)
	parsedRoomTypeID, _ := strconv.ParseUint(req.RoomTypeID, 10, 32)

	resp, err := services.PushInventoryToBookingHotel(
		uint(parsedHotelID),
		uint(parsedRoomTypeID),
		fromDate,
		toDate,
		req.InventoryCount,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"ok":      false,
			"status":  "Fail",
			"error":   err.Error(),
			"message": "Inventory Failed to Updated",
		})
		return
	}

	if hotelID > 0 {
		utils.LogActivityWithContext(hotelID, "ChannelManager", adminID, "Pushed", "Inventory", "Pushed inventory to BookingHotel OTA")
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":       true,
		"status":   resp.Status,
		"response": resp,
	})
}
