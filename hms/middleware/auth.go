package middleware

import (
	"fmt"
	"hms/utils"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := c.GetHeader("Authorization")
		if tokenStr == "" || !strings.HasPrefix(tokenStr, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid token"})
			return
		}
		tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")
		claims, err := utils.ParseJWT(tokenStr)
		if err != nil {
			fmt.Printf("JWT Parse Error: %v\n", err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token", "detail": err.Error()})
			return
		}
		c.Set("admin_id", claims.AdminID)
		c.Set("active_hotel_id", claims.ActiveHotelID)
		c.Next()
	}
}

func RequireHotelID() gin.HandlerFunc {
	return func(c *gin.Context) {
		hotelID, exists := c.Get("active_hotel_id")
		if !exists || hotelID == nil || hotelID == 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "active_hotel_id required"})
			return
		}
		c.Next()
	}
}
