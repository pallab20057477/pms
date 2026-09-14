package controllers

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/services"
	"hms/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"hms/workers"
)

func normalizeBookingStatus(status string) string {
	s := strings.ToLower(strings.TrimSpace(status))
	s = strings.ReplaceAll(s, "-", "_")
	s = strings.ReplaceAll(s, " ", "_")
	return s
}

func syncRoomStatusForBooking(tx *gorm.DB, hotelID uint, roomID uint) error {
	if roomID == 0 {
		return nil
	}
	var room models.Room
	if err := tx.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", roomID, hotelID).First(&room).Error; err != nil {
		return nil
	}

	// Do not override maintenance or blocked
	if room.Status == "maintenance" || room.Status == "blocked" {
		return nil
	}

	// Check if there is any active checked_in booking for this room
	var checkedInCount int64
	if err := tx.Model(&models.Booking{}).
		Where("hotel_id = ? AND room_id = ? AND status IN ? AND deleted_at IS NULL", hotelID, roomID, []string{"checked_in", "checked-in", "occupied"}).
		Count(&checkedInCount).Error; err != nil {
		return err
	}

	if checkedInCount > 0 {
		if room.Status != "occupied" {
			return tx.Model(&room).Update("status", "occupied").Error
		}
		return nil
	}

	// Check if there is any active reserved booking for this room
	var reservedCount int64
	if err := tx.Model(&models.Booking{}).
		Where("hotel_id = ? AND room_id = ? AND status = ? AND deleted_at IS NULL", hotelID, roomID, "reserved").
		Count(&reservedCount).Error; err != nil {
		return err
	}

	if reservedCount > 0 {
		if room.Status != "reserved" {
			return tx.Model(&room).Update("status", "reserved").Error
		}
		return nil
	}

	// If no active checked_in or reserved bookings, and room was occupied or reserved, revert to available
	if room.Status == "occupied" || room.Status == "reserved" {
		return tx.Model(&room).Update("status", "available").Error
	}

	return nil
}

func SyncHotelRoomStatuses(hotelID uint) {
	if hotelID == 0 {
		return
	}

	// 1. Reset all non-maintenance/blocked rooms to available
	config.DB.Exec(`
		UPDATE rooms 
		SET status = 'available' 
		WHERE hotel_id = ? 
		  AND status NOT IN ('maintenance', 'blocked') 
		  AND deleted_at IS NULL
	`, hotelID)

	// 2. Set rooms with reserved bookings to reserved
	config.DB.Exec(`
		UPDATE rooms 
		SET status = 'reserved' 
		WHERE hotel_id = ? 
		  AND status NOT IN ('maintenance', 'blocked') 
		  AND id IN (
			  SELECT room_id FROM bookings 
			  WHERE hotel_id = ? AND status = 'reserved' AND deleted_at IS NULL
		  ) 
		  AND deleted_at IS NULL
	`, hotelID, hotelID)

	// 3. Set rooms with checked-in bookings to occupied (overrides reserved)
	config.DB.Exec(`
		UPDATE rooms 
		SET status = 'occupied' 
		WHERE hotel_id = ? 
		  AND status NOT IN ('maintenance', 'blocked') 
		  AND id IN (
			  SELECT room_id FROM bookings 
			  WHERE hotel_id = ? AND status IN ('checked_in', 'checked-in', 'occupied') AND deleted_at IS NULL
		  ) 
		  AND deleted_at IS NULL
	`, hotelID, hotelID)
}

func parseIntOrZero(raw string) int {
	v, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0
	}
	return v
}

type CreateBookingRequest struct {
	GuestID             uint    `json:"guest_id" binding:"required"`
	RoomID              uint    `json:"room_id" binding:"required"`
	CheckInDate         string  `json:"check_in_date" binding:"required,datetime=2006-01-02"`
	CheckOutDate        string  `json:"check_out_date" binding:"required,datetime=2006-01-02"`
	RatePlan            string  `json:"rate_plan"`
	BaseRate            float64 `json:"base_rate" binding:"required,gte=0"`
	DiscountAmount      float64 `json:"discount_amount"`
	DiscountType        string  `json:"discount_type"`
	DiscountReason      string  `json:"discount_reason"`
	AdvancePayment      float64 `json:"advance_payment"`
	PaymentMode         string  `json:"payment_mode"`
	BookingSource       string  `json:"booking_source"`
	MarketSegment       string  `json:"market_segment"`
	ExpectedArrivalTime string  `json:"expected_arrival_time"`
	SpecialRequests     string  `json:"special_requests"`
	TotalGuests         int     `json:"total_guests"`
	CompanionDetails    string  `json:"companion_details"`
	CompanionDocuments  string  `json:"companion_documents"`
}

type UpdateBookingRequest struct {
	GuestID            uint    `json:"guest_id"`
	RoomID             uint    `json:"room_id"`
	CheckInDate        string  `json:"check_in_date"`
	CheckOutDate       string  `json:"check_out_date"`
	Status             string  `json:"status"`
	RatePlan           string  `json:"rate_plan"`
	BaseRate           float64 `json:"base_rate"`
	DiscountAmount     float64 `json:"discount_amount"`
	DiscountType       string  `json:"discount_type"`
	DiscountReason     string  `json:"discount_reason"`
	ApplyOn            string  `json:"apply_on"`
	AdvancePayment     float64 `json:"advance_payment"`
	SpecialRequests    string  `json:"special_requests"`
	TotalGuests        int     `json:"total_guests"`
	CompanionDetails   string  `json:"companion_details"`
	CompanionDocuments string  `json:"companion_documents"`
}

type CancelBookingRequest struct {
	CancellationReason string  `json:"cancellation_reason" binding:"required"`
	RefundOption       string  `json:"refund_option" binding:"required"`
	RefundAmount       float64 `json:"refund_amount"`
}

type bookingListRow struct {
	models.Booking
	GuestName  string  `json:"guest_name"`
	RoomNumber string  `json:"room_number"`
	RoomType   string  `json:"room_type"`
	BalanceDue float64 `json:"balance_due"`
}

type availableRoomRow struct {
	ID                         uint     `json:"id"`
	RoomNumber                 string   `json:"room_number"`
	RoomType                   string   `json:"room_type"`
	BasePrice                  float64  `json:"base_price"`
	PrimaryImage               string   `json:"primary_image"`
	IncludedGuests             int      `json:"included_guests"`
	ExtraGuestPerNight         float64  `json:"extra_guest_charge_per_night"`
	OccupancyOverrideActive    bool     `json:"occupancy_override_active"`
	IncludedGuestsOverride     *int     `json:"-"`
	ExtraGuestPerNightOverride *float64 `json:"-"`
}

func calculateBookingTotals(checkIn, checkOut time.Time, baseRate, discountAmount float64, totalGuests, includedGuests int, extraGuestPerNight float64) (float64, error) {
	nights := int(checkOut.Sub(checkIn).Hours() / 24)
	if nights <= 0 {
		return 0, fmt.Errorf("invalid date range")
	}
	extraGuests := totalGuests - includedGuests
	if extraGuests < 0 {
		extraGuests = 0
	}
	totalRoomCharges := float64(nights)*baseRate + (float64(nights) * float64(extraGuests) * extraGuestPerNight)
	totalAfterDiscount := totalRoomCharges - discountAmount
	if totalAfterDiscount < 0 {
		totalAfterDiscount = 0
	}
	return totalAfterDiscount, nil
}

