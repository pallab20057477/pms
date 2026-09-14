package models

import (
	"time"

	"gorm.io/gorm"
)

type Payment struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	BookingID uint           `gorm:"not null;index" json:"booking_id"`
	Booking   Booking        `gorm:"foreignKey:BookingID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"booking,omitempty"`
	Amount    float64        `json:"amount"`
	Method    string         `json:"method"`
	Reference string         `json:"reference"`
	Status    string         `gorm:"type:varchar(50);default:'success'" json:"status"`
	PaidOn    *time.Time     `gorm:"type:date;index" json:"paid_on"`
	CreatedAt time.Time      `gorm:"autoCreateTime;index" json:"created_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
