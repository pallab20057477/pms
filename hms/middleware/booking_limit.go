package middleware

import (
	"hms/config"
	"hms/models"
	"hms/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// CheckBookingLimit middleware checks if hotel can create a booking based on subscription tier
func CheckBookingLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		hotelID := c.GetUint("hotel_id")
		if hotelID == 0 {
			c.Next()
			return
		}

		// Check if hotel can create booking
		canCreate, err := services.CheckBookingLimit(hotelID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check booking limit"})
			c.Abort()
			return
		}

		if !canCreate {
			var hotel models.Hotel
			config.DB.First(&hotel, hotelID)
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "Booking limit reached for today",
				"message": "You have reached the daily booking limit for your Free tier. Please upgrade to Premium for unlimited bookings.",
				"tier":    hotel.SubscriptionTier,
				"limit":   hotel.BookingLimitPerDay,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
