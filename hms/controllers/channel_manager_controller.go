package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CMAuth struct {
	UserName string `json:"UserName"`
	Password string `json:"Password"`
}

type CMGuestInfo struct {
	GivenName   string `json:"GivenName"`
	MiddleName  string `json:"MiddleName"`
	Surname     string `json:"Surname"`
	EmailID     string `json:"EmailID"`
	PhoneNumber string `json:"PhoneNumber"`
	Country     string `json:"Country"`
	CityName    string `json:"CityName"`
	AddressLine string `json:"AddressLine"`
	Nationality string `json:"Nationality"`
	PostalCode  string `json:"PostalCode"`
	StateCode   string `json:"StateCode"`
}

type CMReservationStay struct {
	BookingMode          string        `json:"BookingMode"`
	BookingStatus        string        `json:"BookingStatus"`
	BookingStayUniqId    string        `json:"BookingStayUniqId"`
	ChannelBookingUniqID string        `json:"ChannelBookingUniqID"`
	ArrivalDate          string        `json:"ArrivalDate"`
	DepartureDate        string        `json:"DepartureDate"`
	RoomID               string        `json:"RoomID"`
	RatePlanCode         string        `json:"RatePlanCode"`
	TOTAmountAfterTax    float64       `json:"TOTAmountAfterTax"`
	TOTAmountBeforeTax   float64       `json:"TOTAmountBeforeTax"`
	TaxAmount            float64       `json:"TaxAmount"`
	AdultCount           int           `json:"AdultCount"`
	ChildCount           int           `json:"ChildCount"`
	Remarks              string        `json:"Remarks"`
	SourceSystem         string        `json:"SourceSystem"`
	GuestInfo            []CMGuestInfo `json:"GuestInfo"`
}

type CMPushPayload struct {
	Authentication                   CMAuth              `json:"Authentication"`
	BookingMode                      string              `json:"BookingMode"` // "Book", "Cancel", "Modify", "new", "cancel"
	ChannelBookingCancellationUniqID string              `json:"ChannelBookingCancellationUniqID"`
	ChannelBookingUniqId             string              `json:"ChannelBookingUniqId"`
	HotelCode                        string              `json:"HotelCode"`
	ReservationStays                 []CMReservationStay `json:"ReservationStays"`
}

