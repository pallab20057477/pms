package controllers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type updateProfileRequest struct {
	Name         string `json:"name"`
	Email        string `json:"email"`
	Phone        string `json:"phone"`
	ProfilePhoto string `json:"profile_photo"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=6"`
}

type updateSystemSettingsRequest struct {
	IncludedGuests           int     `json:"included_guests"`
	ExtraGuestPerNight       float64 `json:"extra_guest_charge_per_night"`
	CheckoutTime             string  `json:"checkout_time"`
	CheckinTime              string  `json:"checkin_time"`
	LateCheckoutGraceMinutes int     `json:"late_checkout_grace_minutes"`
	LateCheckoutHourlyCharge float64 `json:"late_checkout_hourly_charge"`
	AllowLateCheckout        *bool   `json:"allow_late_checkout"`
	DefaultOfferEnabled      *bool   `json:"default_offer_enabled"`
	DefaultOfferName         string  `json:"default_offer_name"`
	DefaultOfferPercent      float64 `json:"default_offer_percent"`
	InvoicePrefix            string  `json:"invoice_prefix"`
	CompanyName              string  `json:"company_name"`
	Currency                 string  `json:"currency"`
	DateFormat               string  `json:"date_format"`
	TimeZone                 string  `json:"time_zone"`
}

type updateOfferSettingsRequest struct {
	DefaultOfferEnabled *bool   `json:"default_offer_enabled"`
	DefaultOfferName    string  `json:"default_offer_name"`
	DefaultOfferPercent float64 `json:"default_offer_percent"`
}

type roomPricingAdjustRequest struct {
	Adjustments []struct {
		RoomType   string  `json:"room_type"`
		Percentage float64 `json:"percentage"`
	} `json:"adjustments"`
	ValidFrom string `json:"valid_from" binding:"required,datetime=2006-01-02"`
	ValidTo   string `json:"valid_to" binding:"required,datetime=2006-01-02"`
	Occasion  string `json:"occasion"`
	Reason    string `json:"reason"`
}

type roomBasePricingSetRequest struct {
	Items []struct {
		RoomType  string  `json:"room_type"`
		BasePrice float64 `json:"base_price"`
	} `json:"items" binding:"required"`
	Occasion string `json:"occasion"`
	Reason   string `json:"reason"`
}

type updateRoomOccupancyPricingRequest struct {
	Items []struct {
		RoomType                   string   `json:"room_type" binding:"required"`
		OverrideEnabled            bool     `json:"override_enabled"`
		IncludedGuestsOverride     *int     `json:"included_guests_override"`
		ExtraGuestPerNightOverride *float64 `json:"extra_guest_charge_per_night_override"`
	} `json:"items" binding:"required"`
}

func getOrCreateSystemSetting(hotelID uint) (models.SystemSetting, error) {
	var setting models.SystemSetting
	// Never create settings for hotel_id = 0 (new admin with no hotel)
	if hotelID == 0 {
		return setting, gorm.ErrRecordNotFound
	}
	
	cacheKey := fmt.Sprintf("system_setting:%d", hotelID)
	if config.CacheGet(context.Background(), cacheKey, &setting) {
		return setting, nil
	}

	if err := config.DB.Where("hotel_id = ?", hotelID).Take(&setting).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			setting = models.SystemSetting{
				HotelID:                  hotelID,
				IncludedGuests:           1,
				ExtraGuestPerNight:       500,
				CheckoutTime:             "11:00",
				CheckinTime:              "14:00",
				LateCheckoutGraceMinutes: 30,
				LateCheckoutHourlyCharge: 0,
				AllowLateCheckout:        true,
				DefaultOfferEnabled:      false,
				DefaultOfferName:         "Special Offer",
				DefaultOfferPercent:      0,
				InvoicePrefix:            "INV",
				Currency:                 "INR",
				DateFormat:               "DD-MM-YYYY",
				TimeZone:                 "Asia/Kolkata",
			}
			if createErr := config.DB.Create(&setting).Error; createErr != nil {
				return setting, createErr
			}
			config.CacheSet(context.Background(), cacheKey, setting, time.Hour)
			return setting, nil
		}
		return setting, err
	}
	config.CacheSet(context.Background(), cacheKey, setting, time.Hour)
	return setting, nil
}

