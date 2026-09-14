package services

import (
	"errors"
	"fmt"
	"hms/config"
	"hms/models"
	"hms/utils"
	"strings"
	"time"

	"gorm.io/gorm"
)

// GetAllAdmins returns all admins with their hotel count
func GetAllAdmins(page, pageSize int) ([]map[string]interface{}, int64, error) {
	var admins []models.Admin
	var total int64

	if err := config.DB.Model(&models.Admin{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := config.DB.Offset(offset).Limit(pageSize).Find(&admins).Error; err != nil {
		return nil, 0, err
	}

	// Count total hotels (for admins where admin_id is not yet assigned, show total hotels)
	var totalHotels int64
	config.DB.Model(&models.Hotel{}).Count(&totalHotels)

	var result []map[string]interface{}
	for _, admin := range admins {
		var hotelCount int64
		config.DB.Model(&models.Hotel{}).Where("admin_id = ?", admin.ID).Count(&hotelCount)

		// If no hotels assigned yet and this is the only admin, show total hotels
		if hotelCount == 0 && total == 1 {
			hotelCount = totalHotels
		}

		// Handle bigint created_at (epoch milliseconds or seconds)
		createdAtMs := admin.CreatedAt
		createdAtSec := createdAtMs / 1000
		if createdAtMs < 1000000000000 {
			// already in seconds
			createdAtSec = createdAtMs
		}

		result = append(result, map[string]interface{}{
			"id":             admin.ID,
			"username":       admin.Username,
			"name":           admin.Name,
			"email":          admin.Email,
			"phone":          admin.Phone,
			"is_super_admin": admin.IsSuperAdmin,
			"status":         admin.Status,
			"hotel_count":    hotelCount,
			"created_at_ts":  createdAtSec,
		})
	}

	return result, total, nil
}

// GetAllHotels returns all hotels with subscription info
func GetAllHotels(page, pageSize int) ([]map[string]interface{}, int64, error) {
	var hotels []models.Hotel
	var total int64

	if err := config.DB.Model(&models.Hotel{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := config.DB.Offset(offset).Limit(pageSize).Find(&hotels).Error; err != nil {
		return nil, 0, err
	}

	var result []map[string]interface{}
	for _, hotel := range hotels {
		var admin models.Admin
		if hotel.AdminID != nil {
			config.DB.First(&admin, *hotel.AdminID)
		}

		var bookingCount int64
		config.DB.Model(&models.Booking{}).Where("hotel_id = ? AND DATE(check_in_date) = CURRENT_DATE", hotel.ID).Count(&bookingCount)

		result = append(result, map[string]interface{}{
			"id":                    hotel.ID,
			"name":                  hotel.Name,
			"city":                  hotel.City,
			"state":                 hotel.State,
			"admin_id":              hotel.AdminID,
			"admin_name":            admin.Name,
			"admin_username":        admin.Username,
			"admin_email":           admin.Email,
			"subscription_tier":     hotel.SubscriptionTier,
			"subscription_status":   hotel.SubscriptionStatus,
			"booking_limit_per_day": hotel.BookingLimitPerDay,
			"bookings_today":        bookingCount,
			"limit_reached":         bookingCount >= int64(hotel.BookingLimitPerDay) && hotel.SubscriptionTier == "free",
			"status":                hotel.Status,
			"created_at":            hotel.CreatedAt,
			"subscription_end_date": hotel.SubscriptionEndDate,
			"last_payment_date":     hotel.LastPaymentDate,
			// Payment config — key ID / merchant ID is safe to expose; secret is never returned
			"payment_gateway":     hotel.PaymentGateway,
			"razorpay_key_id":     hotel.RazorpayKeyID,
			"razorpay_configured": hotel.RazorpayKeyID != "" && hotel.RazorpayKeySecret != "",
			"phonepe_merchant_id": hotel.PhonePeMerchantID,
			"phonepe_salt_index":  hotel.PhonePeSaltIndex,
			"phonepe_env":         hotel.PhonePeEnv,
			"phonepe_configured":  hotel.PhonePeMerchantID != "" && hotel.PhonePeSaltKey != "",
		})
	}

	return result, total, nil
}

// UpdateSubscription assigns a plan to a hotel and manages its expiry
func UpdateSubscription(hotelID uint, tier string, superAdminID uint, reason string, durationMonths int, amount float64, customStartDate *time.Time, customEndDate *time.Time) error {
	var hotel models.Hotel
	if err := config.DB.First(&hotel, hotelID).Error; err != nil {
		return errors.New("hotel not found")
	}

	oldTier := hotel.SubscriptionTier

	var plan models.PlanSetting
	if err := config.DB.Where("tier_name = ?", tier).First(&plan).Error; err != nil {
		return errors.New("invalid plan tier or plan not configured")
	}

	updates := map[string]interface{}{
		"subscription_tier":        tier,
		"booking_limit_per_day":    plan.BookingLimitPerDay,
		"feature_online_payment":   plan.FeatureOnlinePayment,
		"feature_reports":          plan.FeatureReports,
		"feature_staff_payroll":    plan.FeatureStaffPayroll,
		"feature_housekeeping":     plan.FeatureHousekeeping,
		"feature_email_notify":     plan.FeatureEmailNotify,
		"feature_seasonal_pricing": plan.FeatureSeasonalPricing,
		"feature_channel_manager":  plan.FeatureChannelManager,
		"subscription_status":      "active",
	}

	if customStartDate != nil {
		updates["last_payment_date"] = customStartDate
	}
	
	if customEndDate != nil {
		updates["subscription_end_date"] = customEndDate
	} else if durationMonths > 0 {
		newEndDate := time.Now().AddDate(0, durationMonths, 0)
		updates["subscription_end_date"] = &newEndDate
	} else if durationMonths == -1 {
		// Example: -1 means Lifetime (set to nil)
		updates["subscription_end_date"] = nil
	}

	// Update hotel with plan settings
	if err := config.DB.Model(&hotel).Updates(updates).Error; err != nil {
		return err
	}

	var logStartDate, logEndDate *time.Time
	if customStartDate != nil {
		logStartDate = customStartDate
	} else if hotel.LastPaymentDate != nil {
		logStartDate = hotel.LastPaymentDate
	}
	
	if customEndDate != nil {
		logEndDate = customEndDate
	} else if durationMonths > 0 {
		newEnd := time.Now().AddDate(0, durationMonths, 0)
		logEndDate = &newEnd
	}

	// Log the change
	log := models.SubscriptionLog{
		HotelID:        hotelID,
		AdminID:        superAdminID,
		Action:         "upgraded",
		OldTier:        oldTier,
		NewTier:        tier,
		Reason:         reason,
		DurationMonths: durationMonths,
		Amount:         amount,
		StartDate:      logStartDate,
		EndDate:        logEndDate,
	}
	if oldTier == tier {
		log.Action = "updated"
	} else if oldTier == "premium" {
		log.Action = "downgraded"
	}

	return config.DB.Create(&log).Error
}

// SuspendHotel suspends a hotel subscription
func SuspendHotel(hotelID uint, superAdminID uint, reason string) error {
	var hotel models.Hotel
	if err := config.DB.First(&hotel, hotelID).Error; err != nil {
		return errors.New("hotel not found")
	}

	if err := config.DB.Model(&hotel).Update("subscription_status", "suspended").Error; err != nil {
		return err
	}

	log := models.SubscriptionLog{
		HotelID: hotelID,
		AdminID: superAdminID,
		Action:  "suspended",
		Reason:  reason,
	}
	return config.DB.Create(&log).Error
}

// ActivateHotel activates a suspended hotel
func ActivateHotel(hotelID uint, superAdminID uint, reason string) error {
	var hotel models.Hotel
	if err := config.DB.First(&hotel, hotelID).Error; err != nil {
		return errors.New("hotel not found")
	}

	if err := config.DB.Model(&hotel).Update("subscription_status", "active").Error; err != nil {
		return err
	}

	log := models.SubscriptionLog{
		HotelID: hotelID,
		AdminID: superAdminID,
		Action:  "activated",
		Reason:  reason,
	}
	return config.DB.Create(&log).Error
}

// SuspendAdmin suspends an admin account
func SuspendAdmin(adminID uint, superAdminID uint, reason string) error {
	var admin models.Admin
	if err := config.DB.First(&admin, adminID).Error; err != nil {
		return errors.New("admin not found")
	}

	if admin.IsSuperAdmin {
		return errors.New("cannot suspend super admin")
	}

	return config.DB.Model(&admin).Update("status", "suspended").Error
}

// ActivateAdmin activates a suspended admin
func ActivateAdmin(adminID uint) error {
	var admin models.Admin
	if err := config.DB.First(&admin, adminID).Error; err != nil {
		return errors.New("admin not found")
	}

	return config.DB.Model(&admin).Update("status", "active").Error
}

// GetDashboardStats returns super admin dashboard statistics
func GetDashboardStats() (map[string]interface{}, error) {
	var totalAdmins, totalHotels, activeHotels, suspendedHotels int64
	var totalBookingsToday int64
	var totalRevenue float64

	config.DB.Model(&models.Admin{}).Where("is_super_admin = ?", false).Count(&totalAdmins)
	config.DB.Model(&models.Hotel{}).Count(&totalHotels)
	config.DB.Model(&models.Hotel{}).Where("subscription_status = ?", "active").Count(&activeHotels)
	config.DB.Model(&models.Hotel{}).Where("subscription_status = ?", "suspended").Count(&suspendedHotels)
	config.DB.Model(&models.Booking{}).Where("DATE(check_in_date) = CURRENT_DATE").Count(&totalBookingsToday)

	// Calculate revenue from payments (paid today)
	row := config.DB.Raw(`SELECT COALESCE(SUM(amount), 0) FROM payments WHERE DATE(created_at) = CURRENT_DATE AND deleted_at IS NULL`).Row()
	row.Scan(&totalRevenue)

	var premiumCount, freeCount int64
	config.DB.Model(&models.Hotel{}).Where("subscription_tier = ?", "premium").Count(&premiumCount)
	config.DB.Model(&models.Hotel{}).Where("subscription_tier = ?", "free").Count(&freeCount)

	return map[string]interface{}{
		"total_admins":         totalAdmins,
		"total_hotels":         totalHotels,
		"active_hotels":        activeHotels,
		"suspended_hotels":     suspendedHotels,
		"premium_hotels":       premiumCount,
		"free_hotels":          freeCount,
		"total_bookings_today": totalBookingsToday,
		"total_revenue_today":  totalRevenue,
	}, nil
}

// GetSubscriptionLogs returns subscription change logs
func GetSubscriptionLogs(hotelID uint, page, pageSize int) ([]models.SubscriptionLog, int64, error) {
	var logs []models.SubscriptionLog
	var total int64

	query := config.DB.Model(&models.SubscriptionLog{})
	if hotelID > 0 {
		query = query.Where("hotel_id = ?", hotelID)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&logs).Error; err != nil {
		return nil, 0, err
	}

	return logs, total, nil
}

// UpdateSubscriptionLogPaymentStatus updates the payment status of a subscription log entry
func UpdateSubscriptionLogPaymentStatus(logID uint, status string) error {
	if status != "paid" && status != "unpaid" && status != "failed" {
		return errors.New("invalid payment status")
	}
	if err := config.DB.Model(&models.SubscriptionLog{}).Where("id = ?", logID).Update("payment_status", status).Error; err != nil {
		return err
	}
	return nil
}

// CreateAdminAccount creates a new admin account
func CreateAdminAccount(username, email, name, phone, passwordHash string) (*models.Admin, error) {
	// Check for duplicate username
	var existing models.Admin
	if err := config.DB.Unscoped().Where("username = ?", username).First(&existing).Error; err == nil {
		return nil, errors.New("username already exists")
	}
	// Check for duplicate email
	if email != "" {
		if err := config.DB.Unscoped().Where("email = ?", email).First(&existing).Error; err == nil {
			return nil, errors.New("email already exists")
		}
	}

	admin := models.Admin{
		Username:     username,
		Email:        email,
		Name:         name,
		Phone:        phone,
		PasswordHash: passwordHash,
		Status:       "active",
	}

	if err := config.DB.Create(&admin).Error; err != nil {
		return nil, err
	}

	return &admin, nil
}

// CreateHotelForAdmin creates a new hotel for an admin
func CreateHotelForAdmin(adminID uint, hotelName, city, state string) (*models.Hotel, error) {
	hotel := models.Hotel{
		AdminID:            &adminID,
		Name:               hotelName,
		City:               city,
		State:              state,
		SubscriptionTier:   "free",
		BookingLimitPerDay: 5,
		SubscriptionStatus: "active",
		Status:             "active",
	}

	if err := config.DB.Create(&hotel).Error; err != nil {
		return nil, err
	}

	return &hotel, nil
}

// GetHotelUsage returns booking usage for a hotel
func GetHotelUsage(hotelID uint) (map[string]interface{}, error) {
	var hotel models.Hotel
	if err := config.DB.First(&hotel, hotelID).Error; err != nil {
		return nil, err
	}

	var bookingsToday int64
	config.DB.Model(&models.Booking{}).
		Where("hotel_id = ? AND DATE(check_in_date) = CURRENT_DATE", hotelID).
		Count(&bookingsToday)

	var bookingsThisMonth int64
	config.DB.Model(&models.Booking{}).
		Where("hotel_id = ? AND EXTRACT(MONTH FROM check_in_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM check_in_date) = EXTRACT(YEAR FROM CURRENT_DATE)", hotelID).
		Count(&bookingsThisMonth)

	usagePercent := 0.0
	if hotel.BookingLimitPerDay > 0 {
		usagePercent = (float64(bookingsToday) / float64(hotel.BookingLimitPerDay)) * 100
	}

	return map[string]interface{}{
		"hotel_id":              hotel.ID,
		"hotel_name":            hotel.Name,
		"subscription_tier":     hotel.SubscriptionTier,
		"booking_limit_per_day": hotel.BookingLimitPerDay,
		"bookings_today":        bookingsToday,
		"bookings_this_month":   bookingsThisMonth,
		"usage_percent":         usagePercent,
		"limit_reached":         bookingsToday >= int64(hotel.BookingLimitPerDay) && hotel.SubscriptionTier == "free",
	}, nil
}

// CheckBookingLimit checks if hotel can create a booking
func CheckBookingLimit(hotelID uint) (bool, error) {
	var hotel models.Hotel
	if err := config.DB.First(&hotel, hotelID).Error; err != nil {
		return false, err
	}

	// Premium tier has no limit
	if hotel.SubscriptionTier == "premium" {
		return true, nil
	}

	// Check daily limit for free tier
	var bookingsToday int64
	config.DB.Model(&models.Booking{}).
		Where("hotel_id = ? AND DATE(check_in_date) = CURRENT_DATE", hotelID).
		Count(&bookingsToday)

	return bookingsToday < int64(hotel.BookingLimitPerDay), nil
}

// GetAdminHotels returns all hotels for an admin
func GetAdminHotels(adminID uint) ([]models.Hotel, error) {
	var hotels []models.Hotel
	if err := config.DB.Where("admin_id = ?", adminID).Find(&hotels).Error; err != nil {
		return nil, err
	}
	return hotels, nil
}

// UpdateHotelFeatures updates feature flags for a hotel
func UpdateHotelFeatures(hotelID uint, flags map[string]interface{}) error {
	var hotel models.Hotel
	if err := config.DB.First(&hotel, hotelID).Error; err != nil {
		return errors.New("hotel not found")
	}

	updates := map[string]interface{}{}
	for key, val := range flags {
		if val != nil {
			updates[key] = val
		}
	}

	if len(updates) == 0 {
		return nil
	}

	return config.DB.Model(&hotel).Updates(updates).Error
}

// GetHotelFeatures returns feature flags and payment config status for a hotel
func GetHotelFeatures(hotelID uint) (map[string]interface{}, error) {
	var hotel models.Hotel
	if err := config.DB.First(&hotel, hotelID).Error; err != nil {
		return nil, errors.New("hotel not found")
	}

	gateway := hotel.PaymentGateway
	if gateway == "" {
		gateway = "razorpay"
	}

	return map[string]interface{}{
		"hotel_id":                 hotel.ID,
		"hotel_name":               hotel.Name,
		"subscription_tier":        hotel.SubscriptionTier,
		"feature_online_payment":   hotel.FeatureOnlinePayment,
		"feature_reports":          hotel.FeatureReports,
		"feature_staff_payroll":    hotel.FeatureStaffPayroll,
		"feature_housekeeping":     hotel.FeatureHousekeeping,
		"feature_email_notify":     hotel.FeatureEmailNotify,
		"feature_seasonal_pricing": hotel.FeatureSeasonalPricing,
		// Payment Gateway Settings
		"payment_gateway":     gateway,
		"razorpay_key_id":     hotel.RazorpayKeyID, // key ID is safe to expose
		"razorpay_key_secret": hotel.RazorpayKeySecret,
		"razorpay_configured": hotel.RazorpayKeyID != "" && hotel.RazorpayKeySecret != "",
		"phonepe_merchant_id": hotel.PhonePeMerchantID,
		"phonepe_salt_key":    hotel.PhonePeSaltKey,
		"phonepe_salt_index":  hotel.PhonePeSaltIndex,
		"phonepe_env":         hotel.PhonePeEnv,
		"phonepe_configured":  hotel.PhonePeMerchantID != "" && hotel.PhonePeSaltKey != "",
	}, nil
}

// PaymentConfigInput holds gateway credentials updates
type PaymentConfigInput struct {
	PaymentGateway    string `json:"payment_gateway"`
	RazorpayKeyID     string `json:"razorpay_key_id"`
	RazorpayKeySecret string `json:"razorpay_key_secret"`
	PhonePeMerchantID string `json:"phonepe_merchant_id"`
	PhonePeSaltKey    string `json:"phonepe_salt_key"`
	PhonePeSaltIndex  string `json:"phonepe_salt_index"`
	PhonePeEnv        string `json:"phonepe_env"`
}

// UpdateHotelPaymentConfig sets per-hotel gateway credentials (super admin only)
// If secrets are blank, existing secrets are preserved.
func UpdateHotelPaymentConfig(hotelID uint, input PaymentConfigInput) error {
	var hotel models.Hotel
	if err := config.DB.First(&hotel, hotelID).Error; err != nil {
		return errors.New("hotel not found")
	}

	if strings.TrimSpace(input.PaymentGateway) != "" {
		hotel.PaymentGateway = strings.TrimSpace(input.PaymentGateway)
	}

	hotel.RazorpayKeyID = strings.TrimSpace(input.RazorpayKeyID)
	if trimmed := strings.TrimSpace(input.RazorpayKeySecret); trimmed != "" {
		hotel.RazorpayKeySecret = trimmed
	}

	hotel.PhonePeMerchantID = strings.TrimSpace(input.PhonePeMerchantID)
	if trimmed := strings.TrimSpace(input.PhonePeSaltKey); trimmed != "" {
		hotel.PhonePeSaltKey = trimmed
	}
	hotel.PhonePeSaltIndex = strings.TrimSpace(input.PhonePeSaltIndex)
	hotel.PhonePeEnv = strings.TrimSpace(input.PhonePeEnv)

	err := config.DB.Save(&hotel).Error
	if err == nil {
		utils.CacheDel(fmt.Sprintf("hotels:detail:%d", hotelID))
		if hotel.PublicToken != "" {
			utils.CacheDel(fmt.Sprintf("hotels:detail:%s", hotel.PublicToken))
		}
	}
	return err
}

// GetAllPlans gets all subscription plan configurations
func GetAllPlans() ([]models.PlanSetting, error) {
	var plans []models.PlanSetting
	if err := config.DB.Order("price ASC").Find(&plans).Error; err != nil {
		return nil, err
	}
	return plans, nil
}

// UpdatePlan updates a plan configuration and applies changes to all hotels on that tier
func UpdatePlan(tierName string, updates map[string]interface{}) error {
	var plan models.PlanSetting
	if err := config.DB.Where("tier_name = ?", tierName).First(&plan).Error; err != nil {
		return errors.New("plan not found")
	}

	// Filter allowed fields for update
	allowedUpdates := map[string]interface{}{}
	if val, ok := updates["price"]; ok {
		allowedUpdates["price"] = val
	}
	if val, ok := updates["booking_limit_per_day"]; ok {
		allowedUpdates["booking_limit_per_day"] = val
	}

	// Feature flags
	features := []string{
		"feature_online_payment", "feature_reports", "feature_staff_payroll",
		"feature_housekeeping", "feature_email_notify", "feature_seasonal_pricing", "feature_channel_manager",
	}
	for _, f := range features {
		if val, ok := updates[f]; ok {
			allowedUpdates[f] = val
		}
	}

	if len(allowedUpdates) == 0 {
		return nil
	}

	// Run in transaction to ensure consistency
	return config.DB.Transaction(func(tx *gorm.DB) error {
		// Update PlanSetting
		if err := tx.Model(&plan).Updates(allowedUpdates).Error; err != nil {
			return err
		}

		// Update all hotels currently on this tier to match the new features/limits
		hotelUpdates := map[string]interface{}{}
		for k, v := range allowedUpdates {
			if k != "price" { // price doesn't go on hotel directly
				hotelUpdates[k] = v
			}
		}

		if len(hotelUpdates) > 0 {
			if err := tx.Model(&models.Hotel{}).Where("subscription_tier = ?", tierName).Updates(hotelUpdates).Error; err != nil {
				return err
			}
		}

		return nil
	})
}
