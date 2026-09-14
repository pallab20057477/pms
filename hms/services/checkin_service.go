package services

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func hotelLocalNow(hotelID uint) time.Time {
	var setting models.SystemSetting
	if err := config.DB.Where("hotel_id = ?", hotelID).Take(&setting).Error; err == nil {
		if location, loadErr := time.LoadLocation(strings.TrimSpace(setting.TimeZone)); loadErr == nil {
			return time.Now().In(location)
		}
	}
	return time.Now()
}

func normalizeWorkflowStatus(status string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(status), "-", "_"))
}

func effectiveHotelTaxRate(hotel models.Hotel) float64 {
	if hotel.TaxPercent < 0 {
		return 0
	}
	return hotel.TaxPercent
}

func lateCheckoutFee(setting models.SystemSetting, booking models.Booking, now time.Time) (float64, string, error) {
	if booking.CheckOutDate.IsZero() {
		return 0, "checkout date is missing", errors.New("checkout date is missing")
	}

	// Use actual checkout time if already recorded, otherwise use current time
	checkoutAt := now
	if booking.ActualCheckOutAt != nil {
		checkoutAt = *booking.ActualCheckOutAt
	}

	loc := checkoutAt.Location()
	checkoutTimeStr := strings.TrimSpace(setting.CheckoutTime)
	if checkoutTimeStr == "" {
		checkoutTimeStr = "11:00"
	}
	parsedCheckoutTime, err := time.ParseInLocation("15:04", checkoutTimeStr, loc)
	if err != nil {
		parsedCheckoutTime, _ = time.ParseInLocation("15:04", "11:00", loc)
	}
	hour, minute, _ := parsedCheckoutTime.Clock()
	checkoutDeadline := time.Date(
		booking.CheckOutDate.Year(),
		booking.CheckOutDate.Month(),
		booking.CheckOutDate.Day(),
		hour,
		minute,
		0,
		0,
		loc,
	)
	graceMinutes := setting.LateCheckoutGraceMinutes
	if graceMinutes < 0 {
		graceMinutes = 0
	}
	graceDeadline := checkoutDeadline.Add(time.Duration(graceMinutes) * time.Minute)
	if !checkoutAt.After(graceDeadline) {
		return 0, "", nil
	}
	if !setting.AllowLateCheckout {
		return 0, fmt.Sprintf("late checkout is not allowed after %s", graceDeadline.Format("02 Jan 2006 03:04 PM")), errors.New("late checkout is not allowed")
	}
	if setting.LateCheckoutHourlyCharge <= 0 {
		return 0, fmt.Sprintf("late checkout past %s detected but hourly charge is set to 0", graceDeadline.Format("02 Jan 2006 03:04 PM")), nil
	}

	lateDuration := checkoutAt.Sub(graceDeadline)
	hoursLate := math.Ceil(lateDuration.Hours())
	if hoursLate < 1 {
		hoursLate = 1
	}
	fee := hoursLate * setting.LateCheckoutHourlyCharge
	if fee < 0 {
		fee = 0
	}
	return fee, fmt.Sprintf("late checkout charge for %.0f hour(s) past grace period", hoursLate), nil
}

func CheckIn(bookingID, hotelID, adminID uint) error {
	var roomStatusChangeMessage string
	var bookingCode string

	if err := config.DB.Transaction(func(tx *gorm.DB) error {
		if err := utils.EnsureTodayOpen(hotelID); err != nil {
			return err
		}
		var booking models.Booking
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", bookingID, hotelID).
			First(&booking).Error; err != nil {
			return errors.New("booking not found")
		}
		status := normalizeWorkflowStatus(booking.Status)
		if status != "reserved" && status != "occupied" {
			return errors.New("booking not in reserved or occupied state")
		}
		bookingCode = booking.BookingCode

		var room models.Room
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", booking.RoomID, hotelID).
			First(&room).Error; err != nil {
			return errors.New("room not found")
		}
		if room.Status == "maintenance" {
			return errors.New("room is under maintenance")
		}

		now := hotelLocalNow(hotelID)
		if err := tx.Model(&booking).Updates(map[string]interface{}{"status": "checked-in", "actual_check_in_at": &now}).Error; err != nil {
			return err
		}

		oldRoomStatus := room.Status
		if oldRoomStatus != "occupied" {
			if err := tx.Model(&room).Update("status", "occupied").Error; err != nil {
				return err
			}
			roomStatusChangeMessage = fmt.Sprintf("Room %s status changed from %s to occupied", room.RoomNumber, oldRoomStatus)
		}

		return nil
	}); err != nil {
		return err
	}

	if bookingCode != "" {
		utils.LogActivity(hotelID, "Checkin", adminID, fmt.Sprintf("Guest checked-in to Booking %s", bookingCode))
	} else {
		utils.LogActivity(hotelID, "Checkin", adminID, fmt.Sprintf("Guest checked-in to Booking #%d", bookingID))
	}
	if roomStatusChangeMessage != "" {
		utils.LogActivity(hotelID, "Room", adminID, roomStatusChangeMessage)
	}
	return nil
}