func GetMyProfile(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	var admin models.Admin
	if err := config.DB.
		Select("id", "username", "name", "email", "phone", "profile_photo", "last_active_hotel_id", "created_at").
		Where("id = ?", adminID).
		Take(&admin).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Admin not found"})
		return
	}
	c.JSON(http.StatusOK, admin)
}

func UpdateMyProfile(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var admin models.Admin
	if err := config.DB.First(&admin, adminID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Admin not found"})
		return
	}

	if strings.TrimSpace(req.Name) != "" {
		admin.Name = strings.TrimSpace(req.Name)
	}
	if strings.TrimSpace(req.Email) != "" {
		admin.Email = strings.TrimSpace(req.Email)
	}
	if strings.TrimSpace(req.Phone) != "" {
		admin.Phone = strings.TrimSpace(req.Phone)
	}
	if strings.TrimSpace(req.ProfilePhoto) != "" {
		admin.ProfilePhoto = strings.TrimSpace(req.ProfilePhoto)
	}

	if err := config.DB.Save(&admin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	hotelID := c.GetUint("active_hotel_id")
	utils.LogActivityWithContext(hotelID, "Settings", adminID, "Updated", "Profile", "Admin profile updated")

	admin.PasswordHash = ""
	c.JSON(http.StatusOK, admin)
}

func ChangeMyPassword(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var admin models.Admin
	if err := config.DB.First(&admin, adminID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Admin not found"})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(req.CurrentPassword)) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Current password is incorrect"})
		return
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}
	admin.PasswordHash = string(hashed)
	if err := config.DB.Save(&admin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	hotelID := c.GetUint("active_hotel_id")
	utils.LogActivityWithContext(hotelID, "Settings", adminID, "Updated", "Password", "Admin password changed")
	c.JSON(http.StatusOK, gin.H{"message": "Password updated"})
}

func GetSystemSettings(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	if hotelID == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No hotel selected"})
		return
	}
	
	cacheKey := fmt.Sprintf("system_settings:%d", hotelID)
	var setting models.SystemSetting
	if utils.GetCache(c, cacheKey, &setting) {
		c.JSON(http.StatusOK, setting)
		return
	}

	setting, err := getOrCreateSystemSetting(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch system settings"})
		return
	}
	
	utils.SetCache(c, cacheKey, setting, time.Hour)
	c.JSON(http.StatusOK, setting)
}

