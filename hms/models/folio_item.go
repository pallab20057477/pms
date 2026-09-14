package models

import "gorm.io/gorm"

type FolioItem struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	BookingID   uint           `gorm:"not null;index" json:"booking_id"`
	Booking     Booking        `gorm:"foreignKey:BookingID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"booking,omitempty"`
	Description string         `json:"description"`
	Amount      float64        `json:"amount"`
	Type        string         `json:"type"`
	Taxable     bool           `gorm:"default:true" json:"taxable"`
	CreatedAt   int64          `gorm:"autoCreateTime" json:"created_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
