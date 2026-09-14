package models

import "time"

type SeasonalPricingRule struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	HotelID           uint      `gorm:"not null;index:idx_pricing_rule_hotel_type_active" json:"hotel_id"`
	RoomType          string    `gorm:"not null;index:idx_pricing_rule_hotel_type_active" json:"room_type"`
	AdjustmentPercent float64   `json:"adjustment_percent"`
	ValidFrom         time.Time `gorm:"type:date;index" json:"valid_from"`
	ValidTo           time.Time `gorm:"type:date;index" json:"valid_to"`
	Active            bool      `gorm:"default:true;index:idx_pricing_rule_hotel_type_active" json:"active"`
	CreatedAt         int64     `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt         int64     `gorm:"autoUpdateTime" json:"updated_at"`
}