func UpdateSystemSettings(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req updateSystemSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	setting, err := getOrCreateSystemSetting(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load system settings"})
		return
	}

	if req.IncludedGuests < 1 || req.IncludedGuests > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "included_guests must be between 1 and 10"})
		return
	}
	if req.ExtraGuestPerNight < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "extra_guest_charge_per_night must be >= 0"})
		return
	}
	if strings.TrimSpace(req.CheckoutTime) != "" {
		if _, parseErr := time.Parse("15:04", strings.TrimSpace(req.CheckoutTime)); parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "checkout_time must be in HH:MM (24-hour) format"})
			return
		}
		setting.CheckoutTime = strings.TrimSpace(req.CheckoutTime)
	}
	if strings.TrimSpace(req.CheckinTime) != "" {
		if _, parseErr := time.Parse("15:04", strings.TrimSpace(req.CheckinTime)); parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "checkin_time must be in HH:MM (24-hour) format"})
			return
		}
		setting.CheckinTime = strings.TrimSpace(req.CheckinTime)
	}
	if req.LateCheckoutGraceMinutes < 0 || req.LateCheckoutGraceMinutes > 720 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "late_checkout_grace_minutes must be between 0 and 720"})
		return
	}
	if req.LateCheckoutHourlyCharge < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "late_checkout_hourly_charge must be >= 0"})
		return
	}
	setting.LateCheckoutGraceMinutes = req.LateCheckoutGraceMinutes
	setting.LateCheckoutHourlyCharge = req.LateCheckoutHourlyCharge
	if req.AllowLateCheckout != nil {
		setting.AllowLateCheckout = *req.AllowLateCheckout
	}
	setting.IncludedGuests = req.IncludedGuests
	setting.ExtraGuestPerNight = req.ExtraGuestPerNight
	if req.DefaultOfferPercent < 0 || req.DefaultOfferPercent > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "default_offer_percent must be between 0 and 100"})
		return
	}
	if req.DefaultOfferEnabled != nil {
		setting.DefaultOfferEnabled = *req.DefaultOfferEnabled
	}
	setting.DefaultOfferPercent = req.DefaultOfferPercent
	if strings.TrimSpace(req.DefaultOfferName) != "" {
		setting.DefaultOfferName = strings.TrimSpace(req.DefaultOfferName)
	}
	if strings.TrimSpace(req.InvoicePrefix) != "" {
		setting.InvoicePrefix = strings.ToUpper(strings.TrimSpace(req.InvoicePrefix))
	}
	if strings.TrimSpace(req.CompanyName) != "" {
		setting.CompanyName = strings.TrimSpace(req.CompanyName)
	}
	if strings.TrimSpace(req.Currency) != "" {
		setting.Currency = strings.ToUpper(strings.TrimSpace(req.Currency))
	}
	if strings.TrimSpace(req.DateFormat) != "" {
		setting.DateFormat = strings.TrimSpace(req.DateFormat)
	}
	if strings.TrimSpace(req.TimeZone) != "" {
		setting.TimeZone = strings.TrimSpace(req.TimeZone)
	}

	if setting.ID == 0 {
		if err := config.DB.Create(&setting).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save system settings"})
			return
		}
	} else {
		if err := config.DB.Save(&setting).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update system settings"})
			return
		}
	}

	utils.InvalidateCache(c, fmt.Sprintf("system_settings:%d", hotelID))
	utils.LogActivityWithContext(hotelID, "Settings", adminID, "Updated", "System Settings", "Updated system settings")
	c.JSON(http.StatusOK, setting)
}

func GetOfferSettings(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	setting, err := getOrCreateSystemSetting(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch offer settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"default_offer_enabled": setting.DefaultOfferEnabled,
		"default_offer_name":    setting.DefaultOfferName,
		"default_offer_percent": setting.DefaultOfferPercent,
	})
}

func UpdateOfferSettings(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req updateOfferSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.DefaultOfferPercent < 0 || req.DefaultOfferPercent > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "default_offer_percent must be between 0 and 100"})
		return
	}

	setting, err := getOrCreateSystemSetting(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load offer settings"})
		return
	}

	if req.DefaultOfferEnabled != nil {
		setting.DefaultOfferEnabled = *req.DefaultOfferEnabled
	}
	setting.DefaultOfferPercent = req.DefaultOfferPercent
	if strings.TrimSpace(req.DefaultOfferName) != "" {
		setting.DefaultOfferName = strings.TrimSpace(req.DefaultOfferName)
	}

	if err := config.DB.Save(&setting).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save offer settings"})
		return
	}

	utils.LogActivityWithContext(hotelID, "Settings", adminID, "Updated", "Offer", "Offer settings updated")
	c.JSON(http.StatusOK, gin.H{
		"default_offer_enabled": setting.DefaultOfferEnabled,
		"default_offer_name":    setting.DefaultOfferName,
		"default_offer_percent": setting.DefaultOfferPercent,
	})
}

