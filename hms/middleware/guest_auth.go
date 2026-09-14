package middleware

import (
	"hms/utils"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// GuestAuthMiddleware validates portal PublicUser JWT tokens.
// Completely separate from admin AuthMiddleware.
func GuestAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := c.GetHeader("Authorization")
		if tokenStr == "" || !strings.HasPrefix(tokenStr, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Login required"})
			return
		}
		tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")

		claims, err := utils.ParseGuestJWT(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			return
		}

		// Check JWT blacklist (logout)
		if utils.JWTIsBlacklisted(claims.ID) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token has been revoked"})
			return
		}

		c.Set("public_user_id", claims.PublicUserID)
		c.Set("public_user_email", claims.Email)
		c.Set("guest_jti", claims.ID)
		c.Next()
	}
}