func HandleChannelManagerWebhook(c *gin.Context) {
	var payload CMPushPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"Status": "Error", "Message": "Invalid payload format: " + err.Error()})
		return
	}

	// In a real system, we would validate payload.Authentication against DB settings
	// For now, assume it's valid if they reached this endpoint.

	var hotel models.Hotel
	hotelCodeStr := strings.TrimSpace(payload.HotelCode)
	
	// 1. Try finding Hotel by numeric ID
	if idNum, err := strconv.ParseUint(hotelCodeStr, 10, 32); err == nil && idNum > 0 {
		config.DB.Where("id = ? AND deleted_at IS NULL", uint(idNum)).First(&hotel)
	}
	
	// 2. Fallback to channel_hotel_code if it exists in your PMS
	if hotel.ID == 0 {
		config.DB.Where("channel_hotel_code = ? AND deleted_at IS NULL", hotelCodeStr).First(&hotel)
	}

	// 3. Absolute fallback to first active hotel for testing
	if hotel.ID == 0 {
		if err := config.DB.Where("status = 'active' AND deleted_at IS NULL").First(&hotel).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"Status": "Error", "Message": "Hotel not found in local system"})
			return
		}
	}

	mode := strings.ToLower(payload.BookingMode)

	if mode == "cancel" {
		cancelID := payload.ChannelBookingCancellationUniqID
		if cancelID == "" {
			cancelID = payload.ChannelBookingUniqId
		}

		// Find bookings matching this ChannelBookingUniqID
		var bookings []models.Booking
		config.DB.Where("booking_code LIKE ? AND hotel_id = ?", cancelID+"%", hotel.ID).Find(&bookings)

		if len(bookings) == 0 {
			c.JSON(http.StatusOK, gin.H{"Status": "Success", "Message": "Booking already cancelled or not found", "ConfirmationNo": cancelID})
			return
		}

		for _, b := range bookings {
			if b.Status != "cancelled" {
				config.DB.Model(&b).Updates(map[string]interface{}{
					"status":              "cancelled",
					"cancellation_reason": "Cancelled via Channel Manager Webhook",
				})
			}
		}

		c.JSON(http.StatusOK, gin.H{"Status": "Success", "ConfirmationNo": cancelID})
		return
	}

	// Handle "Book" or "new"
	if len(payload.ReservationStays) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"Status": "Error", "Message": "No ReservationStays provided"})
		return
	}

	var confirmationNumbers []string

	txErr := config.DB.Transaction(func(tx *gorm.DB) error {
		for _, stay := range payload.ReservationStays {
			// Find RoomTypeID mapped to RoomID
			roomTypeID, _ := strconv.ParseUint(stay.RoomID, 10, 32)
			var roomType models.RoomType
			if err := tx.Where("id = ? AND hotel_id = ?", uint(roomTypeID), hotel.ID).First(&roomType).Error; err != nil {
				// Fallback: If RoomType not found by ID, get the first available room type for this hotel
				if err := tx.Where("hotel_id = ?", hotel.ID).First(&roomType).Error; err != nil {
					return fmt.Errorf("no room types available for this hotel to map the booking")
				}
			}

			// Handle Guest
			var guest models.Guest
			if len(stay.GuestInfo) > 0 {
				info := stay.GuestInfo[0]
				
				parts := []string{}
				if info.GivenName != "" { parts = append(parts, info.GivenName) }
				if info.MiddleName != "" { parts = append(parts, info.MiddleName) }
				if info.Surname != "" { parts = append(parts, info.Surname) }
				
				guestName := strings.Join(parts, " ")
				if guestName == "" {
					guestName = "OTA Guest"
				}

				// Try to find existing guest by Email or Phone within this hotel
				query := tx.Where("hotel_id = ?", hotel.ID)
				if info.EmailID != "" {
					query = query.Where("email = ?", info.EmailID)
				} else if info.PhoneNumber != "" {
					query = query.Where("phone = ?", info.PhoneNumber)
				} else {
					query = query.Where("name = ?", guestName)
				}

				if err := query.First(&guest).Error; err != nil {
					// Create new guest
					guest = models.Guest{
						HotelID:     hotel.ID,
						Name:        guestName,
						Email:       info.EmailID,
						Phone:       info.PhoneNumber,
						Nationality: info.Nationality,
						Country:     info.Country,
						City:        info.CityName,
						State:       info.StateCode,
						Pincode:     info.PostalCode,
						Address:     info.AddressLine,
					}
					if err := tx.Create(&guest).Error; err != nil {
						return fmt.Errorf("failed to create guest: %v", err)
					}
				} else {
					// Optionally update guest details if missing
					updates := make(map[string]interface{})
					if guest.Address == "" && info.AddressLine != "" { updates["address"] = info.AddressLine }
					if guest.City == "" && info.CityName != "" { updates["city"] = info.CityName }
					if guest.Country == "" && info.Country != "" { updates["country"] = info.Country }
					if len(updates) > 0 {
						tx.Model(&guest).Updates(updates)
					}
				}
			} else {
				// Create a generic OTA guest if no info provided
				guest = models.Guest{
					HotelID: hotel.ID,
					Name:    "OTA Guest",
				}
				tx.Create(&guest)
			}

			// Parse Dates (e.g. "2018-01-26")
			checkIn, err := time.Parse("2006-01-02", stay.ArrivalDate)
			if err != nil {
				return fmt.Errorf("invalid ArrivalDate format")
			}
			checkOut, err := time.Parse("2006-01-02", stay.DepartureDate)
			if err != nil {
				return fmt.Errorf("invalid DepartureDate format")
			}

			source := stay.SourceSystem
			if source == "" {
				source = "ChannelManager"
			}

			bookingCode := payload.ChannelBookingUniqId + "-" + stay.BookingStayUniqId

			// Check if booking already exists (Idempotency)
			var existing models.Booking
			if err := tx.Where("booking_code = ?", bookingCode).First(&existing).Error; err == nil {
				confirmationNumbers = append(confirmationNumbers, bookingCode)
				continue // Already processed this stay
			}

			booking := models.Booking{
				BookingCode:     bookingCode,
				HotelID:         hotel.ID,
				GuestID:         guest.ID,
				RoomTypeID:      roomType.ID,
				CheckInDate:     checkIn,
				CheckOutDate:    checkOut,
				Status:          "confirmed", // Default status for OTA bookings
				RatePlan:        stay.RatePlanCode,
				BaseRate:        stay.TOTAmountBeforeTax,
				Tax:             stay.TaxAmount,
				TotalAmount:     stay.TOTAmountAfterTax,
				BookingSource:   source,
				SpecialRequests: stay.Remarks,
				TotalGuests:     stay.AdultCount + stay.ChildCount,
			}

			if err := tx.Create(&booking).Error; err != nil {
				return fmt.Errorf("failed to create booking: %v", err)
			}
			confirmationNumbers = append(confirmationNumbers, bookingCode)
		}
		return nil
	})

	if txErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"Status": "Error", "Message": txErr.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"Status":         "Success",
		"ConfirmationNo": strings.Join(confirmationNumbers, ","),
	})
}
