package utils

import (
	"fmt"

	"hms/config"
	"hms/models"
)

// SendPromotionalEmail sends a plain HTML promotional message to multiple recipients.
func SendPromotionalEmail(recipients []string, subject, message string) error {
	if len(recipients) == 0 {
		return fmt.Errorf("no recipients")
	}
	if len(recipients) > 500 {
		return fmt.Errorf("too many recipients")
	}
	for _, to := range recipients {
		if err := SendEmailWithInlineImages(to, subject, message, nil); err != nil {
			return err
		}
	}
	return nil
}

// SendBookingEmails sends booking-related templated emails based on type.
// Currently supports "confirmation" (case-insensitive).
func SendBookingEmails(bookingID uint, emailType EmailType, customData map[string]string) error {
	// load booking and guest
	var b models.Booking
	if err := config.DB.Where("id = ? AND deleted_at IS NULL", bookingID).First(&b).Error; err != nil {
		return fmt.Errorf("booking not found")
	}
	var guest models.Guest
	if err := config.DB.Where("id = ?", b.GuestID).First(&guest).Error; err != nil {
		return fmt.Errorf("guest not found")
	}
	// Only support confirmation for now
	if emailType == EmailType("confirmation") || emailType == EmailType("booking_confirmation") {
		nights := int(b.CheckOutDate.Sub(b.CheckInDate).Hours() / 24)
		if nights < 1 {
			nights = 1
		}
		qrBase64, _ := GenerateQRBase64WithSize(b.BookingCode, 300)
		// populate room and hotel details for richer email
		var room models.Room
		var roomType models.RoomType
		var hotel models.Hotel
		if b.RoomID != nil {
			config.DB.Where("id = ?", *b.RoomID).First(&room)
		}
		config.DB.Where("id = ?", b.RoomTypeID).First(&roomType)
		config.DB.Where("id = ?", b.HotelID).First(&hotel)

		var folioItems []models.FolioItem
		config.DB.Where("booking_id = ?", b.ID).Find(&folioItems)

		var folioTotal float64
		for _, item := range folioItems {
			folioTotal += item.Amount
		}

		subtotal := b.TotalAmount + folioTotal
		taxAmount := b.Tax
	grandTotal := subtotal + taxAmount

		var totalPaid float64
		config.DB.Model(&models.Payment{}).Where("booking_id = ? AND (status = 'success' OR status = '')", b.ID).Select("COALESCE(SUM(amount), 0)").Scan(&totalPaid)

		balanceDue := grandTotal - totalPaid
		if balanceDue < 0 {
			balanceDue = 0
		}

		SendBookingConfirmation(BookingNotifyData{
			GuestName:      guest.Name,
			GuestEmail:     guest.Email,
			GuestPhone:     guest.Phone,
			BookingCode:    b.BookingCode,
			RoomNumber:     room.RoomNumber, // might be empty if unassigned
			RoomType:       roomType.Name,
			HotelName:      hotel.Name,
			HotelAddress:   hotel.Address1,
			CheckInDate:    b.CheckInDate.Format("02 Jan 2006"),
			CheckOutDate:   b.CheckOutDate.Format("02 Jan 2006"),
			Nights:         nights,
			TotalAmount:    b.TotalAmount,
			OTP:            customData["otp"],
			QRBase64:       qrBase64,
			BaseRate:       b.BaseRate,
			DiscountAmount: b.Discount,
			RoomChargesNet: b.TotalAmount,
			FolioTotal:     folioTotal,
			Subtotal:       subtotal,
			TaxAmount:      taxAmount,
			TaxRate:        b.TaxRate,
			GrandTotal:     grandTotal,
			TotalPaid:      totalPaid,
			BalanceDue:     balanceDue,
			FolioItems:     folioItems,
		})
		return nil
	}
	return fmt.Errorf("unsupported booking email type: %s", emailType)
}
