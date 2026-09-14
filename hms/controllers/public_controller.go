package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"hms/config"
	"hms/models"
	"hms/utils"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ── GET /api/public/config ───────────────────────────────────────────────────

func GetPublicConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"google_client_id": strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
	})
}

// publicHotel is the safe public-facing hotel shape
type publicHotel struct {
	ID                    uint    `json:"id"`
	Name                  string  `json:"name"`
	City                  string  `json:"city"`
	State                 string  `json:"state"`
	Address               string  `json:"address"`
	Phone                 string  `json:"phone"`
	Email                 string  `json:"email"`
	Logo                  string  `json:"logo"`
	Description           string  `json:"description"`
	TaxPercent            float64 `json:"tax_percent"`
	TaxType               string  `json:"tax_type"`
	AvgRating             float64 `json:"avg_rating"`
	ReviewCount           int64   `json:"review_count"`
	MinRoomPrice          float64 `json:"min_room_price"`
	RoomCount             int64   `json:"room_count"`
	PublicToken           string  `json:"public_token"`
	BookingPath           string  `json:"booking_path"`
	FeatureOnlinePayment  bool    `json:"feature_online_payment"`
	PaymentGateway        string  `json:"payment_gateway"`
	RazorpayKeyID         string  `json:"razorpay_key_id"`
	PhonePeMerchantID     string  `json:"phonepe_merchant_id"`
	PhonePeEnv            string  `json:"phonepe_env"`
	AdvancePaymentPercent float64 `json:"advance_payment_percent"`
}

func hotelToPublic(h models.Hotel) publicHotel {
	logo := h.Logo
	if logo != "" && !strings.HasPrefix(logo, "http") {
		base := strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/")
		logo = base + logo
	}
	gw := h.PaymentGateway
	if gw == "" {
		gw = "razorpay"
	}
	return publicHotel{
		ID: h.ID, Name: h.Name, City: h.City, State: h.State,
		Address: h.Address1, Phone: h.Phone, Email: h.Email,
		Logo: logo, Description: h.Description,
		TaxPercent: h.TaxPercent, TaxType: h.TaxType,
		PublicToken: h.PublicToken, BookingPath: h.BookingPath,
		FeatureOnlinePayment:  h.FeatureOnlinePayment,
		PaymentGateway:        gw,
		RazorpayKeyID:         h.RazorpayKeyID,
		PhonePeMerchantID:     h.PhonePeMerchantID,
		PhonePeEnv:            h.PhonePeEnv,
		AdvancePaymentPercent: h.AdvancePaymentPercent,
	}
}

// PublicListHotels returns all active hotels — Redis cached 5 min
func PublicListHotels(c *gin.Context) {
	city := strings.TrimSpace(c.Query("city"))
	q := strings.TrimSpace(c.Query("q"))

	cacheKey := fmt.Sprintf("hotels:list:%s:%s", city, q)
	var cached struct {
		Hotels []publicHotel `json:"hotels"`
		Total  int           `json:"total"`
	}
	if utils.CacheGet(cacheKey, &cached) {
		c.JSON(http.StatusOK, gin.H{"hotels": cached.Hotels, "total": cached.Total, "cached": true})
		return
	}

	query := config.DB.Model(&models.Hotel{}).
		Where("status = ? AND subscription_status = ? AND booking_enabled = ?", "active", "active", true)
	if city != "" {
		query = query.Where("LOWER(city) LIKE ?", "%"+strings.ToLower(city)+"%")
	}
	if q != "" {
		query = query.Where("LOWER(name) LIKE ?", "%"+strings.ToLower(q)+"%")
	}

	var hotels []models.Hotel
	if err := query.Order("id desc").Find(&hotels).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hotels"})
		return
	}

	// Reviews summary in one query (published only)
	type reviewAgg struct {
		HotelID     uint    `json:"hotel_id"`
		AvgRating   float64 `json:"avg_rating"`
		ReviewCount int64   `json:"review_count"`
	}
	var aggs []reviewAgg
	config.DB.Model(&models.HotelReview{}).
		Select("hotel_id, COALESCE(AVG(rating),0) as avg_rating, COUNT(*) as review_count").
		Where("status = ? AND deleted_at IS NULL", "published").
		Group("hotel_id").
		Scan(&aggs)
	aggByHotel := make(map[uint]reviewAgg, len(aggs))
	for _, a := range aggs {
		aggByHotel[a.HotelID] = a
	}

	// Room pricing summary in one query (min base_price for available rooms)
	type roomAgg struct {
		HotelID      uint    `json:"hotel_id"`
		MinRoomPrice float64 `json:"min_room_price"`
		RoomCount    int64   `json:"room_count"`
	}
	var roomAggs []roomAgg
	config.DB.Model(&models.Room{}).
		Select("hotel_id, COALESCE(MIN(base_price),0) as min_room_price, COUNT(*) as room_count").
		Where("status = ? AND deleted_at IS NULL", "available").
		Group("hotel_id").
		Scan(&roomAggs)
	roomByHotel := make(map[uint]roomAgg, len(roomAggs))
	for _, a := range roomAggs {
		roomByHotel[a.HotelID] = a
	}

	result := make([]publicHotel, 0, len(hotels))
	for _, h := range hotels {
		ph := hotelToPublic(h)
		if a, ok := aggByHotel[h.ID]; ok {
			ph.AvgRating = a.AvgRating
			ph.ReviewCount = a.ReviewCount
		}
		if a, ok := roomByHotel[h.ID]; ok {
			ph.MinRoomPrice = a.MinRoomPrice
			ph.RoomCount = a.RoomCount
		}
		result = append(result, ph)
	}

	utils.CacheSet(cacheKey, map[string]interface{}{"hotels": result, "total": len(result)}, 5*time.Minute)
	c.JSON(http.StatusOK, gin.H{"hotels": result, "total": len(result)})
}