func GetRoomPricingOverview(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")

	rulesByType := map[string]models.SeasonalPricingRule{}
	var activeRules []models.SeasonalPricingRule
	_ = config.DB.
		Where("hotel_id = ? AND active = ? AND valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE", hotelID, true).
		Order("valid_from desc, id desc").
		Find(&activeRules).Error
	for _, rule := range activeRules {
		key := strings.ToLower(strings.TrimSpace(rule.RoomType))
		if key == "" {
			continue
		}
		if _, exists := rulesByType[key]; exists {
			continue
		}
		rulesByType[key] = rule
	}

	var stats []struct {
		RoomType                 string  `json:"room_type"`
		Count                    int64   `json:"count"`
		MinPrice                 float64 `json:"min_price"`
		MaxPrice                 float64 `json:"max_price"`
		AvgPrice                 float64 `json:"avg_price"`
		CurrentAdjustmentPercent float64 `json:"current_adjustment_percent"`
		CurrentValidFrom         string  `json:"current_valid_from"`
		CurrentValidTo           string  `json:"current_valid_to"`
	}

	err := config.DB.Table("room_types rt").
		Select("rt.name as room_type, COUNT(r.id) as count, COALESCE(MIN(rt.base_price), 0) as min_price, COALESCE(MAX(rt.base_price), 0) as max_price, COALESCE(AVG(rt.base_price), 0) as avg_price").
		Joins("LEFT JOIN rooms r ON r.room_type_id = rt.id AND r.deleted_at IS NULL").
		Where("rt.hotel_id = ? AND rt.deleted_at IS NULL", hotelID).
		Group("rt.name").
		Order("rt.name asc").
		Scan(&stats).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load room pricing overview"})
		return
	}

	for i := range stats {
		key := strings.ToLower(strings.TrimSpace(stats[i].RoomType))
		if rule, ok := rulesByType[key]; ok {
			stats[i].CurrentAdjustmentPercent = rule.AdjustmentPercent
			stats[i].CurrentValidFrom = rule.ValidFrom.Format("2006-01-02")
			stats[i].CurrentValidTo = rule.ValidTo.Format("2006-01-02")
		}
	}

	c.JSON(http.StatusOK, gin.H{"items": stats})
}

