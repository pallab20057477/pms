package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"gorm.io/gorm"
	// "gorm.io/gorm/clause"
)

// -----------------------------------------------------------------------------
// 1. UPDATE INVENTORY TO OTA (BookingHotel Channel Manager)
// -----------------------------------------------------------------------------

type BookingHotelInventoryHeader struct {
	Username string `json:"Username"`
	Password string `json:"Password"`
}

type BookingHotelInventoryRequest struct {
	Header     BookingHotelInventoryHeader `json:"Header"`
	HotelID    string                      `json:"HotelId"`
	RoomTypeID string                      `json:"RoomTypeId"`
	InfoDays   string                      `json:"InfoDays"`   // Format: DD/MM/YYYY|DD/MM/YYYY|Inventory
}

type BookingHotelInventoryResponse struct {
	Status  string `json:"Status"`
	Success string `json:"Success"`
}

// PushInventoryToBookingHotel sends live room availability / inventory counts to BookingHotel OTA
func PushInventoryToBookingHotel(hotelID uint, roomTypeID uint, fromDate, toDate time.Time, inventoryCount int) (*BookingHotelInventoryResponse, error) {
	if inventoryCount < 0 {
		inventoryCount = 0
	}

	// InfoDays format: DD/MM/YYYY|DD/MM/YYYY|Inventory
	infoDays := fmt.Sprintf("%s|%s|%d",
		fromDate.Format("02/01/2006"),
		toDate.Format("02/01/2006"),
		inventoryCount,
	)

	var partner models.PartnerIntegration
	if err := config.DB.Where("partner_name = ?", "BookingHotel").First(&partner).Error; err != nil {
		return nil, fmt.Errorf("BookingHotel partner integration not found in database")
	}
	
	apiUrl := partner.InventoryURL
	if apiUrl == "" {
		apiUrl = "https://api.bookinghotel.co.in/api/Inventory/UpdateInventory"
	}

	// Fetch Mapped OTA Hotel Credentials
	var hotelMapping models.ChannelHotelMapping
	if err := config.DB.Where("hotel_id = ? AND partner_integration_id = ?", hotelID, partner.ID).First(&hotelMapping).Error; err != nil {
		return nil, fmt.Errorf("Hotel %d is not mapped to BookingHotel (missing ChannelHotelMapping)", hotelID)
	}
	if hotelMapping.OTAUsername == "" || hotelMapping.OTAPassword == "" {
		return nil, fmt.Errorf("Hotel %d is mapped but missing OTAUsername/OTAPassword credentials for BookingHotel", hotelID)
	}

	// Fetch Mapped OTA Room Type
	var roomMapping models.ChannelRoomMapping
	if err := config.DB.Where("room_type_id = ? AND partner_integration_id = ?", roomTypeID, partner.ID).First(&roomMapping).Error; err != nil {
		return nil, fmt.Errorf("RoomType %d is not mapped to BookingHotel (missing ChannelRoomMapping)", roomTypeID)
	}

	payload := BookingHotelInventoryRequest{
		Header: BookingHotelInventoryHeader{
			Username: strings.TrimSpace(hotelMapping.OTAUsername),
			Password: strings.TrimSpace(hotelMapping.OTAPassword),
		},
		HotelID:    strings.TrimSpace(hotelMapping.OTAHotelCode),
		RoomTypeID: strings.TrimSpace(roomMapping.OTARoomTypeCode),
		InfoDays:   infoDays,
	}

	reqBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal inventory request: %w", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(http.MethodPost, apiUrl, bytes.NewBuffer(reqBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create inventory HTTP request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("BookingHotel inventory API call failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read BookingHotel inventory response: %w", err)
	}

	var res BookingHotelInventoryResponse
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		// Fallback for non-JSON or partial response
		if resp.StatusCode == http.StatusOK {
			return &BookingHotelInventoryResponse{
				Status:  "Success",
				Success: string(bodyBytes),
			}, nil
		}
		return nil, fmt.Errorf("invalid response from BookingHotel API (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return &res, nil
}