// PublicGetHotel returns hotel details with available rooms — Redis cached 2 min
// Supports both numeric hotel_id and public_token
func PublicGetHotel(c *gin.Context) {
	hotelParam := c.Param("hotel_id")

	var hotel models.Hotel

	// Try to find by PublicToken first (for new secure URLs)
	if err := config.DB.Where("public_token = ? AND status = ? AND subscription_status = ?", hotelParam, "active", "active").First(&hotel).Error; err == nil {
		// Found by token, continue
	} else {
		// Try numeric ID (for backward compatibility with old URLs)
		hotelID, err := strconv.ParseUint(hotelParam, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid booking link"})
			return
		}
		if err := config.DB.Where("id = ? AND status = ? AND subscription_status = ?", hotelID, "active", "active").First(&hotel).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Hotel not found or link expired"})
			return
		}
	}

	if !hotel.BookingEnabled {
		c.JSON(http.StatusForbidden, gin.H{"error": "Bookings are currently disabled for this hotel"})
		return
	}

	hotelID := hotel.ID

	cacheKey := fmt.Sprintf("hotels:detail:%d", hotelID)
	var cached map[string]interface{}
	if utils.CacheGet(cacheKey, &cached) {
		c.JSON(http.StatusOK, cached)
		return
	}

	var rooms []models.Room
	config.DB.Preload("RoomType").Preload("RoomType.Images", func(tx *gorm.DB) *gorm.DB {
		return tx.Order("is_primary desc, \"order\" asc")
	}).Where("hotel_id = ? AND status IN ? AND deleted_at IS NULL", hotelID, []string{"available", "occupied", "dirty", "reserved"}).Find(&rooms)

	base := strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/")
	for i := range rooms {
		if rooms[i].RoomType.Image != "" && !strings.HasPrefix(rooms[i].RoomType.Image, "http") {
			rooms[i].RoomType.Image = base + rooms[i].RoomType.Image
		}
		for j := range rooms[i].RoomType.Images {
			if rooms[i].RoomType.Images[j].URL != "" && !strings.HasPrefix(rooms[i].RoomType.Images[j].URL, "http") {
				rooms[i].RoomType.Images[j].URL = base + rooms[i].RoomType.Images[j].URL
			}
		}
	}

	logo := hotel.Logo
	if logo != "" && !strings.HasPrefix(logo, "http") {
		logo = base + logo
	}

	gw := hotel.PaymentGateway
	if gw == "" {
		gw = "razorpay"
	}

	resp := gin.H{
		"hotel": gin.H{
			"id": hotel.ID, "name": hotel.Name, "city": hotel.City,
			"state": hotel.State, "country": hotel.Country,
			"address": hotel.Address1, "address1": hotel.Address1, "address2": hotel.Address2, "pincode": hotel.Pincode,
			"phone": hotel.Phone, "email": hotel.Email,
			"logo": logo, "description": hotel.Description,
			"tax_percent": hotel.TaxPercent, "tax_type": hotel.TaxType,
			"public_token": hotel.PublicToken, "booking_path": hotel.BookingPath,
			"feature_online_payment":  hotel.FeatureOnlinePayment,
			"payment_gateway":         gw,
			"razorpay_key_id":         hotel.RazorpayKeyID,
			"phonepe_merchant_id":     hotel.PhonePeMerchantID,
			"phonepe_env":             hotel.PhonePeEnv,
			"advance_payment_percent": hotel.AdvancePaymentPercent,
		},
		"rooms": rooms,
	}
	utils.CacheSet(cacheKey, resp, 5*time.Minute)
	c.JSON(http.StatusOK, resp)
}

