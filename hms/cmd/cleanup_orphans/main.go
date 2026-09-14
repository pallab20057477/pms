package main

import (
	"log"

	"hms/config"
)

func main() {
	config.ConnectDBNoAutoMigrate()

	queries := []string{
		"DELETE FROM guests WHERE hotel_id NOT IN (SELECT id FROM hotels)",
		"DELETE FROM rooms WHERE hotel_id NOT IN (SELECT id FROM hotels)",
		"DELETE FROM bookings WHERE hotel_id NOT IN (SELECT id FROM hotels)",
		"DELETE FROM bookings WHERE guest_id NOT IN (SELECT id FROM guests)",
		"DELETE FROM bookings WHERE room_id NOT IN (SELECT id FROM rooms)",
		"DELETE FROM payments WHERE booking_id NOT IN (SELECT id FROM bookings)",
		"DELETE FROM invoices WHERE booking_id NOT IN (SELECT id FROM bookings)",
		"DELETE FROM folio_items WHERE booking_id NOT IN (SELECT id FROM bookings)",
	}

	for _, q := range queries {
		res := config.DB.Exec(q)
		if res.Error != nil {
			log.Printf("Error executing %s: %v", q, res.Error)
		} else {
			log.Printf("Success: %s -> %d rows affected", q, res.RowsAffected)
		}
	}
}
