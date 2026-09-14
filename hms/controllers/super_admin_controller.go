package controllers

import (
	"hms/config"
	"hms/models"
	"hms/services"
	"hms/utils"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// SuperAdminLogin handles super admin login from .env credentials
func SuperAdminLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	superAdminUsername := strings.TrimSpace(os.Getenv("SUPER_ADMIN_USERNAME"))
	superAdminPassword := strings.TrimSpace(os.Getenv("SUPER_ADMIN_PASSWORD"))

	if superAdminUsername == "" || superAdminPassword == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Super admin not configured"})
		return
	}

	if req.Username != superAdminUsername || req.Password != superAdminPassword {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid super admin credentials"})
		return
	}

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
}

func GetDashboard(c *gin.Context) {
	stats, err := services.GetDashboardStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func GetAllAdmins(c *gin.Context) {
	page, pageSize := parsePagination(c, 10)
	admins, total, err := services.GetAllAdmins(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":        admins,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

func GetAllHotels(c *gin.Context) {
	page, pageSize := parsePagination(c, 10)
	hotels, total, err := services.GetAllHotels(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":        hotels,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

func UpdateHotelSubscription(c *gin.Context) {
	hotelID, err := parseIDParam(c, "hotel_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel ID"})
		return
	}
	var req struct {
		Tier           string  `json:"tier" binding:"required"`
		Reason         string  `json:"reason"`
		DurationMonths int     `json:"duration_months"`
		Amount         float64 `json:"amount"`
		StartDate      *string `json:"start_date"`
		EndDate        *string `json:"end_date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Tier != "free" && req.Tier != "pro" && req.Tier != "premium" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid tier. Must be 'free', 'pro', or 'premium'"})
		return
	}
	
	var customStart, customEnd *time.Time
	if req.StartDate != nil && *req.StartDate != "" {
		parsedStart, err := time.Parse("2006-01-02", *req.StartDate)
		if err == nil {
			customStart = &parsedStart
		}
	}
	if req.EndDate != nil && *req.EndDate != "" {
		parsedEnd, err := time.Parse("2006-01-02", *req.EndDate)
		if err == nil {
			customEnd = &parsedEnd
		}
	}

	if err := services.UpdateSubscription(hotelID, req.Tier, 0, req.Reason, req.DurationMonths, req.Amount, customStart, customEnd); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Subscription updated successfully"})
}

func SuspendHotel(c *gin.Context) {
	hotelID, err := parseIDParam(c, "hotel_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel ID"})
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	c.ShouldBindJSON(&req)
	if err := services.SuspendHotel(hotelID, 0, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Hotel suspended successfully"})
}

func ActivateHotel(c *gin.Context) {
	hotelID, err := parseIDParam(c, "hotel_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel ID"})
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	c.ShouldBindJSON(&req)
	if err := services.ActivateHotel(hotelID, 0, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Hotel activated successfully"})
}

func SuspendAdmin(c *gin.Context) {
	adminID, err := parseIDParam(c, "admin_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid admin ID"})
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	c.ShouldBindJSON(&req)
	if err := services.SuspendAdmin(adminID, 0, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Admin suspended successfully"})
}

func ActivateAdmin(c *gin.Context) {
	adminID, err := parseIDParam(c, "admin_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid admin ID"})
		return
	}
	if err := services.ActivateAdmin(adminID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Admin activated successfully"})
}

func CreateAdmin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Email    string `json:"email" binding:"required"`
		Name     string `json:"name" binding:"required"`
		Phone    string `json:"phone"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}
	admin, err := services.CreateAdminAccount(req.Username, req.Email, req.Name, req.Phone, string(hashedPassword))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"message": "Admin created successfully",
		"admin":   gin.H{"id": admin.ID, "username": admin.Username, "email": admin.Email, "name": admin.Name},
	})
}

func CreateHotel(c *gin.Context) {
	var req struct {
		AdminID   uint   `json:"admin_id" binding:"required"`
		HotelName string `json:"hotel_name" binding:"required"`
		City      string `json:"city"`
		State     string `json:"state"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hotel, err := services.CreateHotelForAdmin(req.AdminID, req.HotelName, req.City, req.State)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"message": "Hotel created successfully",
		"hotel":   gin.H{"id": hotel.ID, "name": hotel.Name, "subscription_tier": hotel.SubscriptionTier},
	})
}

func GetHotelUsage(c *gin.Context) {
	hotelID, err := parseIDParam(c, "hotel_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel ID"})
		return
	}
	usage, err := services.GetHotelUsage(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, usage)
}

func GetSubscriptionLogs(c *gin.Context) {
	page, pageSize := parsePagination(c, 20)
	hotelID := uint(0)
	if hid := c.Query("hotel_id"); hid != "" {
		if parsed, err := strconv.ParseUint(hid, 10, 32); err == nil {
			hotelID = uint(parsed)
		}
	}
	logs, total, err := services.GetSubscriptionLogs(hotelID, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":        logs,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": int((total + int64(pageSize) - 1) / int64(pageSize)),
	})
}

func UpdateSubscriptionLogPaymentStatus(c *gin.Context) {
	logIDStr := c.Param("id")
	logID, err := strconv.ParseUint(logIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid log ID"})
		return
	}

	var req struct {
		PaymentStatus string `json:"payment_status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := services.UpdateSubscriptionLogPaymentStatus(uint(logID), req.PaymentStatus); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Payment status updated successfully"})
}