// PublicCheckAvailability checks room availability — Redis cached 1 min
// Supports both numeric hotel_id and public_token
func PublicCheckAvailability(c *gin.Context) {
	hotelParam := c.Query("hotel_id")
	checkIn := c.Query("check_in")
	checkOut := c.Query("check_out")
	roomType := strings.TrimSpace(c.Query("room_type"))
	guestsParam := c.Query("guests")
	totalGuests, _ := strconv.Atoi(guestsParam)
	if totalGuests < 1 {
		totalGuests = 1
	}

	if hotelParam == "" || checkIn == "" || checkOut == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hotel_id, check_in and check_out are required"})
		return
	}

	var hotel models.Hotel
	var hotelID uint

	// Try to find by PublicToken first (for new secure URLs)
	if err := config.DB.Where("public_token = ? AND status = ? AND subscription_status = ?", hotelParam, "active", "active").First(&hotel).Error; err == nil {
		hotelID = hotel.ID
	} else {
		// Try numeric ID (for backward compatibility)
		parsedID, err := strconv.ParseUint(hotelParam, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel_id"})
			return
		}
		hotelID = uint(parsedID)
		if err := config.DB.Where("id = ? AND status = ? AND subscription_status = ?", hotelID, "active", "active").First(&hotel).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Hotel not found"})
			return
		}
	}

	if !hotel.BookingEnabled {
		c.JSON(http.StatusForbidden, gin.H{"error": "Bookings are currently disabled for this hotel"})
		return
	}

	checkInDate, err := time.Parse("2006-01-02", checkIn)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_in must be yyyy-mm-dd"})
		return
	}
	checkOutDate, err := time.Parse("2006-01-02", checkOut)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_out must be yyyy-mm-dd"})
		return
	}
	if !checkOutDate.After(checkInDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_out must be after check_in"})
		return
	}

	cacheKey := fmt.Sprintf("availability:%d:%s:%s:%s:%d", hotelID, checkIn, checkOut, roomType, totalGuests)
	var cachedResp map[string]interface{}
	if utils.CacheGet(cacheKey, &cachedResp) {
		c.JSON(http.StatusOK, cachedResp)
		return
	}

	var bookedRoomIDs []uint
	config.DB.Model(&models.Booking{}).
		Where("hotel_id = ? AND status NOT IN ? AND check_in_date < ? AND check_out_date > ?",
			hotelID, []string{"cancelled", "completed"}, checkOutDate, checkInDate).
		Pluck("room_id", &bookedRoomIDs)

	query := config.DB.Preload("RoomType").Preload("RoomType.Images", func(tx *gorm.DB) *gorm.DB {
		return tx.Order("is_primary desc, \"order\" asc")
	}).Where("hotel_id = ? AND status IN ? AND deleted_at IS NULL", hotelID, []string{"available", "occupied", "dirty", "reserved"})

	if len(bookedRoomIDs) > 0 {
		query = query.Where("id NOT IN ?", bookedRoomIDs)
	}
	if roomType != "" {
		query = query.Joins("JOIN room_types ON room_types.id = rooms.room_type_id").Where("LOWER(room_types.name) = ?", strings.ToLower(roomType))
	}

	var rooms []models.Room
	query.Find(&rooms)

	nights := int(checkOutDate.Sub(checkInDate).Hours() / 24)
	base := strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/")

	type availRoom struct {
		ID                 uint    `json:"id"`
		RoomNumber         string  `json:"room_number"`
		RoomType           string  `json:"room_type"`
		BasePrice          float64 `json:"base_price"`
		TotalPrice         float64 `json:"total_price"`
		Nights             int     `json:"nights"`
		Image              string  `json:"image"`
		Description        string  `json:"description"`
		IncludedGuests     int     `json:"included_guests"`
		ExtraGuestPerNight float64 `json:"extra_guest_per_night"`
		MaxOccupancy       int     `json:"max_occupancy"`
	}

	// Load hotel occupancy settings once
	var setting models.SystemSetting
	defaultIncluded := 1
	defaultExtra := 0.0
	if err := config.DB.Where("hotel_id = ?", hotelID).Take(&setting).Error; err == nil {
		if setting.IncludedGuests > 0 {
			defaultIncluded = setting.IncludedGuests
		}
		if setting.ExtraGuestPerNight > 0 {
			defaultExtra = setting.ExtraGuestPerNight
		}
	}

	result := make([]availRoom, 0, len(rooms))
	for _, r := range rooms {
		// Filter by max occupancy if set
		if r.RoomType.MaxOccupancy > 0 && r.RoomType.MaxOccupancy < totalGuests {
			continue
		}
		img := r.RoomType.Image
		if img != "" && !strings.HasPrefix(img, "http") {
			img = base + img
		}
		inc := defaultIncluded
		extra := defaultExtra
		if r.RoomType.IncludedGuestsOverride != nil && *r.RoomType.IncludedGuestsOverride > 0 {
			inc = *r.RoomType.IncludedGuestsOverride
		}
		if r.RoomType.ExtraGuestChargePerNightOverride != nil && *r.RoomType.ExtraGuestChargePerNightOverride >= 0 {
			extra = *r.RoomType.ExtraGuestChargePerNightOverride
		}
		result = append(result, availRoom{
			ID: r.ID, RoomNumber: r.RoomNumber, RoomType: r.RoomType.Name,
			BasePrice: r.RoomType.BasePrice, TotalPrice: r.RoomType.BasePrice * float64(nights),
			Nights: nights, Image: img, Description: r.RoomType.Description,
			IncludedGuests: inc, ExtraGuestPerNight: extra,
			MaxOccupancy: r.RoomType.MaxOccupancy,
		})
	}

	resp := gin.H{
		"available_rooms": result,
		"check_in":        checkIn,
		"check_out":       checkOut,
		"nights":          nights,
		"total":           len(result),
	}
	utils.CacheSet(cacheKey, resp, 2*time.Minute)
	c.JSON(http.StatusOK, resp)
}

