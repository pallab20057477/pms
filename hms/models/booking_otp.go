package models

import "time"

// BookingOTP stores the OTP and QR token for guest check-in verification.
type BookingOTP struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	BookingID  uint      `gorm:"not null;index" json:"booking_id"`
	HotelID    uint      `gorm:"not null" json:"hotel_id"`
	OTP        string    `gorm:"size:6" json:"-"`          // 6-digit OTP, never exposed in JSON
	QRToken    string    `gorm:"size:64;uniqueIndex" json:"qr_token"` // secure random token for QR
	OTPExpiry  time.Time `json:"otp_expiry"`
	QRExpiry   time.Time `json:"qr_expiry"`
	OTPUsed    bool      `gorm:"default:false" json:"otp_used"`
	QRUsed     bool      `gorm:"default:false" json:"qr_used"`
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"created_at"`
}
