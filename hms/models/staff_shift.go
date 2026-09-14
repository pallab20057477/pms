package models

import "gorm.io/gorm"

type StaffShift struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	HotelID       uint           `gorm:"not null;index" json:"hotel_id"`
	StaffID       uint           `gorm:"not null;index" json:"staff_id"`
	ShiftDate     string         `gorm:"not null;index" json:"shift_date"`
	CheckInAt     string         `json:"check_in_at"`
	CheckOutAt    string         `json:"check_out_at"`
	MinutesWorked int64          `json:"minutes_worked"`
	Status        string         `gorm:"not null;default:open;index" json:"status"`
	Notes         string         `gorm:"type:text" json:"notes"`
	CreatedAt     int64          `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt     int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