// PublicCreateBooking — requires GuestAuth. Uses DB transaction to prevent race conditions.
func PublicCreateBooking(c *gin.Context) {
	publicUserID := c.GetUint("public_user_id")

	var req struct {
		HotelID          uint   `json:"hotel_id" binding:"required"`
		RoomID           uint   `json:"room_id" binding:"required"`
		CheckIn          string `json:"check_in" binding:"required"`
		CheckOut         string `json:"check_out" binding:"required"`
		TotalGuests      int    `json:"total_guests"`
		SpecialReqs      string `json:"special_requests"`
		CompanionDetails string `json:"companion_details"` // JSON array of companion names
		IdempotencyKey   string `json:"idempotency_key"`
		GuestName        string `json:"guest_name"`
		GuestEmail       string `json:"guest_email"`
		GuestPhone       string `json:"guest_phone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var publicUser models.PublicUser
	if publicUserID == 0 || config.DB.First(&publicUser, publicUserID).Error != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Login required"})
		return
	}

	req.GuestName = strings.TrimSpace(req.GuestName)
	req.GuestEmail = strings.ToLower(strings.TrimSpace(req.GuestEmail))
	req.GuestPhone = strings.TrimSpace(req.GuestPhone)

	if publicUser.Email != "" {
		// Public bookings must remain attached to the signed-in account.
		req.GuestEmail = strings.ToLower(strings.TrimSpace(publicUser.Email))
	}
	if req.GuestName == "" {
		req.GuestName = strings.TrimSpace(publicUser.Name)
	}
	if req.GuestPhone == "" {
		req.GuestPhone = strings.TrimSpace(publicUser.Phone)
	}
	if req.GuestName == "" {
		req.GuestName = req.GuestEmail
	}

	// Idempotency: prevent duplicate submissions
	if req.IdempotencyKey != "" {
		iKey := "idempotent:booking:" + req.IdempotencyKey
		if existing, ok := utils.OTPGet(iKey); ok {
			c.JSON(http.StatusOK, gin.H{"message": "Booking already created", "booking_code": existing})
			return
		}
	}

	checkIn, err := time.Parse("2006-01-02", req.CheckIn)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_in must be yyyy-mm-dd"})
		return
	}
	checkOut, err := time.Parse("2006-01-02", req.CheckOut)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_out must be yyyy-mm-dd"})
		return
	}
	if !checkOut.After(checkIn) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_out must be after check_in"})
		return
	}

	// Guest info validation
	if req.GuestPhone == "" && req.GuestEmail == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Guest phone or email is required"})
		return
	}
	if req.GuestPhone != "" && normalizePhoneDigits(req.GuestPhone) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Enter a valid mobile number"})
		return
	}
	if req.GuestPhone != "" && strings.TrimSpace(publicUser.Phone) == "" {
		if err := config.DB.Model(&publicUser).Update("phone", req.GuestPhone).Error; err == nil {
			publicUser.Phone = req.GuestPhone
		}
	}

	var booking models.Booking
	var hotel models.Hotel
	var room models.Room
	var guest models.Guest

	txErr := config.DB.Transaction(func(tx *gorm.DB) error {
		// Validate hotel
		if err := tx.Where("id = ? AND deleted_at IS NULL", req.HotelID).First(&hotel).Error; err != nil {
			return fmt.Errorf("hotel_not_found")
		}
		if hotel.Status != "active" || hotel.SubscriptionStatus != "active" || !hotel.BookingEnabled {
			return fmt.Errorf("hotel_not_found")
		}

		// Booking limit for free tier
		if hotel.SubscriptionTier == "free" {
			var todayCount int64
			tx.Model(&models.Booking{}).
				Where("hotel_id = ? AND to_timestamp(created_at / 1000.0)::date = CURRENT_DATE", req.HotelID).
				Count(&todayCount)
			if todayCount >= int64(hotel.BookingLimitPerDay) {
				return fmt.Errorf("booking_limit_reached")
			}
		}

		// Lock room row to prevent race condition
		if err := tx.Preload("RoomType").Set("gorm:query_option", "FOR UPDATE").
			Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", req.RoomID, req.HotelID).
			First(&room).Error; err != nil {
			return fmt.Errorf("room_not_found")
		}

		// Re-check availability inside transaction (race condition fix)
		var conflict int64
		tx.Model(&models.Booking{}).
			Where("hotel_id = ? AND room_id = ? AND status NOT IN ? AND check_in_date < ? AND check_out_date > ?",
				req.HotelID, req.RoomID, []string{"cancelled", "completed"}, checkOut, checkIn).
			Count(&conflict)
		if conflict > 0 {
			return fmt.Errorf("room_not_available")
		}

		// Find or create the hotel-scoped Guest record. Phone is matched by digits
		// so +91 98765 43210 and 9876543210 map to the same returning guest.
		guestConditions := []string{}
		guestArgs := []interface{}{}
		if req.GuestEmail != "" {
			guestConditions = append(guestConditions, "LOWER(email) = ?")
			guestArgs = append(guestArgs, strings.ToLower(req.GuestEmail))
		}
		if digits := normalizePhoneDigits(req.GuestPhone); digits != "" {
			guestConditions = append(guestConditions, "regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = ?")
			guestArgs = append(guestArgs, digits)
		}
		guestLookup := tx.Where("hotel_id = ? AND deleted_at IS NULL", req.HotelID)
		if len(guestConditions) > 0 {
			guestLookup = guestLookup.Where("("+strings.Join(guestConditions, " OR ")+")", guestArgs...)
		}
		if err := guestLookup.First(&guest).Error; err != nil {
			guest = models.Guest{
				HotelID: req.HotelID,
				Name:    req.GuestName,
				Phone:   req.GuestPhone,
				Email:   req.GuestEmail,
			}
			if err := tx.Create(&guest).Error; err != nil {
				return fmt.Errorf("failed to create guest")
			}
		} else {
			guestUpdates := map[string]interface{}{}
			if strings.TrimSpace(guest.Name) == "" && req.GuestName != "" {
				guestUpdates["name"] = req.GuestName
				guest.Name = req.GuestName
			}
			if strings.TrimSpace(guest.Email) == "" && req.GuestEmail != "" {
				guestUpdates["email"] = req.GuestEmail
				guest.Email = req.GuestEmail
			}
			if strings.TrimSpace(guest.Phone) == "" && req.GuestPhone != "" {
				guestUpdates["phone"] = req.GuestPhone
				guest.Phone = req.GuestPhone
			}
			if len(guestUpdates) > 0 {
				if err := tx.Model(&guest).Updates(guestUpdates).Error; err != nil {
					return fmt.Errorf("failed to update guest")
				}
			}
		}

		nights := int(checkOut.Sub(checkIn).Hours() / 24)
		if nights < 1 {
			nights = 1
		}
		if req.TotalGuests < 1 {
			req.TotalGuests = 1
		}

		// Load occupancy pricing from hotel system settings
		var setting models.SystemSetting
		includedGuests := 1
		extraGuestPerNight := 0.0
		if err := tx.Where("hotel_id = ?", req.HotelID).Take(&setting).Error; err == nil {
			if setting.IncludedGuests > 0 {
				includedGuests = setting.IncludedGuests
			}
			if setting.ExtraGuestPerNight > 0 {
				extraGuestPerNight = setting.ExtraGuestPerNight
			}
		}
		// Apply room-level overrides if set
		if room.RoomType.IncludedGuestsOverride != nil && *room.RoomType.IncludedGuestsOverride > 0 {
			includedGuests = *room.RoomType.IncludedGuestsOverride
		}
		if room.RoomType.ExtraGuestChargePerNightOverride != nil && *room.RoomType.ExtraGuestChargePerNightOverride >= 0 {
			extraGuestPerNight = *room.RoomType.ExtraGuestChargePerNightOverride
		}

		extraGuests := req.TotalGuests - includedGuests
		if extraGuests < 0 {
			extraGuests = 0
		}
		roomCharges := room.RoomType.BasePrice * float64(nights)
		extraCharges := float64(extraGuests) * extraGuestPerNight * float64(nights)
		totalAmount := roomCharges + extraCharges
		taxAmount := totalAmount * hotel.TaxPercent / 100

		booking = models.Booking{
			BookingCode:      utils.GenerateBookingID(req.HotelID),
			HotelID:          req.HotelID,
			GuestID:          guest.ID,
			PublicUserID:     &publicUser.ID,
			RoomID:           &req.RoomID,
			RoomTypeID:       room.RoomTypeID,
			CheckInDate:      checkIn,
			CheckOutDate:     checkOut,
			Status:           "reserved",
			BookingSource:    "Website",
			MarketSegment:    "Direct Online",
			BaseRate:         room.RoomType.BasePrice,
			TaxRate:          hotel.TaxPercent,
			Tax:              taxAmount,
			TotalAmount:      totalAmount,
			TotalGuests:      req.TotalGuests,
			SpecialRequests:  req.SpecialReqs,
			CompanionDetails: req.CompanionDetails,
		}
		if err := tx.Create(&booking).Error; err != nil {
			return fmt.Errorf("failed to create booking")
		}
		// DO NOT mutate the global physical room status for public bookings.
		// The overlap SQL query handles date-wise availability perfectly.
		return nil
	})

	if txErr != nil {
		switch txErr.Error() {
		case "hotel_not_found":
			c.JSON(http.StatusNotFound, gin.H{"error": "Hotel not found or inactive"})
		case "booking_limit_reached":
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Hotel booking limit reached for today"})
		case "room_not_found":
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		case "room_not_available":
			c.JSON(http.StatusConflict, gin.H{"error": "Room not available for selected dates"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": txErr.Error()})
		}
		return
	}

	// Store idempotency key → booking code (24h TTL)
	if req.IdempotencyKey != "" {
		utils.OTPSet("idempotent:booking:"+req.IdempotencyKey, booking.BookingCode, 24*time.Hour)
	}

	// Invalidate Redis caches for this hotel
	utils.CacheDel(fmt.Sprintf("hotels:detail:%d", req.HotelID))
	utils.CacheDelPattern(fmt.Sprintf("availability:%d:*", req.HotelID))

	nights := int(checkOut.Sub(checkIn).Hours() / 24)
	if nights < 1 {
		nights = 1
	}
	totalAmount := room.RoomType.BasePrice * float64(nights)
	taxAmount := totalAmount * hotel.TaxPercent / 100

	// Send confirmation email async
	go func() {
		otp := utils.GenerateOTP()
		qrToken := utils.RandomString(48)
		now := time.Now()
		otpRecord := models.BookingOTP{
			BookingID: booking.ID,
			HotelID:   booking.HotelID,
			OTP:       otp,
			QRToken:   qrToken,
			OTPExpiry: now.Add(24 * time.Hour),
			QRExpiry:  now.Add(24 * time.Hour),
		}
		config.DB.Create(&otpRecord)
		publicBase := strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/")
		guestQRURL := fmt.Sprintf("%s/checkin/qr?token=%s", publicBase, qrToken)
		qrBase64, _ := utils.GenerateQRBase64WithSize(guestQRURL, 300)
		utils.SendBookingConfirmation(utils.BookingNotifyData{
			GuestName:    guest.Name,
			GuestEmail:   guest.Email,
			GuestPhone:   guest.Phone,
			BookingCode:  booking.BookingCode,
			RoomNumber:   room.RoomNumber,
			RoomType:     room.RoomType.Name,
			HotelName:    hotel.Name,
			HotelAddress: hotel.Address1,
			CheckInDate:  booking.CheckInDate.Format("02 Jan 2006"),
			CheckOutDate: booking.CheckOutDate.Format("02 Jan 2006"),
			Nights:       nights,
			TotalAmount:  totalAmount + taxAmount,
			OTP:          otp,
			QRBase64:     qrBase64,
			QRToken:      qrToken,
		})
	}()

	utils.LogActivity(req.HotelID, "PublicBooking", 0, fmt.Sprintf("Public booking %s by %s", booking.BookingCode, guest.Name))

	c.JSON(http.StatusCreated, gin.H{
		"id":                booking.ID,
		"message":           "Booking confirmed",
		"booking_code":      booking.BookingCode,
		"hotel_name":        hotel.Name,
		"room_number":       room.RoomNumber,
		"room_type":         room.RoomType.Name,
		"room_type_details": room.RoomType,
		"check_in":          req.CheckIn,
		"check_out":         req.CheckOut,
		"nights":            nights,
		"total_amount":      totalAmount + taxAmount,
		"guest_name":        guest.Name,
		"guest_phone":       guest.Phone,
	})
}

func publicBookingBelongsToUser(booking models.Booking, user models.PublicUser) bool {
	if booking.PublicUserID != nil && *booking.PublicUserID == user.ID {
		return true
	}
	var guest models.Guest
	if err := config.DB.First(&guest, booking.GuestID).Error; err != nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(guest.Email), strings.TrimSpace(user.Email)) && strings.TrimSpace(user.Email) != "" {
		return true
	}
	guestDigits := normalizePhoneDigits(guest.Phone)
	userDigits := normalizePhoneDigits(user.Phone)
	return guestDigits != "" && userDigits != "" && guestDigits == userDigits
}

func preparePublicPaymentContext(c *gin.Context) bool {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payment request"})
		return false
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(body))

	var req struct {
		BookingID uint `json:"booking_id"`
		HotelID   uint `json:"hotel_id"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payment request"})
		return false
	}
	if req.BookingID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "booking_id is required"})
		return false
	}

	publicUserID := c.GetUint("public_user_id")
	var publicUser models.PublicUser
	if publicUserID == 0 || config.DB.First(&publicUser, publicUserID).Error != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Login required"})
		return false
	}

	var booking models.Booking
	if err := config.DB.Where("id = ? AND deleted_at IS NULL", req.BookingID).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return false
	}
	if req.HotelID > 0 && req.HotelID != booking.HotelID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hotel does not match this booking"})
		return false
	}
	if !publicBookingBelongsToUser(booking, publicUser) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not own this booking"})
		return false
	}

	c.Set("active_hotel_id", booking.HotelID)
	c.Set("hotel_id", int(booking.HotelID))
	c.Request.Body = io.NopCloser(bytes.NewBuffer(body))
	return true
}