func AdjustRoomPricing(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req roomPricingAdjustRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Adjustments) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one room-type adjustment is required"})
		return
	}
	validFrom, err := time.Parse("2006-01-02", strings.TrimSpace(req.ValidFrom))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "valid_from must be yyyy-mm-dd"})
		return
	}
	validTo, err := time.Parse("2006-01-02", strings.TrimSpace(req.ValidTo))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "valid_to must be yyyy-mm-dd"})
		return
	}
	if validTo.Before(validFrom) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "valid_to must be on or after valid_from"})
		return
	}

	type adjustedTypeResult struct {
		RoomType     string  `json:"room_type"`
		Percentage   float64 `json:"percentage"`
		UpdatedRooms int64   `json:"updated_rooms"`
		ValidFrom    string  `json:"valid_from"`
		ValidTo      string  `json:"valid_to"`
	}
	results := make([]adjustedTypeResult, 0, len(req.Adjustments))
	totalUpdated := int64(0)

	err = config.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range req.Adjustments {
			roomType := strings.TrimSpace(item.RoomType)
			normalizedRoomType := strings.ToLower(roomType)
			if roomType == "" {
				return gorm.ErrInvalidData
			}
			if item.Percentage < -100 || item.Percentage > 100 {
				return gorm.ErrInvalidData
			}

			var roomCount int64
			if err := tx.Table("rooms").
				Joins("JOIN room_types rt ON rt.id = rooms.room_type_id").
				Where("rooms.hotel_id = ? AND rooms.deleted_at IS NULL AND LOWER(rt.name) = ?", hotelID, normalizedRoomType).
				Count(&roomCount).Error; err != nil {
				return err
			}

			if roomCount == 0 {
				results = append(results, adjustedTypeResult{RoomType: roomType, Percentage: item.Percentage, UpdatedRooms: 0, ValidFrom: validFrom.Format("2006-01-02"), ValidTo: validTo.Format("2006-01-02")})
				continue
			}

			if item.Percentage == 0 {
				if err := tx.Model(&models.SeasonalPricingRule{}).
					Where("hotel_id = ? AND LOWER(BTRIM(room_type)) = ?", hotelID, normalizedRoomType).
					Updates(map[string]interface{}{"active": false}).Error; err != nil {
					return err
				}
				results = append(results, adjustedTypeResult{RoomType: roomType, Percentage: item.Percentage, UpdatedRooms: roomCount, ValidFrom: validFrom.Format("2006-01-02"), ValidTo: validTo.Format("2006-01-02")})
				totalUpdated += roomCount
				continue
			}

			if err := tx.Model(&models.SeasonalPricingRule{}).
				Where("hotel_id = ? AND LOWER(BTRIM(room_type)) = ?", hotelID, normalizedRoomType).
				Updates(map[string]interface{}{"active": false}).Error; err != nil {
				return err
			}

			rule := models.SeasonalPricingRule{
				HotelID:           hotelID,
				RoomType:          roomType,
				AdjustmentPercent: item.Percentage,
				ValidFrom:         validFrom,
				ValidTo:           validTo,
				Active:            true,
			}
			if err := tx.Create(&rule).Error; err != nil {
				return err
			}

			totalUpdated += roomCount
			results = append(results, adjustedTypeResult{RoomType: roomType, Percentage: item.Percentage, UpdatedRooms: roomCount, ValidFrom: validFrom.Format("2006-01-02"), ValidTo: validTo.Format("2006-01-02")})
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid room_type or percentage in adjustments"})
		return
	}

	occasion := strings.TrimSpace(req.Occasion)
	reason := strings.TrimSpace(req.Reason)
	message := "Room pricing updated"
	if occasion != "" {
		message += " | occasion: " + occasion
	}
	if reason != "" {
		message += " | reason: " + reason
	}
	message += " | room types updated"
	utils.LogActivityWithContext(hotelID, "Settings", adminID, "Updated", "Room Pricing", message)

	c.JSON(http.StatusOK, gin.H{
		"updated_rooms": totalUpdated,
		"adjustments":   results,
		"valid_from":    validFrom.Format("2006-01-02"),
		"valid_to":      validTo.Format("2006-01-02"),
		"occasion":      occasion,
		"reason":        reason,
	})
}

func SetRoomTypeBasePricing(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req roomBasePricingSetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one room-type base price item is required"})
		return
	}

	type updatedType struct {
		RoomType     string  `json:"room_type"`
		BasePrice    float64 `json:"base_price"`
		UpdatedRooms int64   `json:"updated_rooms"`
	}
	results := make([]updatedType, 0, len(req.Items))
	totalUpdated := int64(0)

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range req.Items {
			roomType := strings.TrimSpace(item.RoomType)
			normalizedRoomType := strings.ToLower(roomType)
			if roomType == "" || item.BasePrice < 0 {
				return gorm.ErrInvalidData
			}

			var roomCount int64
			if err := tx.Model(&models.Room{}).
				Where("hotel_id = ? AND deleted_at IS NULL AND LOWER(COALESCE(NULLIF(BTRIM(room_type), ''), 'Unspecified')) = ?", hotelID, normalizedRoomType).
				Count(&roomCount).Error; err != nil {
				return err
			}

			if roomCount == 0 {
				results = append(results, updatedType{RoomType: roomType, BasePrice: item.BasePrice, UpdatedRooms: 0})
				continue
			}

			if err := tx.Model(&models.Room{}).
				Where("hotel_id = ? AND deleted_at IS NULL AND LOWER(COALESCE(NULLIF(BTRIM(room_type), ''), 'Unspecified')) = ?", hotelID, normalizedRoomType).
				Update("base_price", item.BasePrice).Error; err != nil {
				return err
			}

			results = append(results, updatedType{RoomType: roomType, BasePrice: item.BasePrice, UpdatedRooms: roomCount})
			totalUpdated += roomCount
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid room_type or base_price in items"})
		return
	}

	occasion := strings.TrimSpace(req.Occasion)
	reason := strings.TrimSpace(req.Reason)
	message := "Room normal pricing updated"
	if occasion != "" {
		message += " | occasion: " + occasion
	}
	if reason != "" {
		message += " | reason: " + reason
	}
	message += " | room types updated"
	utils.LogActivityWithContext(hotelID, "Settings", adminID, "Updated", "Room Base Pricing", message)

	c.JSON(http.StatusOK, gin.H{
		"updated_rooms": totalUpdated,
		"items":         results,
		"occasion":      occasion,
		"reason":        reason,
	})
}

