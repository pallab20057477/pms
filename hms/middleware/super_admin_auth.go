package middleware

import (
	"hms/utils"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// SuperAdminAuth middleware checks if the request is from a super admin
func SuperAdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header"})
			c.Abort()
			return
		}

		token := parts[1]
		claims, err := utils.ParseJWTRaw(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		// Super admin has admin_id = 0
		if claims.AdminID != 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "Super admin access required"})
			c.Abort()
			return
		}

		c.Set("admin_id", claims.AdminID)
		c.Next()
	}
}
