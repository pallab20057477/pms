package models

import (
	"gorm.io/gorm"
)

type Admin struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	Username          string         `gorm:"unique;not null" json:"username"`
	Name              string         `json:"name"`
	Email             string         `gorm:"uniqueIndex" json:"email"`
	Phone             string         `json:"phone"`
	ProfilePhoto      string         `json:"profile_photo"`
	PasswordHash      string         `gorm:"not null" json:"-"`
	LastActiveHotelID uint           `json:"last_active_hotel_id"`
	IsSuperAdmin      bool           `gorm:"default:false" json:"is_super_admin"`
	Status            string         `gorm:"default:'active'" json:"status"` // active, suspended, inactive
	CreatedAt         int64          `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt         int64          `gorm:"autoUpdateTime:milli" json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
}
