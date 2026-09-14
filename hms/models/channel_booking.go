package models

import "gorm.io/gorm"

type ChannelBooking struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	BookingID          uint           `gorm:"not null;uniqueIndex" json:"booking_id"`
	Booking            Booking        `gorm:"foreignKey:BookingID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"booking,omitempty"`
	ChannelName        string         `gorm:"size:100;not null;index" json:"channel_name"` // e.g. "BookingHotel"
	ChannelBookingID   string         `gorm:"size:150;not null;index" json:"channel_booking_id"` // e.g. "5931218471"
	CommissionAmount   float64        `json:"commission_amount"`
	TaxCurrency        string         `gorm:"size:10" json:"tax_currency"`
	RawPayload         string         `gorm:"type:jsonb" json:"raw_payload"`
	CreatedAt          int64          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt          int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