// -----------------------------------------------------------------------------
// 2. PUSH BOOKING FROM OTA TO PMS (Incoming Webhook / Push API)
// -----------------------------------------------------------------------------

type BookingHotelAuthentication struct {
	Password string `json:"Password"`
	UserName string `json:"UserName"`
}

type BookingHotelGuestInfo struct {
	AddressLine string `json:"AddressLine"`
	ArrivalDate string `json:"ArrivalDate"`
	CityName    string `json:"CityName"`
	Country     string `json:"Country"`
	EmailID     string `json:"EmailID"`
	GivenName   string `json:"GivenName"`
	MiddleName  string `json:"MiddleName"`
	Nameprefix  string `json:"Nameprefix"`
	Nationality string `json:"Nationality"`
	PhoneNumber string `json:"PhoneNumber"`
	PostalCode  string `json:"PostalCode"`
	StateCode   string `json:"StateCode"`
	Surname     string `json:"Surname"`
}

type BookingHotelReservationStay struct {
	AdultCount            int                     `json:"AdultCount"`
	ArrivalDate           string                  `json:"ArrivalDate"` // YYYY-MM-DD
	BookingCreateDateTime string                  `json:"BookingCreateDateTime"`
	BookingMode           string                  `json:"BookingMode"`
	BookingStatus         string                  `json:"BookingStatus"`
	BookingStayUniqID     string                  `json:"BookingStayUniqId"`
	CancelRefundAmount    interface{}             `json:"CancelRefundAmount"` // changed to interface{} to handle ""
	CancellationPolicy    string                  `json:"CancellationPolicy"`
	ChannelBookingUniqID  string                  `json:"ChannelBookingUniqID"`
	ChannelChainID        string                  `json:"ChannelChainID"`
	ChildCount            int                     `json:"ChildCount"`
	CommissionAmount      interface{}             `json:"CommissionAmount"`
	CurrencyCode          string                  `json:"CurrencyCode"`
	DayDuration           int                     `json:"DayDuration"`
	DepartureDate         string                  `json:"DepartureDate"` // YYYY-MM-DD
	GstCountIsPerRoom     bool                    `json:"GstCountIsPerRoom"`
	GuestInfo             []BookingHotelGuestInfo `json:"GuestInfo"`
	GuestName             string                  `json:"GuestName"`
	AddressLine           string                  `json:"AddressLine"`
	CityName              string                  `json:"CityName"`
	Country               string                  `json:"Country"`
	EmailID               string                  `json:"EmailID"`
	PhoneNumber           string                  `json:"PhoneNumber"`
	PostalCode            string                  `json:"PostalCode"`
	StateCode             string                  `json:"StateCode"`
	HotelCode             string                  `json:"HotelCode"`
	HotelName             string                  `json:"HotelName"`
	MealPlanCode          string                  `json:"MealPlanCode"`
	NumberofUnit          int                     `json:"NumberofUnit"`
	PaymentMode           string                  `json:"PaymentMode"`
	RatePlanCategory      string                  `json:"RatePlanCategory"`
	RatePlanCode          string                  `json:"RatePlanCode"`
	RatePlanDescription   string                  `json:"RatePlanDescription"`
	Remarks               string                  `json:"Remarks"`
	RoomID                string                  `json:"RoomID"` // RoomTypeId or PMS RoomID
	RoomTypeCode          string                  `json:"RoomTypeCode"`
	Smoking               bool                    `json:"Smoking"`
	SourceSystem          string                  `json:"SourceSystem"`
	TOTAmountAfterTax     float64                 `json:"TOTAmountAfterTax"`
	TOTAmountBeforeTax    float64                 `json:"TOTAmountBeforeTax"`
	TaxAmount             float64                 `json:"TaxAmount"`
	TaxCurrency           interface{}             `json:"TaxCurrency"`
}