func Checkout(bookingID, hotelID, adminID uint) error {
	var roomStatusChangeMessage string
	var lateCheckoutMessage string
	var bookingCode string

	if err := config.DB.Transaction(func(tx *gorm.DB) error {
		if err := utils.EnsureTodayOpen(hotelID); err != nil {
			return err
		}
		var booking models.Booking
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", bookingID, hotelID).
			First(&booking).Error; err != nil {
			return errors.New("booking not found")
		}
		status := normalizeWorkflowStatus(booking.Status)
		if status != "checked_in" && status != "occupied" {
			return errors.New("booking not checked in or occupied")
		}
		bookingCode = booking.BookingCode

		var hotel models.Hotel
		if err := tx.Where("id = ? AND deleted_at IS NULL", hotelID).First(&hotel).Error; err != nil {
			return errors.New("hotel not found")
		}

		var setting models.SystemSetting
		if err := tx.Where("hotel_id = ?", hotelID).Take(&setting).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		now := hotelLocalNow(hotelID)
		lateFee, lateReason, lateErr := lateCheckoutFee(setting, booking, now)
		if lateErr != nil && lateFee == 0 {
			return fmt.Errorf("%s", lateReason)
		}
		if lateFee > 0 {
			lateItem := models.FolioItem{
				BookingID:   booking.ID,
				Description: fmt.Sprintf("Late checkout fee: %s", lateReason),
				Amount:      math.Round(lateFee*100) / 100,
				Type:        "extra",
				Taxable:     true,
			}
			if err := tx.Create(&lateItem).Error; err != nil {
				return err
			}
			lateCheckoutMessage = fmt.Sprintf("Late checkout fee added: %.2f", lateItem.Amount)
		} else if lateReason != "" {
			lateCheckoutMessage = lateReason
		}

		var folioSum float64
		if err := tx.Model(&models.FolioItem{}).Where("booking_id = ?", booking.ID).Select("COALESCE(SUM(amount),0)").Scan(&folioSum).Error; err != nil {
			return err
		}
		var folioTaxableSum float64
		if err := tx.Model(&models.FolioItem{}).Where("booking_id = ? AND taxable = ?", booking.ID, true).Select("COALESCE(SUM(amount),0)").Scan(&folioTaxableSum).Error; err != nil {
			return err
		}
		var paymentsSum float64
		if err := tx.Model(&models.Payment{}).Where("booking_id = ?", booking.ID).Select("COALESCE(SUM(amount),0)").Scan(&paymentsSum).Error; err != nil {
			return err
		}

		subtotal := booking.TotalAmount + folioSum - booking.Discount
		if subtotal < 0 {
			subtotal = 0
		}
		taxRate := effectiveHotelTaxRate(hotel)
		taxComponent := (booking.TotalAmount + folioTaxableSum - booking.Discount) * taxRate / 100.0
		if taxComponent < 0 {
			taxComponent = 0
		}
		taxTotal := taxComponent

		// Check balance BEFORE late checkout charge (exclude lateFee from folioSum)
		preLatefolioSum := folioSum - math.Round(lateFee*100)/100
		if preLatefolioSum < 0 {
			preLatefolioSum = 0
		}
		preLateTaxableBase := booking.TotalAmount + (folioTaxableSum - math.Round(lateFee*100)/100) - booking.Discount
		if preLateTaxableBase < 0 {
			preLateTaxableBase = 0
		}
		preLateTaxTotal := preLateTaxableBase * taxRate / 100.0
		preLateDue := (booking.TotalAmount + preLatefolioSum - booking.Discount) + preLateTaxTotal - paymentsSum
		if preLateDue > 0.01 {
			return fmt.Errorf("pending amount %.2f must be cleared before checkout", preLateDue)
		}

		var inv models.Invoice
		invErr := tx.Unscoped().Where("booking_id = ?", booking.ID).First(&inv).Error
		if invErr != nil {
			if errors.Is(invErr, gorm.ErrRecordNotFound) {
				var seq struct{ Next int64 }
				if err := tx.Raw("SELECT nextval('invoice_no_seq') as next").Scan(&seq).Error; err != nil {
					return err
				}
				part1 := taxComponent / 2.0
				part2 := taxComponent / 2.0
				invoiceNow := hotelLocalNow(hotelID)
				newInv := models.Invoice{
					HotelID:       hotelID,
					BookingID:     booking.ID,
					InvoiceNumber: seq.Next,
					InvoiceNo:     fmt.Sprintf("INV-%s-%d", invoiceNow.Format("20060102"), seq.Next),
					InvoiceDate:   invoiceNow.Format("2006-01-02"),
					Subtotal:      subtotal,
					TaxPart1:      part1,
					TaxPart2:      part2,
					TaxTotal:      taxTotal,
					TotalAmount:   subtotal + taxTotal,
				}
				if err := tx.Create(&newInv).Error; err != nil {
					return err
				}
			} else {
				return invErr
			}
		} else {
			invoiceNow := hotelLocalNow(hotelID)
			inv.InvoiceDate = invoiceNow.Format("2006-01-02")
			inv.Subtotal = subtotal
			inv.TaxTotal = taxTotal
			inv.TaxPart1 = taxComponent / 2.0
			inv.TaxPart2 = taxComponent / 2.0
			inv.TotalAmount = subtotal + taxTotal
			inv.HotelID = hotelID
			inv.DeletedAt = gorm.DeletedAt{}
			if err := tx.Unscoped().Save(&inv).Error; err != nil {
				return err
			}
		}

		var room models.Room
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", booking.RoomID, hotelID).
			First(&room).Error; err != nil {
			return errors.New("room not found")
		}

		checkoutNow := hotelLocalNow(hotelID)
		if err := tx.Model(&booking).Updates(map[string]interface{}{"status": "completed", "actual_check_out_at": &checkoutNow}).Error; err != nil {
			return err
		}

		oldRoomStatus := room.Status
		if oldRoomStatus != "dirty" {
			if err := tx.Model(&room).Update("status", "dirty").Error; err != nil {
				return err
			}
			roomStatusChangeMessage = fmt.Sprintf("Room %s status changed from %s to dirty", room.RoomNumber, oldRoomStatus)
		}

		var housekeeping models.Housekeeping
		dirtyAt := checkoutNow.Format(time.RFC3339)
		if err := tx.Where("room_id = ?", room.ID).First(&housekeeping).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				housekeeping = models.Housekeeping{
					RoomID:    room.ID,
					Status:    "dirty",
					StartTime: dirtyAt,
				}
				if err := tx.Create(&housekeeping).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		} else {
			updates := map[string]interface{}{
				"status":     "dirty",
				"start_time": dirtyAt,
				"end_time":   "",
			}
			if err := tx.Model(&housekeeping).Updates(updates).Error; err != nil {
				return err
			}
		}

		history := models.HousekeepingHistory{
			HotelID:        hotelID,
			RoomID:         room.ID,
			RoomNumber:     room.RoomNumber,
			PreviousStatus: oldRoomStatus,
			CurrentStatus:  "dirty",
			StartTime:      dirtyAt,
			Notes:          "Auto-marked dirty at checkout",
		}
		if err := tx.Create(&history).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		return err
	}

	if bookingCode != "" {
		utils.LogActivity(hotelID, "Checkout", adminID, fmt.Sprintf("Guest checked-out from Booking %s", bookingCode))
	} else {
		utils.LogActivity(hotelID, "Checkout", adminID, fmt.Sprintf("Guest checked-out from Booking #%d", bookingID))
	}
	if roomStatusChangeMessage != "" {
		utils.LogActivity(hotelID, "Room", adminID, roomStatusChangeMessage)
	}
	if lateCheckoutMessage != "" {
		utils.LogActivity(hotelID, "Checkout", adminID, lateCheckoutMessage)
	}
	utils.LogActivity(hotelID, "Invoice", adminID, "Final invoice ensured at checkout")

	return nil
}