// Calculates total booking price by applying nightly base price, seasonal adjustment, and occupancy for each night
func calculateBookingTotalsFull(hotelID uint, roomType *models.RoomType, checkIn, checkOut time.Time, baseRate, discountAmount float64, totalGuests int) (float64, error) {
	nights := int(checkOut.Sub(checkIn).Hours() / 24)
	if nights <= 0 {
		return 0, fmt.Errorf("invalid date range")
	}
	if roomType == nil {
		return 0, fmt.Errorf("room type is required")
	}

	// Occupancy policy
	includedGuests, extraGuestPerNight := occupancyPricingPolicyForRoom(hotelID, roomType)
	extraGuests := totalGuests - includedGuests
	if extraGuests < 0 {
		extraGuests = 0
	}

	// Use provided base rate, or fallback to room's base price
	basePrice := baseRate
	if basePrice <= 0 {
		basePrice = roomType.BasePrice
	}
	if basePrice <= 0 {
		basePrice = 1000.0 // Default fallback price
	}

	// In the Admin Extranet, what the Admin sees on the screen (BaseRate * Nights) is the authoritative price.
	// Applying hidden Seasonal Multipliers here breaks the UI contract and causes severe price mismatches.
	// Thus, we calculate strictly based on the agreed basePrice.
	totalRoomCharges := float64(nights)*basePrice + (float64(nights) * float64(extraGuests) * extraGuestPerNight)
	totalAfterDiscount := totalRoomCharges - discountAmount
	if totalAfterDiscount < 0 {
		totalAfterDiscount = 0
	}
	return totalAfterDiscount, nil
}

func occupancyPricingPolicy(hotelID uint) (int, float64) {
	// Safe defaults ensure extra occupants are billed even if settings are missing.
	includedGuests := 1
	extraGuestPerNight := 500.0
	var setting models.SystemSetting
	if err := config.DB.Where("hotel_id = ?", hotelID).Take(&setting).Error; err == nil {
		if setting.IncludedGuests > 0 {
			includedGuests = setting.IncludedGuests
		}
		if setting.ExtraGuestPerNight >= 0 {
			extraGuestPerNight = setting.ExtraGuestPerNight
		}
	}
	return includedGuests, extraGuestPerNight
}

func occupancyPricingPolicyForRoom(hotelID uint, roomType *models.RoomType) (int, float64) {
	includedGuests, extraGuestPerNight := occupancyPricingPolicy(hotelID)
	if roomType == nil {
		return includedGuests, extraGuestPerNight
	}
	if roomType.IncludedGuestsOverride != nil && *roomType.IncludedGuestsOverride > 0 {
		includedGuests = *roomType.IncludedGuestsOverride
	}
	if roomType.ExtraGuestChargePerNightOverride != nil && *roomType.ExtraGuestChargePerNightOverride >= 0 {
		extraGuestPerNight = *roomType.ExtraGuestChargePerNightOverride
	}
	return includedGuests, extraGuestPerNight
}

func effectiveHotelTaxRate(hotel models.Hotel) float64 {
	if hotel.TaxPercent < 0 {
		return 0
	}
	return hotel.TaxPercent
}

func activeSeasonalAdjustmentByRoomType(hotelID uint, forDate time.Time) (map[string]float64, error) {
	var rules []models.SeasonalPricingRule
	date := forDate.Format("2006-01-02")
	if err := config.DB.Where("hotel_id = ? AND active = ? AND valid_from <= ? AND valid_to >= ?", hotelID, true, date, date).Find(&rules).Error; err != nil {
		return nil, err
	}
	out := map[string]float64{}
	for _, r := range rules {
		key := strings.ToLower(strings.TrimSpace(r.RoomType))
		if key == "" {
			continue
		}
		out[key] = r.AdjustmentPercent
	}
	return out, nil
}

func uploadBookingDocument(c *gin.Context, file *multipart.FileHeader) string {
	f, ferr := file.Open()
	if ferr != nil {
		return ""
	}
	defer f.Close()

	if u, _, upErr := utils.UploadToServer(c.Request.Context(), f, filepath.Base(file.Filename), "bookings"); upErr == nil && u != "" {
		return u
	}

	uploads := utils.UploadDir("bookings")
	_ = os.MkdirAll(uploads, 0755)
	fname := fmt.Sprintf("booking_doc_%d_%s", utils.RandomInt(), filepath.Base(file.Filename))
	dst := filepath.Join(uploads, fname)
	if err := c.SaveUploadedFile(file, dst); err == nil {
		return "/uploads/bookings/" + fname
	}
	return ""
}

func parseCreateBookingRequest(c *gin.Context) (CreateBookingRequest, error) {
	var req CreateBookingRequest
	if strings.HasPrefix(c.ContentType(), "multipart/form-data") {
		req.GuestID = uint(parseIntOrZero(c.PostForm("guest_id")))
		req.RoomID = uint(parseIntOrZero(c.PostForm("room_id")))
		req.CheckInDate = strings.TrimSpace(c.PostForm("check_in_date"))
		req.CheckOutDate = strings.TrimSpace(c.PostForm("check_out_date"))
		req.RatePlan = strings.TrimSpace(c.PostForm("rate_plan"))
		req.BaseRate, _ = strconv.ParseFloat(strings.TrimSpace(c.PostForm("base_rate")), 64)
		req.DiscountAmount, _ = strconv.ParseFloat(strings.TrimSpace(c.PostForm("discount_amount")), 64)
		req.DiscountType = strings.TrimSpace(c.PostForm("discount_type"))
		req.DiscountReason = strings.TrimSpace(c.PostForm("discount_reason"))
		req.AdvancePayment, _ = strconv.ParseFloat(strings.TrimSpace(c.PostForm("advance_payment")), 64)
		req.PaymentMode = strings.TrimSpace(c.PostForm("payment_mode"))
		req.BookingSource = strings.TrimSpace(c.PostForm("booking_source"))
		req.MarketSegment = strings.TrimSpace(c.PostForm("market_segment"))
		req.ExpectedArrivalTime = strings.TrimSpace(c.PostForm("expected_arrival_time"))
		req.SpecialRequests = strings.TrimSpace(c.PostForm("special_requests"))
		req.TotalGuests = parseIntOrZero(c.PostForm("total_guests"))
		req.CompanionDetails = strings.TrimSpace(c.PostForm("companion_details"))
		req.CompanionDocuments = strings.TrimSpace(c.PostForm("companion_documents"))
		if req.GuestID == 0 || req.RoomID == 0 || req.CheckInDate == "" || req.CheckOutDate == "" {
			return req, fmt.Errorf("guest_id, room_id, check_in_date and check_out_date are required")
		}
		return req, nil
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		return req, err
	}
	return req, nil
}

