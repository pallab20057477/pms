package main

import (
	"log"
	"time"

	"hms/config"
	"hms/models"
)

func main() {
	config.ConnectDB()

	log.Println("Starting AdvancePayment backfill migration...")

	var bookings []models.Booking
	if err := config.DB.Where("advance_payment > 0 AND deleted_at IS NULL").Find(&bookings).Error; err != nil {
		log.Fatalf("Failed to fetch bookings: %v", err)
	}

	count := 0
	for _, b := range bookings {
		// Check if a payment for this exact amount and booking already exists to prevent duplicates
		var existingPayment int64
		config.DB.Model(&models.Payment{}).Where("booking_id = ? AND amount = ? AND method = 'cash'", b.ID, b.AdvancePayment).Count(&existingPayment)
		
		if existingPayment == 0 {
			now := time.Now()
			p := models.Payment{
				BookingID: b.ID,
				Amount:    b.AdvancePayment,
				Method:    "cash",
				Reference: "Backfilled Advance Payment",
				Status:    "success",
				PaidOn:    &now,
			}
			if err := config.DB.Create(&p).Error; err != nil {
				log.Printf("Failed to create payment for booking %d: %v", b.ID, err)
				continue
			}
			count++
		}
	}

	log.Printf("Successfully backfilled %d payment records from AdvancePayment.", count)
}
