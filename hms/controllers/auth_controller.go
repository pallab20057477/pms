package controllers

import (
	"hms/config"
	"hms/models"
	"hms/utils"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// GET /me
func Me(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	if adminID == 0 {
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims, err := utils.ParseJWTRaw(tokenStr)
			if err == nil && claims != nil {
				adminID = claims.AdminID
			}
		}
	}
	if adminID == 0 {
		c.JSON(http.StatusOK, gin.H{
			"id":       0,
			"username": os.Getenv("SUPER_ADMIN_USERNAME"),
			"name":     "Super Administrator",
			"email":    os.Getenv("SUPER_ADMIN_USERNAME"),
			"role":     "super_admin",
		})
		return
	}
	var admin models.Admin
	if err := config.DB.First(&admin, adminID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Admin not found"})
		return
	}
	// hide sensitive fields
	admin.PasswordHash = ""
	c.JSON(http.StatusOK, admin)
}

type LoginRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token           string      `json:"token"`
	ActiveHotelID   uint        `json:"active_hotel_id"`
	LastActiveHotel uint        `json:"last_active_hotel_id"`
	Role            string      `json:"role"` // admin or super_admin
	User            interface{} `json:"user,omitempty"`
}

type StaffLoginRequest struct {
	HotelID  uint   `json:"hotel_id" binding:"required"`
	Phone    string `json:"phone"`
	Email    string `json:"email"`
	Password string `json:"password" binding:"required"`
}

func AdminLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	loginName := req.Username
	if loginName == "" {
		loginName = req.Email
	}
	if loginName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username or email is required"})
		return
	}

	// Check super admin credentials first (from .env)
	superAdminUsername := strings.TrimSpace(os.Getenv("SUPER_ADMIN_USERNAME"))
	superAdminPassword := strings.TrimSpace(os.Getenv("SUPER_ADMIN_PASSWORD"))
	if superAdminUsername != "" && loginName == superAdminUsername && req.Password == superAdminPassword {
		token, err := utils.GenerateJWT(0, 0)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"token":    token,
			"role":     "super_admin",
			"username": superAdminUsername,
		})
		return
	}

	// Regular admin login
	var admin models.Admin
	if err := config.DB.Where("username = ? OR email = ?", loginName, loginName).First(&admin).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if admin.Status == "suspended" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin account is suspended"})
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(req.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	// Verify LastActiveHotelID belongs to this admin, reset if not
	if admin.LastActiveHotelID > 0 {
		var hotelCheck models.Hotel
		if err := config.DB.Where("id = ? AND admin_id = ?", admin.LastActiveHotelID, admin.ID).First(&hotelCheck).Error; err != nil {
			// Hotel doesn't belong to this admin — find their first hotel
			var firstHotel models.Hotel
			if err2 := config.DB.Where("admin_id = ?", admin.ID).Order("id asc").First(&firstHotel).Error; err2 == nil {
				admin.LastActiveHotelID = firstHotel.ID
			} else {
				admin.LastActiveHotelID = 0
			}
			config.DB.Model(&admin).Update("last_active_hotel_id", admin.LastActiveHotelID)
		}
	} else {
		// No active hotel set — auto-assign first hotel
		var firstHotel models.Hotel
		if err := config.DB.Where("admin_id = ?", admin.ID).Order("id asc").First(&firstHotel).Error; err == nil {
			admin.LastActiveHotelID = firstHotel.ID
			config.DB.Model(&admin).Update("last_active_hotel_id", admin.LastActiveHotelID)
		}
	}

	// Load hotel features + tier for JWT
	features := utils.HotelFeatures{Reports: true, Housekeeping: true}
	tier := "free"
	if admin.LastActiveHotelID > 0 {
		var hotel models.Hotel
		if err := config.DB.First(&hotel, admin.LastActiveHotelID).Error; err == nil {
			if hotel.SubscriptionEndDate != nil && time.Now().After(*hotel.SubscriptionEndDate) {
				c.JSON(http.StatusForbidden, gin.H{"error": "Your hotel subscription has expired. Please contact billing."})
				return
			}
			tier = hotel.SubscriptionTier
			features = utils.HotelFeatures{
				OnlinePayment:   hotel.FeatureOnlinePayment,
				Reports:         hotel.FeatureReports,
				StaffPayroll:    hotel.FeatureStaffPayroll,
				Housekeeping:    hotel.FeatureHousekeeping,
				EmailNotify:     hotel.FeatureEmailNotify,
				SeasonalPricing: hotel.FeatureSeasonalPricing,
			}
		}
	}

	token, err := utils.GenerateJWTWithPlan(admin.ID, admin.LastActiveHotelID, tier, features)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	utils.LogActivity(admin.LastActiveHotelID, "Auth", admin.ID, "Admin logged in")
	c.JSON(http.StatusOK, LoginResponse{
		Token:           token,
		ActiveHotelID:   admin.LastActiveHotelID,
		LastActiveHotel: admin.LastActiveHotelID,
		Role:            "admin",
		User: gin.H{
			"id":            admin.ID,
			"username":      admin.Username,
			"name":          admin.Name,
			"email":         admin.Email,
			"phone":         admin.Phone,
			"profile_photo": admin.ProfilePhoto,
		},
	})
}