func GetRoomOccupancyPricing(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	defaultIncludedGuests, defaultExtraGuestPerNight := occupancyPricingPolicy(hotelID)

	type roomTypeOccupancyRow struct {
		RoomType                          string   `json:"room_type"`
		RoomsCount                        int      `json:"rooms_count"`
		IncludedGuestsOverride            *int     `json:"included_guests_override"`
		ExtraGuestPerNightOverride        *float64 `json:"extra_guest_charge_per_night_override"`
		OverrideEnabled                   bool     `json:"override_enabled"`
		EffectiveIncludedGuests           int      `json:"effective_included_guests"`
		EffectiveExtraGuestChargePerNight float64  `json:"effective_extra_guest_charge_per_night"`
		MixedOverrides                    bool     `json:"mixed_overrides"`
	}

	var rooms []models.Room
	if err := config.DB.Preload("RoomType").
		Where("hotel_id = ? AND deleted_at IS NULL", hotelID).
		Order("room_number asc").
		Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load room occupancy pricing"})
		return
	}

	type accumulator struct {
		roomType                   string
		roomsCount                 int
		includedGuestsOverride     *int
		extraGuestPerNightOverride *float64
		mixedOverrides             bool
	}
	byType := map[string]*accumulator{}
	order := []string{}

	for _, room := range rooms {
		roomType := strings.TrimSpace(room.RoomType.Name)
		if roomType == "" {
			roomType = "Unspecified"
		}
		key := strings.ToLower(roomType)

		entry, exists := byType[key]
		if !exists {
			var incCopy *int
			if room.RoomType.IncludedGuestsOverride != nil {
				v := *room.RoomType.IncludedGuestsOverride
				incCopy = &v
			}
			var extraCopy *float64
			if room.RoomType.ExtraGuestChargePerNightOverride != nil {
				v := *room.RoomType.ExtraGuestChargePerNightOverride
				extraCopy = &v
			}
			entry = &accumulator{
				roomType:                   roomType,
				roomsCount:                 0,
				includedGuestsOverride:     incCopy,
				extraGuestPerNightOverride: extraCopy,
				mixedOverrides:             false,
			}
			byType[key] = entry
			order = append(order, key)
		}

		entry.roomsCount++
		if (entry.includedGuestsOverride == nil) != (room.RoomType.IncludedGuestsOverride == nil) {
			entry.mixedOverrides = true
		} else if entry.includedGuestsOverride != nil && room.RoomType.IncludedGuestsOverride != nil && *entry.includedGuestsOverride != *room.RoomType.IncludedGuestsOverride {
			entry.mixedOverrides = true
		}
		if (entry.extraGuestPerNightOverride == nil) != (room.RoomType.ExtraGuestChargePerNightOverride == nil) {
			entry.mixedOverrides = true
		} else if entry.extraGuestPerNightOverride != nil && room.RoomType.ExtraGuestChargePerNightOverride != nil && *entry.extraGuestPerNightOverride != *room.RoomType.ExtraGuestChargePerNightOverride {
			entry.mixedOverrides = true
		}
	}

	items := make([]roomTypeOccupancyRow, 0, len(order))
	for _, key := range order {
		entry := byType[key]
		effectiveIncludedGuests := defaultIncludedGuests
		effectiveExtraGuestPerNight := defaultExtraGuestPerNight

		overrideEnabled := !entry.mixedOverrides && entry.includedGuestsOverride != nil && entry.extraGuestPerNightOverride != nil
		includedOverride := entry.includedGuestsOverride
		extraOverride := entry.extraGuestPerNightOverride
		if entry.mixedOverrides {
			includedOverride = nil
			extraOverride = nil
		}
		if includedOverride != nil && *includedOverride > 0 {
			effectiveIncludedGuests = *includedOverride
		}
		if extraOverride != nil && *extraOverride >= 0 {
			effectiveExtraGuestPerNight = *extraOverride
		}

		items = append(items, roomTypeOccupancyRow{
			RoomType:                          entry.roomType,
			RoomsCount:                        entry.roomsCount,
			IncludedGuestsOverride:            includedOverride,
			ExtraGuestPerNightOverride:        extraOverride,
			OverrideEnabled:                   overrideEnabled,
			EffectiveIncludedGuests:           effectiveIncludedGuests,
			EffectiveExtraGuestChargePerNight: effectiveExtraGuestPerNight,
			MixedOverrides:                    entry.mixedOverrides,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"defaults": gin.H{
			"included_guests":              defaultIncludedGuests,
			"extra_guest_charge_per_night": defaultExtraGuestPerNight,
		},
		"items": items,
	})
}