func PublicCreateRazorpayOrder(c *gin.Context) {
	if !preparePublicPaymentContext(c) {
		return
	}
	CreateRazorpayOrder(c)
}

func PublicVerifyRazorpayPayment(c *gin.Context) {
	if !preparePublicPaymentContext(c) {
		return
	}
	VerifyRazorpayPayment(c)
}

func PublicInitiatePhonePePayment(c *gin.Context) {
	if !preparePublicPaymentContext(c) {
		return
	}
	InitiatePhonePePayment(c)
}

func PublicVerifyPhonePePayment(c *gin.Context) {
	if !preparePublicPaymentContext(c) {
		return
	}
	VerifyPhonePePayment(c)
}

// PublicGetBooking returns booking details by booking code
func PublicGetBooking(c *gin.Context) {
	code := c.Param("code")
	publicUserID := c.GetUint("public_user_id")
	var publicUser models.PublicUser
	if publicUserID == 0 || config.DB.First(&publicUser, publicUserID).Error != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Login required"})
		return
	}

	var booking models.Booking
	if err := config.DB.Where("booking_code = ?", code).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}

	if !publicBookingBelongsToUser(booking, publicUser) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not own this booking"})
		return
	}

	var hotel models.Hotel
	config.DB.First(&hotel, booking.HotelID)
	var room models.Room
	config.DB.Preload("RoomType").First(&room, booking.RoomID)
	var guest models.Guest
	config.DB.First(&guest, booking.GuestID)

	gw := hotel.PaymentGateway
	if gw == "" {
		gw = "razorpay"
	}

	c.JSON(http.StatusOK, gin.H{
		"id":                      booking.ID,
		"booking_code":            booking.BookingCode,
		"status":                  booking.Status,
		"hotel_id":                hotel.ID,
		"hotel_name":              hotel.Name,
		"hotel_address":           hotel.Address1,
		"hotel_phone":             hotel.Phone,
		"hotel_email":             hotel.Email,
		"hotel_logo":              hotel.Logo,
		"hotel_gst_number":        hotel.GSTNumber,
		"payment_gateway":         gw,
		"razorpay_key_id":         hotel.RazorpayKeyID,
		"phonepe_merchant_id":     hotel.PhonePeMerchantID,
		"feature_online_payment":  hotel.FeatureOnlinePayment,
		"advance_payment_percent": hotel.AdvancePaymentPercent,
		"room_number":             room.RoomNumber,
		"room_type":               room.RoomType.Name,
		"room_type_details":       room.RoomType,
		"check_in":                booking.CheckInDate.Format("2006-01-02"),
		"check_out":               booking.CheckOutDate.Format("2006-01-02"),
		"nights":                  int(booking.CheckOutDate.Sub(booking.CheckInDate).Hours() / 24),
		"total_guests":            booking.TotalGuests,
		"special_requests":        booking.SpecialRequests,
		"total_amount":            booking.TotalAmount + booking.Tax,
		"base_rate":               booking.BaseRate,
		"tax":                     booking.Tax,
		"tax_rate":                booking.TaxRate,
		"discount":                booking.Discount,
		"guest_name":              guest.Name,
		"guest_phone":             guest.Phone,
		"guest_email":             guest.Email,
	})
}