func StaffCRMLogin(c *gin.Context) {
	var req StaffLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	phone := strings.TrimSpace(req.Phone)
	email := strings.TrimSpace(req.Email)
	if phone == "" && email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "phone or email is required"})
		return
	}

	q := config.DB.Where("hotel_id = ? AND deleted_at IS NULL", req.HotelID)
	if phone != "" {
		q = q.Where("phone = ?", phone)
	} else {
		q = q.Where("LOWER(email) = LOWER(?)", email)
	}

	var staff models.Staff
	if err := q.First(&staff).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	if !staff.Status {
		c.JSON(http.StatusForbidden, gin.H{"error": "Staff account is inactive"})
		return
	}
	if !staff.PortalAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "Portal access is disabled"})
		return
	}
	if strings.TrimSpace(staff.CRMPasswordHash) == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Password is not set for this staff account"})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(staff.CRMPasswordHash), []byte(req.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Check hotel subscription expiry
	var hotel models.Hotel
	if err := config.DB.First(&hotel, req.HotelID).Error; err == nil {
		if hotel.SubscriptionEndDate != nil && time.Now().After(*hotel.SubscriptionEndDate) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Your hotel subscription has expired. Please contact billing."})
			return
		}
	}

	utils.LogActivity(req.HotelID, "Auth", 0, "Staff logged in: "+staff.Name)
	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"staff": gin.H{
			"id":            staff.ID,
			"hotel_id":      staff.HotelID,
			"name":          staff.Name,
			"role":          staff.Role,
			"phone":         staff.Phone,
			"email":         staff.Email,
			"portal_access": staff.PortalAccess,
			"status":        staff.Status,
		},
	})
}

// Hotel selection endpoint
func SelectHotel(c *gin.Context) {
	var req struct {
		HotelID uint `json:"hotel_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	adminID := c.GetUint("admin_id")
	var admin models.Admin
	if err := config.DB.First(&admin, adminID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Admin not found"})
		return
	}

	// Verify the hotel belongs to this admin
	var hotel models.Hotel
	if err := config.DB.Where("id = ? AND admin_id = ?", req.HotelID, adminID).First(&hotel).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hotel not found or access denied"})
		return
	}

	admin.LastActiveHotelID = req.HotelID
	config.DB.Save(&admin)

	// Embed hotel features in the new token
	features := utils.HotelFeatures{
		OnlinePayment:   hotel.FeatureOnlinePayment,
		Reports:         hotel.FeatureReports,
		StaffPayroll:    hotel.FeatureStaffPayroll,
		Housekeeping:    hotel.FeatureHousekeeping,
		EmailNotify:     hotel.FeatureEmailNotify,
		SeasonalPricing: hotel.FeatureSeasonalPricing,
	}
	token, err := utils.GenerateJWTWithPlan(admin.ID, req.HotelID, hotel.SubscriptionTier, features)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	utils.LogActivity(req.HotelID, "Hotel", admin.ID, "Hotel switched")
	c.JSON(http.StatusOK, gin.H{"token": token, "active_hotel_id": req.HotelID})
}
