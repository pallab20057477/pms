package models

import (
	"time"
)

type StaffIncrement struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	StaffID   uint      `gorm:"index;not null" json:"staff_id"`
	HotelID   uint      `gorm:"index;not null" json:"hotel_id"`
	Amount    float64   `json:"amount"`
	NewSalary float64   `json:"new_salary"`
	Reason    string    `json:"reason"`
	AdminID   uint      `json:"admin_id"`
	CreatedAt time.Time `json:"created_at"`
}