func CreateBooking(c *gin.Context) {
	req, err := parseCreateBookingRequest(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TotalGuests < 1 {
		req.TotalGuests = 1
	}
	if req.TotalGuests > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "total_guests cannot exceed 20"})
		return
	}

	if strings.HasPrefix(c.ContentType(), "multipart/form-data") {
		docMap := map[string]string{}
		if mf, err := c.MultipartForm(); err == nil && mf != nil {
			if files, ok := mf.File["companion_documents"]; ok {
				indexes := mf.Value["companion_document_indexes"]
				for i, file := range files {
					if u := uploadBookingDocument(c, file); u != "" {
						key := strconv.Itoa(i)
						if i < len(indexes) {
							idx := strings.TrimSpace(indexes[i])
							if idx != "" {
								key = idx
							}
						}
						docMap[key] = u
					}
				}
			}
		}
		if len(docMap) > 0 {
			if encoded, encErr := json.Marshal(docMap); encErr == nil {
				req.CompanionDocuments = string(encoded)
			}
		}
	}
	hotelID := c.GetUint("active_hotel_id")
	var hotel models.Hotel
	if err := config.DB.Where("id = ? AND deleted_at IS NULL", hotelID).First(&hotel).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Hotel not found"})
		return
	}
	// parse dates and validate ordering
	checkIn, err := time.Parse("2006-01-02", req.CheckInDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_in_date must be yyyy-mm-dd"})
		return
	}
	checkOut, err := time.Parse("2006-01-02", req.CheckOutDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_out_date must be yyyy-mm-dd"})
		return
	}
	if !checkOut.After(checkIn) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_out_date must be after check_in_date"})
		return
	}
	if err := utils.EnsureBusinessDateOpen(hotelID, checkIn); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}
	if err := utils.EnsureBusinessDateOpen(hotelID, checkOut); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}
	if req.DiscountAmount > 0 && strings.TrimSpace(req.DiscountReason) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "discount_reason is required when discount is applied"})
		return
	}

	var createdBooking models.Booking
	var roomStatusChangeMessage string
	var roomTypeID uint

	// transactional creation with row-level locking on the room to prevent race conditions
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		// lock the room row and ensure it belongs to the active hotel and not soft-deleted
		var room models.Room
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", req.RoomID, hotelID).First(&room).Error; err != nil {
			return err
		}

		var roomType models.RoomType
		if err := tx.Where("id = ?", room.RoomTypeID).First(&roomType).Error; err != nil {
			return err
		}

		// Validate current room status against the requested check-in date
		today := time.Now().Truncate(24 * time.Hour)
		checkInDateOnly := checkIn.Truncate(24 * time.Hour)

		if room.Status == "blocked" {
			c.JSON(http.StatusConflict, gin.H{"error": "Room is blocked completely."})
			return gorm.ErrInvalidTransaction
		}
		if (room.Status == "dirty" || room.Status == "cleaning") && checkInDateOnly.Equal(today) {
			c.JSON(http.StatusConflict, gin.H{"error": "Room is currently dirty and cannot be checked into today."})
			return gorm.ErrInvalidTransaction
		}

		if room.Status == "maintenance" {
			if room.MaintenanceUntil != nil {
				if checkInDateOnly.Before(room.MaintenanceUntil.Truncate(24 * time.Hour)) {
					c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Room is in maintenance until %s", room.MaintenanceUntil.Format("2006-01-02"))})
					return gorm.ErrInvalidTransaction
				}
			} else {
				c.JSON(http.StatusConflict, gin.H{"error": "Room is in maintenance indefinitely."})
				return gorm.ErrInvalidTransaction
			}
		}

		// check for date overlap with active bookings (exclude cancelled, completed, checked_out)
		var conflict int64
		// overlap if existing.check_in_date < requested.check_out AND existing.check_out_date > requested.check_in
		excludedStatuses := []string{"cancelled", "completed", "checked_out"}
		if err := tx.Model(&models.Booking{}).Where("hotel_id = ? AND room_id = ? AND status NOT IN ? AND (check_in_date < ? AND check_out_date > ?)",
			hotelID, req.RoomID, excludedStatuses, checkOut, checkIn).Count(&conflict).Error; err != nil {
			return err
		}
		if conflict > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "Room not available for selected dates"})
			return gorm.ErrInvalidTransaction
		}

		totalAfterDiscount, calcErr := calculateBookingTotalsFull(hotelID, &roomType, checkIn, checkOut, req.BaseRate, req.DiscountAmount, req.TotalGuests)
		if calcErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": calcErr.Error()})
			return gorm.ErrInvalidTransaction
		}
		taxRate := effectiveHotelTaxRate(hotel)
		taxAmount := (totalAfterDiscount * taxRate) / 100.0

		b := models.Booking{
			BookingCode:         utils.GenerateBookingID(hotelID),
			HotelID:             hotelID,
			GuestID:             req.GuestID,
			RoomID:              &req.RoomID,
			RoomTypeID:          room.RoomTypeID,
			CheckInDate:         checkIn,
			CheckOutDate:        checkOut,
			Status:              "reserved",
			RatePlan:            req.RatePlan,
			BaseRate:            req.BaseRate,
			Discount:            req.DiscountAmount,
			DiscountType:        strings.TrimSpace(req.DiscountType),
			DiscountReason:      req.DiscountReason,
			TaxRate:             taxRate,
			Tax:                 taxAmount,
			TotalAmount:         totalAfterDiscount,
			AdvancePayment:      req.AdvancePayment,
			BookingSource:       req.BookingSource,
			MarketSegment:       req.MarketSegment,
			ExpectedArrivalTime: req.ExpectedArrivalTime,
			SpecialRequests:     req.SpecialRequests,
			TotalGuests:         req.TotalGuests,
			CompanionDetails:    strings.TrimSpace(req.CompanionDetails),
			CompanionDocuments:  strings.TrimSpace(req.CompanionDocuments),
		}

		if err := tx.Create(&b).Error; err != nil {
			return err
		}

		// Ensure clean state for the new booking ID (remove any stale orphan payments or folio items)
		tx.Where("booking_id = ?", b.ID).Delete(&models.Payment{})
		tx.Where("booking_id = ?", b.ID).Delete(&models.FolioItem{})

		// Auto-insert advance payment into the official payments ledger
		if b.AdvancePayment > 0 {
			paymentMode := strings.ToLower(strings.TrimSpace(req.PaymentMode))
			if paymentMode == "" {
				paymentMode = "cash"
			}
			now := time.Now()
			advancePaymentRec := models.Payment{
				BookingID: b.ID,
				Amount:    b.AdvancePayment,
				Method:    paymentMode,
				Reference: "Advance Payment on Booking",
				Status:    "success",
				PaidOn:    &now,
			}
			if err := tx.Create(&advancePaymentRec).Error; err != nil {
				return err
			}
		}

		if err := syncRoomStatusForBooking(tx, hotelID, *b.RoomID); err != nil {
			return err
		}

		createdBooking = b
		roomTypeID = room.RoomTypeID
		roomStatusChangeMessage = "Room " + room.RoomNumber + " status updated"
		return nil
	})

	if err != nil {
		if err == gorm.ErrInvalidTransaction {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create booking"})
		return
	}

	go workers.EnqueueInventorySyncTask(hotelID, roomTypeID, createdBooking.CheckInDate, createdBooking.CheckOutDate)

	if createdBooking.ID != 0 {
		services.DispatchChannelSyncForBooking(createdBooking.HotelID, createdBooking.ID, c.GetUint("admin_id"), "booking.created", map[string]interface{}{
			"booking_id":     createdBooking.ID,
			"booking_code":   createdBooking.BookingCode,
			"room_id":        createdBooking.RoomID,
			"check_in_date":  createdBooking.CheckInDate.Format("2006-01-02"),
			"check_out_date": createdBooking.CheckOutDate.Format("2006-01-02"),
			"status":         createdBooking.Status,
		})
		utils.LogActivity(createdBooking.HotelID, "Booking", c.GetUint("admin_id"), fmt.Sprintf("Booking %s created", createdBooking.BookingCode))
		if roomStatusChangeMessage != "" {
			utils.LogActivity(createdBooking.HotelID, "Room", c.GetUint("admin_id"), roomStatusChangeMessage)
		}

		// Generate OTP and credentials synchronously so the frontend can immediately fetch them
		otp := utils.GenerateOTP()
		qrToken := utils.RandomString(48)
		now := time.Now()
		otpRecord := models.BookingOTP{
			BookingID: createdBooking.ID,
			HotelID:   createdBooking.HotelID,
			OTP:       otp,
			QRToken:   qrToken,
			OTPExpiry: now.Add(24 * time.Hour),
			QRExpiry:  now.Add(24 * time.Hour),
		}
		if err := config.DB.Create(&otpRecord).Error; err != nil {
			log.Printf("[booking] failed to save OTP for booking %s: %v", createdBooking.BookingCode, err)
		}

		// Send booking confirmation email + WhatsApp asynchronously
		go func(b models.Booking, h models.Hotel, otpRec models.BookingOTP) {
			// Delay slightly so the frontend can finish attaching extra services (Folio Items) to this booking
			// before we calculate the final Grand Total for the confirmation email.
			time.Sleep(3 * time.Second)

			var guest models.Guest
			config.DB.Where("id = ?", b.GuestID).First(&guest)
			var room models.Room
			config.DB.Where("id = ?", b.RoomID).First(&room)

			publicBase := utils.PublicBaseURL(nil)
			guestQRURL := fmt.Sprintf("%s/checkin/qr?token=%s", publicBase, otpRec.QRToken)
			qrBase64, _ := utils.GenerateQRBase64WithSize(guestQRURL, 300)

			nights := int(b.CheckOutDate.Sub(b.CheckInDate).Hours() / 24)
			if nights < 1 {
				nights = 1
			}

			// Authoritative grand total — folio + tax (matches folio_controller and invoice logic)
			var folioItems []models.FolioItem
			config.DB.Where("booking_id = ?", b.ID).Find(&folioItems)
			var folioSum float64
			for _, item := range folioItems {
				folioSum += item.Amount
			}
			roomCharges := b.TotalAmount
			taxRate := b.TaxRate
			if taxRate < 0 {
				taxRate = 0
			}
			// Note: b.TotalAmount already has discount baked in, so don't subtract it again
			taxableSubtotal := roomCharges + folioSum
			if taxableSubtotal < 0 {
				taxableSubtotal = 0
			}
			tax := 0.0
			if taxRate > 0 {
				tax = taxableSubtotal * taxRate / 100
			}
			grandTotal := taxableSubtotal + tax

			var totalPaid float64
			config.DB.Model(&models.Payment{}).Where("booking_id = ? AND (status = 'success' OR status = '')", b.ID).Select("COALESCE(SUM(amount), 0)").Scan(&totalPaid)
			balanceDue := grandTotal - totalPaid
			if balanceDue < 0 {
				balanceDue = 0
			}

			utils.SendBookingConfirmation(utils.BookingNotifyData{
				GuestName:      guest.Name,
				GuestEmail:     guest.Email,
				GuestPhone:     guest.Phone,
				BookingCode:    b.BookingCode,
				RoomNumber:     room.RoomNumber,
				RoomType:       room.RoomType.Name,
				HotelName:      h.Name,
				HotelAddress:   h.Address1,
				CheckInDate:    b.CheckInDate.Format("02 Jan 2006"),
				CheckOutDate:   b.CheckOutDate.Format("02 Jan 2006"),
				Nights:         nights,
				TotalAmount:    grandTotal, // authoritative grand total
				OTP:            otpRec.OTP,
				QRBase64:       qrBase64,
				QRToken:        otpRec.QRToken,
				BaseRate:       b.BaseRate,
				DiscountAmount: b.Discount,
				RoomChargesNet: roomCharges,
				FolioTotal:     folioSum,
				Subtotal:       taxableSubtotal,
				TaxAmount:      tax,
				TaxRate:        taxRate,
				GrandTotal:     grandTotal,
				TotalPaid:      totalPaid,
				BalanceDue:     balanceDue,
				FolioItems:     folioItems,
			})
		}(createdBooking, hotel, otpRecord)

		c.JSON(http.StatusCreated, createdBooking)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Booking created"})
}

func ListBookings(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	page := 1
	pageSize := 20
	if v := c.Query("page"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			page = p
		}
	}
	if v := c.Query("page_size"); v != "" {
		if s, err := strconv.Atoi(v); err == nil && s > 0 && s <= 500 {
			pageSize = s
		}
	}

	// Support single status or comma-separated statuses (e.g., "reserved,checked_in,checked_out")
	statusParam := strings.TrimSpace(c.Query("status"))
	statuses := []string{}
	if statusParam != "" && statusParam != "all" {
		for _, s := range strings.Split(statusParam, ",") {
			if ns := normalizeBookingStatus(s); ns != "" {
				statuses = append(statuses, ns)
			}
		}
	}
	q := strings.TrimSpace(c.Query("q"))
	dateFrom := strings.TrimSpace(c.Query("date_from"))
	dateTo := strings.TrimSpace(c.Query("date_to"))
	overlapFrom := strings.TrimSpace(c.Query("overlap_from"))
	overlapTo := strings.TrimSpace(c.Query("overlap_to"))
	todayFlag := strings.TrimSpace(c.Query("today"))
	joinedGuestRoom := false

	query := config.DB.Model(&models.Booking{}).
		Where("bookings.hotel_id = ? AND bookings.deleted_at IS NULL", hotelID)

	// Filter by multiple statuses - exclude cancelled by default for calendar view
	if len(statuses) > 0 {
		query = query.Where("LOWER(REPLACE(bookings.status, '-', '_')) IN ?", statuses)
	}
	if q != "" {
		like := "%" + q + "%"
		query = query.Joins("LEFT JOIN guests ON guests.id = bookings.guest_id AND guests.deleted_at IS NULL").
			Joins("LEFT JOIN rooms ON rooms.id = bookings.room_id AND rooms.deleted_at IS NULL").
			Where("bookings.booking_code ILIKE ? OR guests.name ILIKE ? OR rooms.room_number ILIKE ?", like, like, like)
		joinedGuestRoom = true
	}
	if dateFrom != "" {
		query = query.Where("DATE(bookings.check_in_date) >= ?", dateFrom)
	}
	if dateTo != "" {
		query = query.Where("DATE(bookings.check_out_date) <= ?", dateTo)
	}
	if overlapFrom != "" && overlapTo != "" {
		// Only fetch bookings where check in is BEFORE the end of the month AND check out is AFTER the start of the month
		query = query.Where("DATE(bookings.check_in_date) < ? AND DATE(bookings.check_out_date) > ?", overlapTo, overlapFrom)
	}
	if todayFlag == "checkin" {
		query = query.Where("DATE(bookings.check_in_date) = CURRENT_DATE")
	}
	if todayFlag == "checkout" {
		query = query.Where("DATE(bookings.check_out_date) = CURRENT_DATE")
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count bookings"})
		return
	}

	// Fetch bookings with guest/room info using a flat struct to avoid
	// GORM scanner confusion caused by models.Booking having CreatedAt as int64
	type rawBookingRow struct {
		ID               uint       `gorm:"column:id"`
		BookingCode      string     `gorm:"column:booking_code"`
		GuestID          uint       `gorm:"column:guest_id"`
		RoomID           uint       `gorm:"column:room_id"`
		HotelID          uint       `gorm:"column:hotel_id"`
		CheckInDate      time.Time  `gorm:"column:check_in_date"`
		CheckOutDate     time.Time  `gorm:"column:check_out_date"`
		ActualCheckInAt  *time.Time `gorm:"column:actual_check_in_at"`
		ActualCheckOutAt *time.Time `gorm:"column:actual_check_out_at"`
		Status           string     `gorm:"column:status"`
		BaseRate         float64    `gorm:"column:base_rate"`
		Discount         float64    `gorm:"column:discount"`
		DiscountType     string     `gorm:"column:discount_type"`
		DiscountReason   string     `gorm:"column:discount_reason"`
		TaxRate          float64    `gorm:"column:tax_rate"`
		Tax              float64    `gorm:"column:tax"`
		TotalAmount      float64    `gorm:"column:total_amount"`
		AdvancePayment   float64    `gorm:"column:advance_payment"`
		TotalGuests      int        `gorm:"column:total_guests"`
		SpecialRequests  string     `gorm:"column:special_requests"`
		BookingSource    string     `gorm:"column:booking_source"`
		RatePlan         string     `gorm:"column:rate_plan"`
		GuestName        string     `gorm:"column:guest_name"`
		GuestPhone       string     `gorm:"column:guest_phone"`
		RoomNumber       string     `gorm:"column:room_number"`
		RoomType         string     `gorm:"column:room_type"`
	}

	var rawRows []rawBookingRow
	rowsQuery := query
	if !joinedGuestRoom {
		rowsQuery = rowsQuery.
			Joins("LEFT JOIN guests ON guests.id = bookings.guest_id AND guests.deleted_at IS NULL").
			Joins("LEFT JOIN rooms ON rooms.id = bookings.room_id AND rooms.deleted_at IS NULL")
	}
	if err := rowsQuery.
		Select(`bookings.id, bookings.booking_code, bookings.guest_id, bookings.room_id, bookings.hotel_id,
			bookings.check_in_date, bookings.check_out_date,
			bookings.actual_check_in_at, bookings.actual_check_out_at, bookings.status,
			bookings.base_rate, bookings.discount, bookings.discount_type, bookings.discount_reason,
			bookings.tax_rate, bookings.tax, bookings.total_amount,
			bookings.advance_payment, bookings.total_guests, bookings.special_requests,
			bookings.booking_source, bookings.rate_plan,
			COALESCE(guests.name, '') as guest_name,
			COALESCE(guests.phone, '') as guest_phone,
			COALESCE(rooms.room_number, '') as room_number,
			COALESCE(rooms.room_type, '') as room_type`).
		Order("bookings.id desc").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Scan(&rawRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bookings"})
		return
	}

	type BookingListBill struct {
		ID                 uint    `json:"id"`
		BookingCode        string  `json:"booking_code"`
		GuestID            uint    `json:"guest_id"`
		GuestName          string  `json:"guest_name"`
		GuestPhone         string  `json:"guest_phone"`
		RoomID             uint    `json:"room_id"`
		RoomNumber         string  `json:"room_number"`
		RoomType           string  `json:"room_type"`
		CheckInDate        string  `json:"check_in_date"`
		CheckOutDate       string  `json:"check_out_date"`
		ActualCheckInAt    *string `json:"actual_check_in_at"`
		ActualCheckOutAt   *string `json:"actual_check_out_at"`
		ActualCheckInAtMs  *int64  `json:"actual_check_in_at_ms,omitempty"`
		ActualCheckOutAtMs *int64  `json:"actual_check_out_at_ms,omitempty"`
		Status             string  `json:"status"`
		GrandTotal         float64 `json:"grand_total"`
		BaseRate           float64 `json:"base_rate"`
		Discount           float64 `json:"discount"`
		DiscountReason     string  `json:"discount_reason"`
		DiscountType       string  `json:"discount_type"`
		Tax                float64 `json:"tax"`
		Advance            float64 `json:"advance"`
		AdvancePayment     float64 `json:"advance_payment"`
		PaymentsTotal      float64 `json:"payments_total"`
		CurrentBalance     float64 `json:"current_balance"`
		TotalGuests        int     `json:"total_guests"`
		BookingSource      string  `json:"booking_source"`
		RatePlan           string  `json:"rate_plan"`
		SpecialRequests    string  `json:"special_requests"`
	}

	bookingIDs := make([]uint, 0, len(rawRows))
	roomIDs := make([]uint, 0, len(rawRows))
	for _, r := range rawRows {
		bookingIDs = append(bookingIDs, r.ID)
		if r.TotalAmount <= 0 {
			roomIDs = append(roomIDs, r.RoomID)
		}
	}

	roomPrices := make(map[uint]float64)
	if len(roomIDs) > 0 {
		var rooms []models.Room
		config.DB.Preload("RoomType").Where("id IN ?", roomIDs).Select("id, room_type_id").Find(&rooms)
		for _, r := range rooms {
			roomPrices[r.ID] = r.RoomType.BasePrice
		}
	}

	type bulkSum struct {
		BookingID uint
		Total     float64
	}
	folioMap := make(map[uint]float64)
	if len(bookingIDs) > 0 {
		var sums []bulkSum
		config.DB.Model(&models.FolioItem{}).Select("booking_id, COALESCE(SUM(amount),0) as total").Where("booking_id IN ?", bookingIDs).Group("booking_id").Scan(&sums)
		for _, s := range sums {
			folioMap[s.BookingID] = s.Total
		}
	}

	paymentMap := make(map[uint]float64)
	if len(bookingIDs) > 0 {
		var sums []bulkSum
		config.DB.Table("payments").Select("booking_id, COALESCE(SUM(amount),0) as total").Where("booking_id IN ? AND status = ? AND deleted_at IS NULL", bookingIDs, "success").Group("booking_id").Scan(&sums)
		for _, s := range sums {
			paymentMap[s.BookingID] = s.Total
		}
	}

	var result []BookingListBill
	for _, row := range rawRows {
		totalAmount := row.TotalAmount
		if totalAmount <= 0 {
			basePrice, ok := roomPrices[row.RoomID]
			if !ok || basePrice <= 0 {
				basePrice = 1000.0
			}
			nights := int(row.CheckOutDate.Sub(row.CheckInDate).Hours() / 24)
			if nights <= 0 {
				nights = 1
			}
			totalAmount = float64(nights) * basePrice
		}

		folioSum := folioMap[row.ID]
		paymentsTotal := paymentMap[row.ID]

		taxRate := row.TaxRate
		if taxRate < 0 {
			taxRate = 0
		}
		taxableSubtotal := totalAmount + folioSum
		if taxableSubtotal < 0 {
			taxableSubtotal = 0
		}
		tax := 0.0
		if row.Tax > 0 {
			tax = row.Tax
			if taxRate > 0 && folioSum > 0 {
				tax += (folioSum * taxRate) / 100
			}
		} else {
			if taxRate > 0 {
				tax = taxableSubtotal * taxRate / 100
			}
		}
		grandTotal := taxableSubtotal + tax
		currentBalance := grandTotal - paymentsTotal
		if strings.ToLower(strings.ReplaceAll(strings.TrimSpace(row.Status), "-", "_")) == "cancelled" {
			currentBalance = 0
		}

		var actualCheckInAtPtr, actualCheckOutAtPtr *string
		var actualCheckInAtMsPtr, actualCheckOutAtMsPtr *int64
		if row.ActualCheckInAt != nil {
			s := row.ActualCheckInAt.UTC().Format(time.RFC3339)
			ms := row.ActualCheckInAt.UnixMilli()
			actualCheckInAtPtr = &s
			actualCheckInAtMsPtr = &ms
		}
		if row.ActualCheckOutAt != nil {
			s := row.ActualCheckOutAt.UTC().Format(time.RFC3339)
			ms := row.ActualCheckOutAt.UnixMilli()
			actualCheckOutAtPtr = &s
			actualCheckOutAtMsPtr = &ms
		}

		result = append(result, BookingListBill{
			ID:                 row.ID,
			BookingCode:        row.BookingCode,
			GuestID:            row.GuestID,
			GuestName:          row.GuestName,
			GuestPhone:         row.GuestPhone,
			RoomID:             row.RoomID,
			RoomNumber:         row.RoomNumber,
			RoomType:           row.RoomType,
			CheckInDate:        row.CheckInDate.Format("2006-01-02"),
			CheckOutDate:       row.CheckOutDate.Format("2006-01-02"),
			ActualCheckInAt:    actualCheckInAtPtr,
			ActualCheckOutAt:   actualCheckOutAtPtr,
			ActualCheckInAtMs:  actualCheckInAtMsPtr,
			ActualCheckOutAtMs: actualCheckOutAtMsPtr,
			Status:             row.Status,
			GrandTotal:         grandTotal,
			BaseRate:           row.BaseRate,
			Discount:           row.Discount,
			DiscountReason:     row.DiscountReason,
			DiscountType:       row.DiscountType,
			Tax:                tax,
			Advance:            row.AdvancePayment,
			AdvancePayment:     row.AdvancePayment,
			PaymentsTotal:      paymentsTotal,
			CurrentBalance:     currentBalance,
			TotalGuests:        row.TotalGuests,
			BookingSource:      row.BookingSource,
			RatePlan:           row.RatePlan,
			SpecialRequests:    row.SpecialRequests,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": result, "total": total, "page": page, "page_size": pageSize})
}

func GetBooking(c *gin.Context) {
	var b models.Booking
	hotelID := c.GetUint("active_hotel_id")
	idParam := strings.TrimSpace(c.Param("id"))

	query := config.DB.Preload("Guest").Preload("Room").Preload("Room.RoomType").Preload("RoomType").Where("hotel_id = ? AND deleted_at IS NULL", hotelID)
	if strings.HasPrefix(idParam, "BKG-") {
		query = query.Where("booking_code = ?", idParam)
	} else {
		query = query.Where("id = ?", idParam)
	}

	if err := query.First(&b).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}

	var roomNumber string
	var roomTypeName string
	if b.Room != nil {
		roomNumber = b.Room.RoomNumber
		roomTypeName = b.Room.RoomType.Name
	}
	if roomTypeName == "" && b.RoomType.Name != "" {
		roomTypeName = b.RoomType.Name
	}

	c.JSON(http.StatusOK, gin.H{
		"booking":           b,
		"guest":             b.Guest,
		"room_number":       roomNumber,
		"room_type":         roomTypeName,
		"room_type_details": b.RoomType,
	})
}

func UpdateBooking(c *gin.Context) {
	var b models.Booking
	hotelID := c.GetUint("active_hotel_id")
	if err := config.DB.Where("id = ? AND hotel_id = ?", c.Param("id"), hotelID).First(&b).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}
	var req UpdateBookingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.CheckInDate == "" {
		req.CheckInDate = b.CheckInDate.Format("2006-01-02")
	}
	if req.CheckOutDate == "" {
		req.CheckOutDate = b.CheckOutDate.Format("2006-01-02")
	}
	if req.GuestID == 0 {
		req.GuestID = b.GuestID
	}
	if req.RoomID == 0 && b.RoomID != nil {
		req.RoomID = *b.RoomID
	}
	if req.BaseRate <= 0 {
		req.BaseRate = b.BaseRate
	}
	if strings.TrimSpace(req.RatePlan) == "" {
		req.RatePlan = b.RatePlan
	}
	if req.DiscountAmount == 0 {
		req.DiscountAmount = b.Discount
	}
	if strings.TrimSpace(req.DiscountType) == "" {
		req.DiscountType = b.DiscountType
	}
	if strings.TrimSpace(req.DiscountReason) == "" {
		req.DiscountReason = b.DiscountReason
	}
	if req.AdvancePayment == 0 {
		req.AdvancePayment = b.AdvancePayment
	}
	if strings.TrimSpace(req.SpecialRequests) == "" {
		req.SpecialRequests = b.SpecialRequests
	}
	if req.TotalGuests <= 0 {
		req.TotalGuests = b.TotalGuests
	}
	if req.TotalGuests <= 0 {
		req.TotalGuests = 1
	}
	if req.TotalGuests > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "total_guests cannot exceed 20"})
		return
	}
	if strings.TrimSpace(req.CompanionDetails) == "" {
		req.CompanionDetails = b.CompanionDetails
	}
	if strings.TrimSpace(req.CompanionDocuments) == "" {
		req.CompanionDocuments = b.CompanionDocuments
	}
	if req.DiscountAmount > 0 && strings.TrimSpace(req.DiscountReason) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "discount_reason is required when discount is applied"})
		return
	}

	// Validate status if provided
	if req.Status != "" {
		validStatuses := []string{"reserved", "checked_in", "occupied", "checked_out", "completed", "cancelled"}
		statusLower := normalizeBookingStatus(req.Status)
		isValid := false
		for _, v := range validStatuses {
			if statusLower == v {
				isValid = true
				break
			}
		}
		if !isValid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status. Must be one of: reserved, checked_in, occupied, checked_out, completed, cancelled"})
			return
		}
	}

	checkIn, err := time.Parse("2006-01-02", req.CheckInDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_in_date must be yyyy-mm-dd"})
		return
	}
	checkOut, err := time.Parse("2006-01-02", req.CheckOutDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_out_date must be yyyy-mm-dd"})
		return
	}
	if !checkOut.After(checkIn) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_out_date must be after check_in_date"})
		return
	}
	if err := utils.EnsureBusinessDateOpen(hotelID, b.CheckInDate); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}
	if err := utils.EnsureBusinessDateOpen(hotelID, checkIn); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}
	if err := utils.EnsureBusinessDateOpen(hotelID, checkOut); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}
	var hotel models.Hotel
	if err := config.DB.Where("id = ? AND deleted_at IS NULL", hotelID).First(&hotel).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Hotel not found"})
		return
	}

	err = config.DB.Transaction(func(tx *gorm.DB) error {
		var room models.Room
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", req.RoomID, hotelID).First(&room).Error; err != nil {
			return err
		}
		var roomType models.RoomType
		if err := tx.Where("id = ?", room.RoomTypeID).First(&roomType).Error; err != nil {
			return err
		}
		if room.Status == "blocked" {
			c.JSON(http.StatusConflict, gin.H{"error": "Room is blocked completely."})
			return gorm.ErrInvalidTransaction
		}
		
		today := time.Now().Truncate(24 * time.Hour)
		checkInDateOnly := checkIn.Truncate(24 * time.Hour)
		
		if (room.Status == "dirty" || room.Status == "cleaning") && checkInDateOnly.Equal(today) {
			c.JSON(http.StatusConflict, gin.H{"error": "Room is currently dirty and cannot be checked into today."})
			return gorm.ErrInvalidTransaction
		}

		if room.Status == "maintenance" {
			if room.MaintenanceUntil != nil {
				if checkInDateOnly.Before(room.MaintenanceUntil.Truncate(24 * time.Hour)) {
					c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Room is in maintenance until %s", room.MaintenanceUntil.Format("2006-01-02"))})
					return gorm.ErrInvalidTransaction
				}
			} else {
				c.JSON(http.StatusConflict, gin.H{"error": "Room is in maintenance indefinitely."})
				return gorm.ErrInvalidTransaction
			}
		}

		var conflict int64
		// Check for conflicts with other bookings (exclude cancelled, completed, checked_out)
		if err := tx.Model(&models.Booking{}).Where("hotel_id = ? AND room_id = ? AND id <> ? AND status NOT IN ? AND (check_in_date < ? AND check_out_date > ?)",
			hotelID, req.RoomID, b.ID, []string{"cancelled", "completed", "checked_out"}, checkOut, checkIn).Count(&conflict).Error; err != nil {
			return err
		}
		if conflict > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "Room not available for selected dates"})
			return gorm.ErrInvalidTransaction
		}

		totalAmount, calcErr := calculateBookingTotalsFull(hotelID, &roomType, checkIn, checkOut, req.BaseRate, req.DiscountAmount, req.TotalGuests)
		if calcErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date range"})
			return gorm.ErrInvalidTransaction
		}
		taxRate := effectiveHotelTaxRate(hotel)
		taxAmount := (totalAmount * taxRate) / 100.0

		updates := map[string]interface{}{
			"guest_id":            req.GuestID,
			"room_id":             &req.RoomID,
			"room_type_id":        room.RoomTypeID,
			"check_in_date":       checkIn,
			"check_out_date":      checkOut,
			"rate_plan":           strings.TrimSpace(req.RatePlan),
			"base_rate":           req.BaseRate,
			"discount":            req.DiscountAmount,
			"discount_type":       strings.TrimSpace(req.DiscountType),
			"discount_reason":     strings.TrimSpace(req.DiscountReason),
			"apply_on":            strings.TrimSpace(req.ApplyOn),
			"tax_rate":            taxRate,
			"tax":                 taxAmount,
			"advance_payment":     req.AdvancePayment,
			"special_requests":    strings.TrimSpace(req.SpecialRequests),
			"total_guests":        req.TotalGuests,
			"companion_details":   strings.TrimSpace(req.CompanionDetails),
			"companion_documents": strings.TrimSpace(req.CompanionDocuments),
			"total_amount":        totalAmount,
		}
		oldRoomID := b.RoomID
		// Only update status if a valid status is provided
		if req.Status != "" {
			updates["status"] = strings.ToLower(strings.TrimSpace(req.Status))
		}
		if err := tx.Model(&b).Updates(updates).Error; err != nil {
			return err
		}
		if err := syncRoomStatusForBooking(tx, hotelID, req.RoomID); err != nil {
			return err
		}
		if oldRoomID != nil && *oldRoomID != req.RoomID {
			if err := syncRoomStatusForBooking(tx, hotelID, *oldRoomID); err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		if err == gorm.ErrInvalidTransaction {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update booking"})
		return
	}
	utils.LogActivity(b.HotelID, "Booking", c.GetUint("admin_id"), fmt.Sprintf("Booking %s updated", b.BookingCode))
	services.DispatchChannelSyncForBooking(b.HotelID, b.ID, c.GetUint("admin_id"), "booking.updated", map[string]interface{}{
		"booking_id":   b.ID,
		"booking_code": b.BookingCode,
		"status":       b.Status,
	})
	
	var roomTypeID uint
	config.DB.Model(&models.RoomType{}).Where("id = ?", b.RoomTypeID).Select("id").Scan(&roomTypeID)
	go workers.EnqueueInventorySyncTask(b.HotelID, roomTypeID, b.CheckInDate, b.CheckOutDate)

	c.JSON(http.StatusOK, gin.H{"message": "Booking updated"})
}