type BookingHotelPushBookingRequest struct {
	Authentication                   BookingHotelAuthentication    `json:"Authentication"`
	BookingMode                      string                        `json:"BookingMode"` // "Book", "Cancel", "Modify", "new"
	ChannelBookingCancellationUniqID string                        `json:"ChannelBookingCancellationUniqID"`
	ChannelBookingUniqID             string                        `json:"ChannelBookingUniqId"`
	HotelCode                        string                        `json:"HotelCode"`
	TotalPrice                       float64                       `json:"TotalPrice"`
	PaybleToHotel                    float64                       `json:"PaybleToHotel"`
	TotalCommissionAmount            float64                       `json:"TotalCommissionAmount"`
	TotalBalance                     float64                       `json:"TotalBalance"`
	TotalDeposit                     float64                       `json:"TotalDeposit"`
	TotalTax                         float64                       `json:"TotalTax"`
	TotalDiscount                    float64                       `json:"TotalDiscount"`
	PayStatus                        string                        `json:"PayStatus"`
	PaymentMode                      string                        `json:"PaymentMode"`
	CurrencyCode                     string                        `json:"CurrencyCode"`
	TimestampValue                   string                        `json:"TimestampValue"`
	ReservationStays                 []BookingHotelReservationStay `json:"ReservationStays"`
}

type BookingHotelPushBookingResponse struct {
	Status         string `json:"Status"`
	ConfirmationNo interface{}   `json:"ConfirmationNo"` // can be string or numeric ID matching BookingHotel's response format
}

// ProcessBookingHotelPushRequest handles incoming Book, Cancel, and Modify requests from BookingHotel
func ProcessBookingHotelPushRequest(req BookingHotelPushBookingRequest) (*BookingHotelPushBookingResponse, error) {
	mode := strings.TrimSpace(req.BookingMode)
	if mode == "" {
		mode = "Book"
	}

	var partner models.PartnerIntegration
	config.DB.Where("partner_name = ?", "BookingHotel").First(&partner)

	// 1. Locate the target Hotel in the PMS
	var hotel models.Hotel
	hotelCode := strings.TrimSpace(req.HotelCode)
	if hotelCode == "" && len(req.ReservationStays) > 0 {
		hotelCode = strings.TrimSpace(req.ReservationStays[0].HotelCode)
	}

	var hotelMapping models.ChannelHotelMapping
	config.DB.Where("ota_hotel_code = ? AND partner_integration_id = ?", hotelCode, partner.ID).First(&hotelMapping)
	
	// 0. Authenticate the incoming webhook
	expectedUser := hotelMapping.OTAUsername
	expectedPass := hotelMapping.OTAPassword
	if expectedUser != "" && expectedPass != "" {
		if req.Authentication.UserName != expectedUser || req.Authentication.Password != expectedPass {
			return &BookingHotelPushBookingResponse{
				Status:         "Fail",
				ConfirmationNo: 0,
			}, fmt.Errorf("authentication failed: invalid username or password")
		}
	}

	var hotelErr error
	if hotelMapping.HotelID > 0 {
		hotelErr = config.DB.Where("id = ? AND deleted_at IS NULL", hotelMapping.HotelID).First(&hotel).Error
	} else {
		// Fallback to legacy checks
		hotelErr = config.DB.Where("channel_hotel_code = ? AND deleted_at IS NULL", hotelCode).First(&hotel).Error
		if hotel.ID == 0 {
			if idNum, err := strconv.ParseUint(hotelCode, 10, 32); err == nil && idNum > 0 {
				hotelErr = config.DB.Where("id = ? AND deleted_at IS NULL", uint(idNum)).First(&hotel).Error
			}
		}
		if hotel.ID == 0 {
			hotelErr = config.DB.Where("public_token = ? AND deleted_at IS NULL", hotelCode).First(&hotel).Error
		}
		if hotel.ID == 0 {
			hotelErr = config.DB.Where("status = 'active' AND deleted_at IS NULL").First(&hotel).Error
		}
	}

	if hotel.ID == 0 || hotelErr != nil {
		return &BookingHotelPushBookingResponse{
			Status:         "Fail",
			ConfirmationNo: 0,
		}, fmt.Errorf("target hotel '%s' not found in PMS: %v", hotelCode, hotelErr)
	}

	switch strings.ToLower(mode) {
	case "cancel":
		return handleBookingHotelCancel(hotel.ID, req)
	case "modify":
		return handleBookingHotelModify(hotel.ID, partner.ID, req)
	case "book":
		fallthrough
	case "new":
		fallthrough
	default:
		return handleBookingHotelCreate(hotel.ID, partner.ID, req)
	}
}

