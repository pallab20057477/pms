package utils

import (
	"fmt"
	"time"
)

// GenerateBookingID returns a stable booking id string using hotel id + unix timestamp
func GenerateBookingID(hotelID uint) string {
	return fmt.Sprintf("BKG-%d-%d", hotelID, time.Now().Unix())
}