func CancelBooking(c *gin.Context) {
	var b models.Booking
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	var req CancelBookingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	option := strings.ToLower(strings.TrimSpace(req.RefundOption))
	if option != "none" && option != "partial" && option != "full" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refund_option must be one of: none, partial, full"})
		return
	}
	if option != "none" && req.RefundAmount < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refund_amount must be >= 0"})
		return
	}
	if err := config.DB.Where("id = ? AND hotel_id = ?", c.Param("id"), hotelID).First(&b).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}
	if err := utils.EnsureBusinessDateOpen(hotelID, b.CheckInDate); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}
	if option == "full" {
		req.RefundAmount = b.AdvancePayment
	}

	if err := config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&b).Updates(map[string]interface{}{
			"status":              "cancelled",
			"cancellation_reason": strings.TrimSpace(req.CancellationReason),
			"refund_option":       option,
			"refund_amount":       req.RefundAmount,
		}).Error; err != nil {
			return err
		}

		if b.RoomID != nil {
			if err := syncRoomStatusForBooking(tx, hotelID, *b.RoomID); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel booking"})
		return
	}

	utils.LogActivity(b.HotelID, "Booking", adminID, fmt.Sprintf("Booking %s cancelled", b.BookingCode))
	services.DispatchChannelSyncForBooking(b.HotelID, b.ID, adminID, "booking.cancelled", map[string]interface{}{
		"booking_id":   b.ID,
		"booking_code": b.BookingCode,
		"status":       "cancelled",
		"reason":       strings.TrimSpace(req.CancellationReason),
	})

	// Enqueue inventory sync
	var roomTypeID uint
	config.DB.Model(&models.RoomType{}).Where("id = ?", b.RoomTypeID).Select("id").Scan(&roomTypeID)
	go workers.EnqueueInventorySyncTask(b.HotelID, roomTypeID, b.CheckInDate, b.CheckOutDate)

	c.JSON(http.StatusOK, gin.H{"message": "Booking cancelled"})
}