// handleBookingHotelCreate processes new reservations
func handleBookingHotelCreate(hotelID uint, partnerID uint, req BookingHotelPushBookingRequest) (*BookingHotelPushBookingResponse, error) {
	if len(req.ReservationStays) == 0 {
		return &BookingHotelPushBookingResponse{Status: "Fail", ConfirmationNo: ""}, fmt.Errorf("no ReservationStays provided in booking payload")
	}

	var confirmationNumbers []uint

	for stayIdx, stay := range req.ReservationStays {
		checkIn, err := time.Parse("2006-01-02", strings.TrimSpace(stay.ArrivalDate))
		if err != nil {
			checkIn = time.Now()
		}
		checkOut, err := time.Parse("2006-01-02", strings.TrimSpace(stay.DepartureDate))
		if err != nil || !checkOut.After(checkIn) {
			checkOut = checkIn.AddDate(0, 0, 1)
		}

		// 1. Resolve / Create Guest
		guestName := "OTA Guest"
		guestPhone := ""
		guestEmail := ""
		guestCity := ""
		guestCountry := "India"
		guestAddress := ""

		if stay.GuestName != "" {
			guestName = stay.GuestName
			guestPhone = strings.TrimSpace(stay.PhoneNumber)
			guestEmail = strings.TrimSpace(stay.EmailID)
			guestCity = strings.TrimSpace(stay.CityName)
			guestCountry = strings.TrimSpace(stay.Country)
			guestAddress = strings.TrimSpace(stay.AddressLine)
			if guestCountry == "" || strings.ToLower(guestCountry) == "in" {
				guestCountry = "India"
			}
		} else if len(stay.GuestInfo) > 0 {
			gi := stay.GuestInfo[0]
			parts := []string{}
			if gi.Nameprefix != "" {
				parts = append(parts, gi.Nameprefix)
			}
			if gi.GivenName != "" {
				parts = append(parts, gi.GivenName)
			}
			if gi.MiddleName != "" {
				parts = append(parts, gi.MiddleName)
			}
			if gi.Surname != "" {
				parts = append(parts, gi.Surname)
			}
			if len(parts) > 0 {
				guestName = strings.Join(parts, " ")
			}
			guestPhone = strings.TrimSpace(gi.PhoneNumber)
			guestEmail = strings.TrimSpace(gi.EmailID)
			guestCity = strings.TrimSpace(gi.CityName)
			guestCountry = strings.TrimSpace(gi.Country)
			guestAddress = strings.TrimSpace(gi.AddressLine)
		}

		var guest models.Guest
		if guestPhone != "" {
			_ = config.DB.Where("hotel_id = ? AND phone = ? AND deleted_at IS NULL", hotelID, guestPhone).First(&guest).Error
		}
		if guest.ID == 0 && guestEmail != "" {
			_ = config.DB.Where("hotel_id = ? AND email = ? AND deleted_at IS NULL", hotelID, guestEmail).First(&guest).Error
		}
		if guest.ID == 0 {
			guest = models.Guest{
				HotelID:     hotelID,
				Name:        guestName,
				Phone:       guestPhone,
				Email:       guestEmail,
				City:        guestCity,
				Country:     guestCountry,
				Address:     guestAddress,
				Nationality: guestCountry,
			}
			_ = config.DB.Create(&guest).Error
		}

		// 2. Resolve RoomType in PMS
		var roomType models.RoomType
		roomIDParam := strings.TrimSpace(stay.RoomID)
		if roomIDParam == "" {
			roomIDParam = strings.TrimSpace(stay.RoomTypeCode)
		}

		// A. Try mapping table first
		var roomMapping models.ChannelRoomMapping
		if roomIDParam != "" {
			config.DB.Where("hotel_id = ? AND partner_integration_id = ? AND ota_room_type_code = ?", hotelID, partnerID, roomIDParam).First(&roomMapping)
			if roomMapping.RoomTypeID > 0 {
				config.DB.Where("id = ? AND deleted_at IS NULL", roomMapping.RoomTypeID).First(&roomType)
			}
		}

		// B. Try matching by ChannelRoomCode legacy
		if roomType.ID == 0 && roomIDParam != "" {
			_ = config.DB.Where("hotel_id = ? AND channel_room_code = ? AND deleted_at IS NULL", hotelID, roomIDParam).First(&roomType).Error
		}
		// C. Match by direct RoomType ID
		if roomType.ID == 0 {
			if rID, err := strconv.ParseUint(roomIDParam, 10, 32); err == nil && rID > 0 {
				_ = config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", uint(rID), hotelID).First(&roomType).Error
			}
		}
		// C. Auto-create RoomType if not found (so OTA bookings don't fail)
		if roomType.ID == 0 {
			roomTypeName := stay.RatePlanDescription
			if roomTypeName == "" {
				roomTypeName = "Unmapped Type (" + roomIDParam + ")"
			}

			roomType = models.RoomType{
				HotelID:         hotelID,
				Name:            roomTypeName,
				ChannelRoomCode: roomIDParam,
				BasePrice:       stay.TOTAmountBeforeTax,
				MaxOccupancy:    10, // Generous default for unassigned
			}
			if err := config.DB.Create(&roomType).Error; err != nil {
				// Fallback to any room type if creation fails
				_ = config.DB.Where("hotel_id = ? AND deleted_at IS NULL", hotelID).First(&roomType).Error
			}
		}

		if roomType.ID == 0 {
			return &BookingHotelPushBookingResponse{Status: "Fail", ConfirmationNo: ""}, fmt.Errorf("no room type available or mapped for hotel %d", hotelID)
		}

		// 3. Resolve RatePlan
		ratePlanName := stay.RatePlanCode
		if ratePlanName == "" {
			ratePlanName = stay.MealPlanCode
		}
		var rateMapping models.ChannelRateMapping
		if ratePlanName != "" {
			config.DB.Where("hotel_id = ? AND partner_integration_id = ? AND ota_rate_plan_code = ?", hotelID, partnerID, stay.RatePlanCode).First(&rateMapping)
			if rateMapping.PlanID > 0 {
				var rp models.RatePlan
				config.DB.Where("id = ?", rateMapping.PlanID).First(&rp)
				if rp.ID > 0 {
					ratePlanName = rp.Name + " (" + rp.MealPlan + ")"
				}
			}
		}

		// 4. Financials & Amounts
		totalAmount := stay.TOTAmountAfterTax
		if totalAmount <= 0 {
			totalAmount = stay.TOTAmountBeforeTax + stay.TaxAmount
		}
		taxAmount := stay.TaxAmount
		baseRate := stay.TOTAmountBeforeTax
		nights := int(checkOut.Sub(checkIn).Hours() / 24)
		if nights <= 0 {
			nights = 1
		}
		if baseRate <= 0 {
			baseRate = totalAmount - taxAmount
		}
		perNightBaseRate := baseRate / float64(nights)

		// 4. Booking Code & Identifiers
		channelRef := strings.TrimSpace(stay.ChannelBookingUniqID)
		if channelRef == "" {
			channelRef = strings.TrimSpace(req.ChannelBookingUniqID)
		}
		if channelRef == "" {
			channelRef = strings.TrimSpace(stay.BookingStayUniqID)
		}

		bookingCode := utils.GenerateBookingID(hotelID)
		if channelRef != "" {
			bookingCode = fmt.Sprintf("BKG-%d-%s", hotelID, channelRef)
			if stayIdx > 0 {
				bookingCode = fmt.Sprintf("BKG-%d-%s-%d", hotelID, channelRef, stayIdx+1)
			}
		}

		source := strings.TrimSpace(stay.SourceSystem)
		if source == "" {
			source = "BookingHotel OTA"
		}

		advancePayment := req.TotalDeposit / float64(len(req.ReservationStays))
		if strings.ToLower(strings.TrimSpace(req.PaymentMode)) == "prepaid" || req.PayStatus == "1" {
			advancePayment = stay.TOTAmountAfterTax // Mark as fully paid if it's an OTA prepaid booking
			if advancePayment <= 0 {
				advancePayment = stay.TOTAmountBeforeTax + stay.TaxAmount
			}
		}

		// Construct Booking Record
		newBooking := models.Booking{
			BookingCode:         bookingCode,
			HotelID:             hotelID,
			GuestID:             guest.ID,
			RoomTypeID:          roomType.ID,
			RoomID:              nil, // Assign null until check-in
			CheckInDate:         checkIn,
			CheckOutDate:        checkOut,
			Status:              "confirmed",
			RatePlan:            ratePlanName,
			BaseRate:            perNightBaseRate,
			Tax:                 taxAmount,
			TaxRate:             18.0,
			TotalAmount:         baseRate,
			AdvancePayment:      advancePayment,
			BookingSource:       source,
			MarketSegment:       "OTA / Channel Manager",
			ExpectedArrivalTime: "12:00 PM",
			SpecialRequests:     stay.Remarks,
			TotalGuests:         stay.AdultCount + stay.ChildCount,
		}

		if newBooking.TotalGuests < 1 {
			newBooking.TotalGuests = 1
		}

		// Save booking with transaction
		saveErr := config.DB.Transaction(func(tx *gorm.DB) error {
			// Check if booking already exists with same booking code
			var existing models.Booking
			if err := tx.Where("booking_code = ? AND hotel_id = ?", newBooking.BookingCode, hotelID).First(&existing).Error; err == nil && existing.ID > 0 {
				// Update existing
				existing.CheckInDate = newBooking.CheckInDate
				existing.CheckOutDate = newBooking.CheckOutDate
				existing.TotalAmount = newBooking.TotalAmount
				existing.Status = "confirmed"
				existing.SpecialRequests = newBooking.SpecialRequests
				if err := tx.Save(&existing).Error; err != nil {
					return err
				}
				newBooking = existing
			} else {
				if err := tx.Create(&newBooking).Error; err != nil {
					return err
				}
			}

			// Ensure clean state for the new booking ID (remove any stale orphan payments)
			tx.Where("booking_id = ?", newBooking.ID).Delete(&models.Payment{})

			// Auto-insert advance payment into the official payments ledger
			if newBooking.AdvancePayment > 0 {
				now := time.Now()
				advancePaymentRec := models.Payment{
					BookingID: newBooking.ID,
					Amount:    newBooking.AdvancePayment,
					Method:    "ota_prepaid",
					Reference: "OTA Advance Payment",
					Status:    "success",
					PaidOn:    &now,
				}
				if err := tx.Create(&advancePaymentRec).Error; err != nil {
					return err
				}
			}

			// Upsert ChannelBooking
			// Parse interface{} fields safely
			commissionAmountStr := fmt.Sprintf("%v", stay.CommissionAmount)
			var parsedCommission float64
			if parsed, err := strconv.ParseFloat(commissionAmountStr, 64); err == nil {
				parsedCommission = parsed
			}
			taxCurrencyStr := fmt.Sprintf("%v", stay.TaxCurrency)
			if taxCurrencyStr == "<nil>" {
				taxCurrencyStr = ""
			}

			rawBytes, _ := json.Marshal(req)
			channelBooking := models.ChannelBooking{
				BookingID:        newBooking.ID,
				ChannelName:      "BookingHotel",
				ChannelBookingID: channelRef,
				CommissionAmount: parsedCommission,
				TaxCurrency:      taxCurrencyStr,
				RawPayload:       string(rawBytes),
			}

			// We use FirstOrCreate or Where(...).Updates(...) but since BookingID is unique:
			var existingCb models.ChannelBooking
			if err := tx.Where("booking_id = ?", newBooking.ID).First(&existingCb).Error; err == nil {
				channelBooking.ID = existingCb.ID
				return tx.Save(&channelBooking).Error
			}
			return tx.Create(&channelBooking).Error
		})

		if saveErr != nil {
			return &BookingHotelPushBookingResponse{Status: "Fail", ConfirmationNo: ""}, fmt.Errorf("failed to save booking: %w", saveErr)
		}

		confirmationNumbers = append(confirmationNumbers, newBooking.ID)
	}

	var mainConfirmation interface{} = ""
	if len(confirmationNumbers) > 0 {
		mainConfirmation = confirmationNumbers[0]
	}

	return &BookingHotelPushBookingResponse{
		Status:         "Success",
		ConfirmationNo: mainConfirmation,
	}, nil
}

