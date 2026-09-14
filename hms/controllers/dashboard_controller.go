package controllers

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"time"

	"hms/config"
	"hms/models"

	"github.com/gin-gonic/gin"
)

const dashboardCacheTTL = 300 * time.Second

type dirtyRoomSummaryRow struct {
	ID         uint   `json:"id"`
	RoomNumber string `json:"room_number"`
	RoomType   string `json:"room_type"`
	Status     string `json:"status"`
}

type dashboardSummaryPayload struct {
	TotalRooms      int64                  `json:"total_rooms"`
	AvailableRooms  int64                  `json:"available_rooms"`
	OccupiedRooms   int64                  `json:"occupied_rooms"`
	DirtyRooms      int64                  `json:"dirty_rooms"`
	CleaningRooms   int64                  `json:"cleaning_rooms"`
	MaintenanceRooms int64                 `json:"maintenance_rooms"`
	TodaysRevenue   float64                `json:"todays_revenue"`
	Checkins        []models.Booking       `json:"checkins"`
	Checkouts       []models.Booking       `json:"checkouts"`
	DirtyRoomsList  []dirtyRoomSummaryRow  `json:"dirty_rooms_list"`
	Alerts          map[string]interface{} `json:"alerts"`
}

// dashboardCacheKey builds a Redis key for a given hotel's dashboard data.
func dashboardCacheKey(hotelID uint) string {
	return fmt.Sprintf("hms:dashboard:summary:%d", hotelID)
}

// InvalidateDashboardCache removes the cached dashboard summary for the given hotel.
// Call this from any controller that modifies room/booking/payment data.
func InvalidateDashboardCache(hotelID uint) {
	config.CacheDelete(context.Background(), dashboardCacheKey(hotelID))
}

// DashboardSummary returns aggregated metrics for the active hotel.
// Response is cached in Redis for 60 seconds per hotel.
func DashboardSummary(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	cacheKey := dashboardCacheKey(hotelID)
	ctx := c.Request.Context()

	// --- Redis cache read ---
	var cached dashboardSummaryPayload
	if config.CacheGet(ctx, cacheKey, &cached) {
		c.JSON(http.StatusOK, gin.H{"data": cached, "cached": true})
		return
	}

	// --- DB fetch ---
	var (
		totalRooms   int64
		available    int64
		occupied     int64
		dirty        int64
		cleaning     int64
		maintenance  int64
		dirtyRooms   []dirtyRoomSummaryRow
		todaysRevenue float64
		pendingCount  int64
		pendingAmount float64
	)

	baseRooms := config.DB.Model(&models.Room{}).Where("hotel_id = ? AND deleted_at IS NULL", hotelID)
	baseRooms.Count(&totalRooms)
	config.DB.Model(&models.Room{}).Where("hotel_id = ? AND deleted_at IS NULL AND LOWER(TRIM(status)) = ?", hotelID, "available").Count(&available)
	config.DB.Model(&models.Room{}).Where("hotel_id = ? AND deleted_at IS NULL AND LOWER(TRIM(status)) = ?", hotelID, "occupied").Count(&occupied)
	config.DB.Model(&models.Room{}).Where("hotel_id = ? AND deleted_at IS NULL AND LOWER(TRIM(status)) = ?", hotelID, "cleaning").Count(&cleaning)
	config.DB.Model(&models.Room{}).Where("hotel_id = ? AND deleted_at IS NULL AND LOWER(TRIM(status)) = ?", hotelID, "maintenance").Count(&maintenance)

	_ = config.DB.Model(&models.Room{}).
		Select("id, room_number, room_type, status").
		Where("hotel_id = ? AND LOWER(TRIM(status)) = ? AND deleted_at IS NULL", hotelID, "dirty").
		Order("updated_at desc, room_number asc").
		Limit(10).
		Scan(&dirtyRooms).Error
	dirty = int64(len(dirtyRooms))

	today := time.Now().Format("2006-01-02")
	config.DB.Raw(
		`SELECT COALESCE(SUM(p.amount),0)
		 FROM payments p
		 JOIN bookings b ON p.booking_id = b.id
		 WHERE b.hotel_id = ?
		   AND p.created_at::date = ?
		   AND p.status = 'success'
		   AND p.deleted_at IS NULL`,
		hotelID, today,
	).Scan(&todaysRevenue)

	var checkins []models.Booking
	var checkouts []models.Booking
	config.DB.Where("hotel_id = ? AND DATE(check_in_date) = ?", hotelID, today).
		Limit(10).Order("check_in_date asc").Find(&checkins)
	config.DB.Where("hotel_id = ? AND DATE(check_out_date) = ?", hotelID, today).
		Limit(10).Order("check_out_date asc").Find(&checkouts)

	var hotelBookings []models.Booking
	config.DB.Where("hotel_id = ? AND deleted_at IS NULL", hotelID).Find(&hotelBookings)
	for i := range hotelBookings {
		_, _, _, _, due := CalculateBookingBalance(&hotelBookings[i])
		if due > 0.01 {
			pendingCount++
			pendingAmount += due
		}
	}
	pendingAmount = math.Round(pendingAmount*100) / 100.0

	alerts := map[string]interface{}{
		"dirty_rooms":             dirty,
		"maintenance_rooms":       maintenance,
		"pending_payments_count":  pendingCount,
		"pending_payments_amount": pendingAmount,
	}

	payload := dashboardSummaryPayload{
		TotalRooms:       totalRooms,
		AvailableRooms:   available,
		OccupiedRooms:    occupied,
		DirtyRooms:       dirty,
		CleaningRooms:    cleaning,
		MaintenanceRooms: maintenance,
		TodaysRevenue:    todaysRevenue,
		Checkins:         checkins,
		Checkouts:        checkouts,
		DirtyRoomsList:   dirtyRooms,
		Alerts:           alerts,
	}

	// --- Redis cache write ---
	config.CacheSet(ctx, cacheKey, payload, dashboardCacheTTL)

	c.JSON(http.StatusOK, gin.H{"data": payload})
}