func GetAdminHotels(c *gin.Context) {
	adminID, err := parseIDParam(c, "admin_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid admin ID"})
		return
	}
	hotels, err := services.GetAdminHotels(adminID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"admin_id": adminID, "hotels": hotels})
}

// UpdateHotelPaymentConfig sets per-hotel payment credentials (Razorpay or PhonePe)
func UpdateHotelPaymentConfig(c *gin.Context) {
	hotelID, err := parseIDParam(c, "hotel_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel ID"})
		return
	}
	var req services.PaymentConfigInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := services.UpdateHotelPaymentConfig(hotelID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Payment credentials updated successfully"})
}

// ════════════════════════════════════════════════════════
// BILLING & USAGE
// ════════════════════════════════════════════════════════

// GetPlatformBilling returns SaaS billing stats and per-hotel revenue data
func GetPlatformBilling(c *gin.Context) {
	page, pageSize := parsePagination(c, 20)
	stats, err := services.GetPlatformBilling(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// ════════════════════════════════════════════════════════
// SYSTEM & OTA HEALTH
// ════════════════════════════════════════════════════════

// GetSystemHealth returns platform health for all services and OTA channels
func GetSystemHealth(c *gin.Context) {
	report, err := services.GetSystemHealth()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

// ════════════════════════════════════════════════════════
// COMPLIANCE & AUDIT
// ════════════════════════════════════════════════════════

// GetPlatformAuditLogs returns cross-tenant activity logs with optional filters
func GetPlatformAuditLogs(c *gin.Context) {
	page, pageSize := parsePagination(c, 30)
	module := c.Query("module")
	action := c.Query("action")
	hotelID := c.Query("hotel_id")

	result, err := services.GetPlatformAuditLogs(page, pageSize, module, action, hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// GetAuditModules returns the list of distinct module names for filter dropdowns
func GetAuditModules(c *gin.Context) {
	modules, err := services.GetAuditModules()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"modules": modules})
}

// helpers
func parsePagination(c *gin.Context, defaultSize int) (int, int) {
	page, pageSize := 1, defaultSize
	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 && v <= 100 {
			pageSize = v
		}
	}
	return page, pageSize
}

func parseIDParam(c *gin.Context, name string) (uint, error) {
	id, err := strconv.ParseUint(c.Param(name), 10, 32)
	return uint(id), err
}

// UpdateHotelFeatures updates feature flags for a hotel
func UpdateHotelFeatures(c *gin.Context) {
	hotelID, err := parseIDParam(c, "hotel_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel ID"})
		return
	}

	var req struct {
		FeatureOnlinePayment   *bool `json:"feature_online_payment"`
		FeatureReports         *bool `json:"feature_reports"`
		FeatureStaffPayroll    *bool `json:"feature_staff_payroll"`
		FeatureHousekeeping    *bool `json:"feature_housekeeping"`
		FeatureEmailNotify     *bool `json:"feature_email_notify"`
		FeatureSeasonalPricing *bool `json:"feature_seasonal_pricing"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := services.UpdateHotelFeatures(hotelID, map[string]interface{}{
		"feature_online_payment":   req.FeatureOnlinePayment,
		"feature_reports":          req.FeatureReports,
		"feature_staff_payroll":    req.FeatureStaffPayroll,
		"feature_housekeeping":     req.FeatureHousekeeping,
		"feature_email_notify":     req.FeatureEmailNotify,
		"feature_seasonal_pricing": req.FeatureSeasonalPricing,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Features updated successfully"})
}

// GetHotelFeatures returns feature flags for a hotel
func GetHotelFeatures(c *gin.Context) {
	hotelID, err := parseIDParam(c, "hotel_id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel ID"})
		return
	}

	features, err := services.GetHotelFeatures(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, features)
}

// GetAllPlans gets all subscription plan configurations
func GetAllPlans(c *gin.Context) {
	plans, err := services.GetAllPlans()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, plans)
}

// UpdatePlan updates a specific plan configuration
func UpdatePlan(c *gin.Context) {
	tier := c.Param("tier")
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := services.UpdatePlan(tier, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Plan updated successfully"})
}

// ImpersonateHotel allows a Super Admin to generate a session token for a specific hotel.
func ImpersonateHotel(c *gin.Context) {
	// 1. Verify caller is Super Admin (AdminID == 0, handled by middleware but good to double check)
	adminID := c.GetUint("admin_id")
	if adminID != 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only Super Admin can impersonate"})
		return
	}

	// 2. Fetch the target hotel
	hotelIDStr := c.Param("hotel_id")
	hotelID, err := strconv.ParseUint(hotelIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel ID"})
		return
	}

	var hotel models.Hotel
	if err := config.DB.First(&hotel, hotelID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hotel not found"})
		return
	}

	if hotel.AdminID == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Hotel has no owner assigned"})
		return
	}

	// 3. Generate a fresh JWT session token scoped to that hotel's owner (admin)
	token, err := utils.GenerateJWT(*hotel.AdminID, uint(hotelID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate impersonation token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"hotel_id": hotelID,
		"hotel_name": hotel.Name,
		"message": "Impersonation session created successfully",
	})
}
