package models

import (
	"time"
)

type StaffSalary struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	HotelID   uint       `json:"hotel_id"`
	StaffID   uint       `json:"staff_id"`
	Month     string     `json:"month"` // e.g. "2026-04"
	Amount    float64    `json:"amount"`
	Status    string     `json:"status"` // "paid" or "unpaid"
	PaidOn    *time.Time `json:"paid_on"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}