func UpdateRoomOccupancyPricing(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req updateRoomOccupancyPricingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one room occupancy item is required"})
		return
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range req.Items {
			roomType := strings.TrimSpace(item.RoomType)
			if roomType == "" {
				return gorm.ErrInvalidData
			}
			normalizedRoomType := strings.ToLower(roomType)

			updates := map[string]interface{}{}
			if !item.OverrideEnabled {
				updates["included_guests_override"] = nil
				updates["extra_guest_charge_per_night_override"] = nil
			} else {
				if item.IncludedGuestsOverride == nil || *item.IncludedGuestsOverride < 1 || *item.IncludedGuestsOverride > 10 {
					return gorm.ErrInvalidData
				}
				if item.ExtraGuestPerNightOverride == nil || *item.ExtraGuestPerNightOverride < 0 {
					return gorm.ErrInvalidData
				}
				updates["included_guests_override"] = *item.IncludedGuestsOverride
				updates["extra_guest_charge_per_night_override"] = *item.ExtraGuestPerNightOverride
			}

			if err := tx.Model(&models.RoomType{}).
				Where("hotel_id = ? AND deleted_at IS NULL AND LOWER(name) = ?", hotelID, normalizedRoomType).
				Updates(updates).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		if err == gorm.ErrInvalidData {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid included_guests_override or extra_guest_charge_per_night_override"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update room occupancy pricing"})
		return
	}

	utils.LogActivityWithContext(hotelID, "Settings", adminID, "Updated", "Room Occupancy Pricing", "Room-type occupancy pricing updated")
	c.JSON(http.StatusOK, gin.H{"message": "Room-type occupancy pricing updated successfully"})
}

func GetCurrentHotelSettings(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	if hotelID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "No hotel selected. Please create or select a hotel first."})
		return
	}
	var h models.Hotel
	if err := config.DB.Where("id = ? AND admin_id = ?", hotelID, adminID).First(&h).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hotel not found"})
		return
	}
	c.JSON(http.StatusOK, h)
}