// PublicDownloadBookingInvoicePDF streams the invoice PDF by public booking code.
func PublicDownloadBookingInvoicePDF(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	phone := strings.TrimSpace(c.Query("phone"))

	var booking models.Booking
	if err := config.DB.Where("booking_code = ? AND deleted_at IS NULL", code).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}

	if phone != "" {
		var guest models.Guest
		if err := config.DB.First(&guest, booking.GuestID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Guest not found"})
			return
		}
		if guest.Phone != phone {
			c.JSON(http.StatusForbidden, gin.H{"error": "Phone number does not match"})
			return
		}
	}

	streamInvoicePDFForBooking(c, booking.ID, booking.HotelID, nil)
}

// PublicGenerateBookingInvoice regenerates and persists invoice metadata by public booking code.
func PublicGenerateBookingInvoice(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	phone := strings.TrimSpace(c.Query("phone"))

	var booking models.Booking
	if err := config.DB.Where("booking_code = ? AND deleted_at IS NULL", code).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}

	if phone != "" {
		var guest models.Guest
		if err := config.DB.First(&guest, booking.GuestID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Guest not found"})
			return
		}
		if guest.Phone != phone {
			c.JSON(http.StatusForbidden, gin.H{"error": "Phone number does not match"})
			return
		}
	}

	invoiceData, err := calculateInvoiceDataLive(booking.ID, booking.HotelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	var stored *models.Invoice
	if err := config.DB.Transaction(func(tx *gorm.DB) error {
		var persistErr error
		stored, persistErr = persistInvoiceData(tx, booking.HotelID, invoiceData)
		return persistErr
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate invoice"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "Invoice generated successfully",
		"booking_code": booking.BookingCode,
		"invoice_id":   stored.ID,
		"invoice_no":   stored.InvoiceNo,
		"invoice_date": stored.InvoiceDate,
		"status":       stored.Status,
	})
}