// handleBookingHotelCancel handles cancellation notifications from Channel Manager
func handleBookingHotelCancel(hotelID uint, req BookingHotelPushBookingRequest) (*BookingHotelPushBookingResponse, error) {
	channelRef := strings.TrimSpace(req.ChannelBookingCancellationUniqID)
	if channelRef == "" {
		channelRef = strings.TrimSpace(req.ChannelBookingUniqID)
	}

	var booking models.Booking
	err := config.DB.Where("hotel_id = ? AND (booking_code = ? OR booking_code LIKE ?)",
		hotelID,
		channelRef,
		"%"+channelRef+"%",
	).First(&booking).Error

	if err != nil || booking.ID == 0 {
		// Also check inside ReservationStays for Stay IDs
		for _, stay := range req.ReservationStays {
			stayRef := strings.TrimSpace(stay.ChannelBookingUniqID)
			if stayRef == "" {
				stayRef = strings.TrimSpace(stay.BookingStayUniqID)
			}
			if stayRef != "" {
				if e := config.DB.Where("hotel_id = ? AND booking_code LIKE ?", hotelID, "%"+stayRef+"%").First(&booking).Error; e == nil && booking.ID > 0 {
					break
				}
			}
		}
	}

	if booking.ID > 0 {
		_ = config.DB.Model(&booking).Updates(map[string]interface{}{
			"status":              "cancelled",
			"cancellation_reason": "Cancelled via BookingHotel OTA / Channel Manager",
		}).Error
		return &BookingHotelPushBookingResponse{
			Status:         "Success",
			ConfirmationNo: booking.ID,
		}, nil
	}

	return &BookingHotelPushBookingResponse{
		Status:         "Success",
		ConfirmationNo: channelRef,
	}, nil
}