func UpdateCurrentHotelSettings(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var payload struct {
		Name       string  `json:"name"`
		Email      string  `json:"email"`
		Phone      string  `json:"phone"`
		Address1   string  `json:"address1"`
		Address2   string  `json:"address2"`
		City       string  `json:"city"`
		State      string  `json:"state"`
		Country    string  `json:"country"`
		Pincode    string  `json:"pincode"`
		GSTNumber  string  `json:"gst_number"`
		TaxType    string  `json:"tax_type"`
		TaxPercent *float64 `json:"tax_percent"`
		Logo       string  `json:"logo"`
		BookingEnabled *bool `json:"booking_enabled"`
		BookingBaseUrl string `json:"booking_base_url"`
		BookingPath string `json:"booking_path"`
		BookingCampaignTag string `json:"booking_campaign_tag"`
		AdvancePaymentPercent *float64 `json:"advance_payment_percent"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if payload.TaxPercent != nil && (*payload.TaxPercent < 0 || *payload.TaxPercent > 100) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tax_percent must be between 0 and 100"})
		return
	}

	var h models.Hotel
	if err := config.DB.First(&h, hotelID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hotel not found"})
		return
	}

	if strings.TrimSpace(payload.Name) != "" {
		h.Name = strings.TrimSpace(payload.Name)
	}
	if strings.TrimSpace(payload.Address1) != "" {
		h.Address1 = strings.TrimSpace(payload.Address1)
	}
	if strings.TrimSpace(payload.Address2) != "" {
		h.Address2 = strings.TrimSpace(payload.Address2)
	}
	if strings.TrimSpace(payload.City) != "" {
		h.City = strings.TrimSpace(payload.City)
	}
	if strings.TrimSpace(payload.State) != "" {
		h.State = strings.TrimSpace(payload.State)
	}
	if strings.TrimSpace(payload.Country) != "" {
		h.Country = strings.TrimSpace(payload.Country)
	}
	if strings.TrimSpace(payload.Pincode) != "" {
		h.Pincode = strings.TrimSpace(payload.Pincode)
	}
	if strings.TrimSpace(payload.Phone) != "" {
		h.Phone = strings.TrimSpace(payload.Phone)
	}
	if strings.TrimSpace(payload.Email) != "" {
		h.Email = strings.TrimSpace(payload.Email)
	}
	if strings.TrimSpace(payload.TaxType) != "" {
		h.TaxType = strings.TrimSpace(payload.TaxType)
	}
	// Use pointer so tax_percent: 0 is treated as "set to 0", not "not provided"
	if payload.TaxPercent != nil {
		h.TaxPercent = *payload.TaxPercent
	}
	if payload.AdvancePaymentPercent != nil {
		p := *payload.AdvancePaymentPercent
		if p < 0 {
			p = 0
		}
		if p > 100 {
			p = 100
		}
		h.AdvancePaymentPercent = p
	}
	if strings.TrimSpace(payload.GSTNumber) != "" {
		h.GSTNumber = strings.TrimSpace(payload.GSTNumber)
	}
	if logo := strings.TrimSpace(payload.Logo); logo != "" && strings.HasPrefix(logo, "/uploads/") {
		h.Logo = logo
	}
	if payload.BookingEnabled != nil {
		h.BookingEnabled = *payload.BookingEnabled
	}
	h.BookingBaseUrl = payload.BookingBaseUrl
	h.BookingPath = payload.BookingPath
	h.BookingCampaignTag = payload.BookingCampaignTag

	if err := config.DB.Save(&h).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update hotel settings"})
		return
	}

	utils.CacheDel(fmt.Sprintf("hotels:detail:%d", hotelID))
	if h.PublicToken != "" {
		utils.CacheDel(fmt.Sprintf("hotels:detail:%s", h.PublicToken))
	}

	utils.LogActivityWithContext(hotelID, "Settings", adminID, "Updated", "Hotel", "Hotel settings updated")
	c.JSON(http.StatusOK, h)
}