// PublicUpdateBooking allows a guest to modify check-in/check-out dates or special requests
// for a reserved booking they own. Only "reserved" status bookings can be modified.
func PublicUpdateBooking(c *gin.Context) {
	publicUserID := c.GetUint("public_user_id")
	code := c.Param("code")

	var req struct {
		CheckIn     string `json:"check_in"`
		CheckOut    string `json:"check_out"`
		TotalGuests int    `json:"total_guests"`
		SpecialReqs string `json:"special_requests"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Load booking
	var booking models.Booking
	if err := config.DB.Where("booking_code = ?", code).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}

	// Only reserved bookings can be modified
	if booking.Status != "reserved" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only reserved bookings can be modified"})
		return
	}

	// Verify ownership via guest phone/email matching public user
	var publicUser models.PublicUser
	if err := config.DB.First(&publicUser, publicUserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	var guest models.Guest
	if err := config.DB.First(&guest, booking.GuestID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Guest not found"})
		return
	}
	if guest.Phone != publicUser.Phone && guest.Email != publicUser.Email {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not own this booking"})
		return
	}

	updates := map[string]interface{}{}

	// Update dates if provided
	if req.CheckIn != "" && req.CheckOut != "" {
		checkIn, err := time.Parse("2006-01-02", req.CheckIn)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "check_in must be yyyy-mm-dd"})
			return
		}
		checkOut, err := time.Parse("2006-01-02", req.CheckOut)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "check_out must be yyyy-mm-dd"})
			return
		}
		if !checkOut.After(checkIn) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "check_out must be after check_in"})
			return
		}
		if checkIn.Before(time.Now().Truncate(24 * time.Hour)) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "check_in cannot be in the past"})
			return
		}

		// Check room availability for new dates (excluding current booking)
		var conflict int64
		config.DB.Model(&models.Booking{}).
			Where("hotel_id = ? AND room_id = ? AND id != ? AND status NOT IN ? AND check_in_date < ? AND check_out_date > ?",
				booking.HotelID, booking.RoomID, booking.ID,
				[]string{"cancelled", "completed"}, checkOut, checkIn).
			Count(&conflict)
		if conflict > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "Room not available for the new dates"})
			return
		}

		nights := int(checkOut.Sub(checkIn).Hours() / 24)
		if nights < 1 {
			nights = 1
		}
		var room models.Room
		config.DB.Preload("RoomType").First(&room, booking.RoomID)
		var hotel models.Hotel
		config.DB.First(&hotel, booking.HotelID)

		// Load occupancy pricing
		var setting models.SystemSetting
		includedGuests := 1
		extraGuestPerNight := 0.0
		if err := config.DB.Where("hotel_id = ?", booking.HotelID).Take(&setting).Error; err == nil {
			if setting.IncludedGuests > 0 {
				includedGuests = setting.IncludedGuests
			}
			if setting.ExtraGuestPerNight > 0 {
				extraGuestPerNight = setting.ExtraGuestPerNight
			}
		}
		if room.RoomType.IncludedGuestsOverride != nil && *room.RoomType.IncludedGuestsOverride > 0 {
			includedGuests = *room.RoomType.IncludedGuestsOverride
		}
		if room.RoomType.ExtraGuestChargePerNightOverride != nil && *room.RoomType.ExtraGuestChargePerNightOverride >= 0 {
			extraGuestPerNight = *room.RoomType.ExtraGuestChargePerNightOverride
		}

		guestCount := req.TotalGuests
		if guestCount < 1 {
			guestCount = booking.TotalGuests
		}
		if guestCount < 1 {
			guestCount = 1
		}
		extraGuests := guestCount - includedGuests
		if extraGuests < 0 {
			extraGuests = 0
		}
		roomCharges := room.RoomType.BasePrice * float64(nights)
		extraCharges := float64(extraGuests) * extraGuestPerNight * float64(nights)
		totalAmount := roomCharges + extraCharges
		taxAmount := totalAmount * hotel.TaxPercent / 100

		updates["check_in_date"] = checkIn
		updates["check_out_date"] = checkOut
		updates["total_amount"] = totalAmount
		updates["tax"] = taxAmount
	}

	if req.TotalGuests > 0 {
		updates["total_guests"] = req.TotalGuests
	}
	if req.SpecialReqs != "" {
		updates["special_requests"] = req.SpecialReqs
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
		return
	}

	if err := config.DB.Model(&booking).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update booking"})
		return
	}

	// Invalidate cache
	utils.CacheDelPattern(fmt.Sprintf("availability:%d:*", booking.HotelID))

	utils.LogActivity(booking.HotelID, "PublicBooking", 0, fmt.Sprintf("Booking %s modified by guest", booking.BookingCode))

	c.JSON(http.StatusOK, gin.H{
		"message":      "Booking updated successfully",
		"booking_code": booking.BookingCode,
		"check_in":     booking.CheckInDate.Format("2006-01-02"),
		"check_out":    booking.CheckOutDate.Format("2006-01-02"),
	})
}