func CheckAvailability(c *gin.Context) {
	roomID := c.Query("room_id")
	checkIn := c.Query("check_in_date")
	checkOut := c.Query("check_out_date")
	roomType := strings.TrimSpace(c.Query("room_type"))
	excludeBookingID := c.Query("exclude_booking_id")
	if checkIn == "" || checkOut == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_in_date and check_out_date are required"})
		return
	}
	// parse dates
	ci, err := time.Parse("2006-01-02", checkIn)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_in_date must be yyyy-mm-dd"})
		return
	}
	co, err := time.Parse("2006-01-02", checkOut)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "check_out_date must be yyyy-mm-dd"})
		return
	}
	hotelID := c.GetUint("active_hotel_id")

	cacheKey := fmt.Sprintf("availability:%d:admin:%s:%s:%s:%s:%s", hotelID, checkIn, checkOut, roomType, roomID, excludeBookingID)
	var cachedResp map[string]interface{}
	if utils.CacheGet(cacheKey, &cachedResp) {
		c.JSON(http.StatusOK, cachedResp)
		return
	}

	if roomID != "" {
		// backward-compatible single-room availability check
		var room models.Room
		if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", roomID, hotelID).First(&room).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		today := time.Now().Truncate(24 * time.Hour)
		ciDateOnly := ci.Truncate(24 * time.Hour)

		var resp map[string]interface{}
		if room.Status == "blocked" {
			resp = gin.H{"available": false, "reason": "blocked"}
		} else if (room.Status == "dirty" || room.Status == "cleaning") && ciDateOnly.Equal(today) {
			resp = gin.H{"available": false, "reason": "dirty"}
		} else if room.Status == "maintenance" && (room.MaintenanceUntil == nil || ciDateOnly.Before(room.MaintenanceUntil.Truncate(24*time.Hour))) {
			resp = gin.H{"available": false, "reason": "maintenance"}
		} else {
			var conflict int64
			conflictQuery := config.DB.Model(&models.Booking{}).Where("hotel_id = ? AND room_id = ? AND status NOT IN ? AND (check_in_date < ? AND check_out_date > ?)",
				hotelID, roomID, []string{"cancelled", "completed", "checked_out"}, co, ci)
			
			if excludeBookingID != "" {
				conflictQuery = conflictQuery.Where("id != ?", excludeBookingID)
			}

				conflictQuery.Count(&conflict)
				resp = gin.H{"available": conflict == 0}
			}

			utils.CacheSet(cacheKey, resp, 1*time.Minute)
			c.JSON(http.StatusOK, resp)
			return
		}

		today := time.Now().Truncate(24 * time.Hour)
		ciDateOnly := ci.Truncate(24 * time.Hour)

		var excludedRoomID uint
		if excludeBookingID != "" {
			config.DB.Model(&models.Booking{}).Where("id = ?", excludeBookingID).Pluck("room_id", &excludedRoomID)
		}

		query := config.DB.Model(&models.Room{}).
			Joins("LEFT JOIN room_types rt ON rt.id = rooms.room_type_id AND rt.deleted_at IS NULL").
			Where("rooms.hotel_id = ?", hotelID).
			Where("LOWER(rooms.status) != 'blocked' OR rooms.id = ?", excludedRoomID)

		if ciDateOnly.Equal(today) {
			query = query.Where("LOWER(rooms.status) NOT IN ('dirty', 'cleaning') OR rooms.id = ?", excludedRoomID)
		}

		// If it's in maintenance, it must have an end date that is <= check-in date
		query = query.Where("(LOWER(rooms.status) != 'maintenance' OR (LOWER(rooms.status) = 'maintenance' AND maintenance_until IS NOT NULL AND maintenance_until <= ?) OR rooms.id = ?)", ciDateOnly, excludedRoomID)
		if roomType != "" {
			query = query.Where("rt.name = ?", roomType)
		}

		var rooms []availableRoomRow
		err = query.
			Select(`
				rooms.id,
				rooms.room_number,
				rt.name AS room_type,
				rt.base_price,
				rt.included_guests_override,
				rt.extra_guest_charge_per_night_override,
				CASE
					WHEN rt.included_guests_override IS NOT NULL AND rt.extra_guest_charge_per_night_override IS NOT NULL THEN true
					ELSE false
				END AS occupancy_override_active,
				COALESCE((
					SELECT ri.url
					FROM room_images ri
					WHERE ri.room_type_id = rt.id AND ri.deleted_at IS NULL
					ORDER BY ri.is_primary DESC, ri."order" ASC, ri.id ASC
					LIMIT 1
				), rt.image, '') AS primary_image
			`).
			Where(`NOT EXISTS (
				SELECT 1 FROM bookings b
				WHERE b.room_id = rooms.id
				AND b.hotel_id = rooms.hotel_id
				AND b.deleted_at IS NULL
				AND LOWER(b.status) NOT IN ('cancelled', 'completed', 'checked_out')
				AND (b.check_in_date < ? AND b.check_out_date > ?)
				AND (CAST(? AS TEXT) = '' OR CAST(b.id AS TEXT) != ?)
			)`, co, ci, excludeBookingID, excludeBookingID).
			Order("rooms.room_number asc").
			Scan(&rooms).Error

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch available rooms"})
			return
		}

		adjustments, adjErr := activeSeasonalAdjustmentByRoomType(hotelID, ci)
		if adjErr == nil {
			for i := range rooms {
				key := strings.ToLower(strings.TrimSpace(rooms[i].RoomType))
				if pct, ok := adjustments[key]; ok {
					newPrice := rooms[i].BasePrice * (1.0 + pct/100.0)
					if newPrice < 0 {
						newPrice = 0
					}
					rooms[i].BasePrice = math.Round(newPrice*100) / 100
				}
			}
		}
	defaultIncludedGuests, defaultExtraGuestPerNight := occupancyPricingPolicy(hotelID)
	for i := range rooms {
		rooms[i].IncludedGuests = defaultIncludedGuests
		rooms[i].ExtraGuestPerNight = defaultExtraGuestPerNight
		if rooms[i].IncludedGuestsOverride != nil && *rooms[i].IncludedGuestsOverride > 0 {
			rooms[i].IncludedGuests = *rooms[i].IncludedGuestsOverride
		}
		if rooms[i].ExtraGuestPerNightOverride != nil && *rooms[i].ExtraGuestPerNightOverride >= 0 {
			rooms[i].ExtraGuestPerNight = *rooms[i].ExtraGuestPerNightOverride
		}
	}

	resp := gin.H{"items": rooms}
	utils.CacheSet(cacheKey, resp, 1*time.Minute)
	c.JSON(http.StatusOK, resp)
}

func ListTodayBookings(c *gin.Context) {
	c.Request.URL.RawQuery = "today=checkin"
	ListBookings(c)
}

// Handles: Check availability, Create booking, Edit booking, Cancel booking, List bookings