// handleBookingHotelModify handles changes to an existing reservation
func handleBookingHotelModify(hotelID uint, partnerID uint, req BookingHotelPushBookingRequest) (*BookingHotelPushBookingResponse, error) {
	channelRef := strings.TrimSpace(req.ChannelBookingUniqID)
	var booking models.Booking
	_ = config.DB.Where("hotel_id = ? AND (booking_code = ? OR booking_code LIKE ?)", hotelID, channelRef, "%"+channelRef+"%").First(&booking).Error

	if booking.ID > 0 && len(req.ReservationStays) > 0 {
		stay := req.ReservationStays[0]
		updates := map[string]interface{}{}

		if checkIn, err := time.Parse("2006-01-02", strings.TrimSpace(stay.ArrivalDate)); err == nil {
			updates["check_in_date"] = checkIn
		}
		if checkOut, err := time.Parse("2006-01-02", strings.TrimSpace(stay.DepartureDate)); err == nil {
			updates["check_out_date"] = checkOut
		}
		if stay.TOTAmountAfterTax > 0 {
			updates["total_amount"] = stay.TOTAmountAfterTax
		}
		if stay.Remarks != "" {
			updates["special_requests"] = stay.Remarks
		}
		if stay.AdultCount+stay.ChildCount > 0 {
			updates["total_guests"] = stay.AdultCount + stay.ChildCount
		}

		_ = config.DB.Model(&booking).Updates(updates).Error
		return &BookingHotelPushBookingResponse{
			Status:         "Success",
			ConfirmationNo: booking.ID,
		}, nil
	}

	// Fallback to create if not found
	return handleBookingHotelCreate(hotelID, partnerID, req)
}
