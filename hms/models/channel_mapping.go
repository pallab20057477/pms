package models

type ChannelHotelMapping struct {
	ID                   uint   `gorm:"primaryKey" json:"id"`
	HotelID              uint   `gorm:"index;not null" json:"hotel_id"`
	PartnerIntegrationID uint   `gorm:"index;not null" json:"partner_integration_id"`
	OTAHotelCode         string `gorm:"not null" json:"ota_hotel_code"`
	IsActive             bool   `gorm:"default:true" json:"is_active"`
	OTAUsername          string `json:"ota_username"`
	OTAPassword          string `json:"ota_password"`
	CreatedAt            int64  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt            int64  `gorm:"autoUpdateTime" json:"updated_at"`
}

type ChannelRoomMapping struct {
	ID                   uint   `gorm:"primaryKey" json:"id"`
	HotelID              uint   `gorm:"index;not null" json:"hotel_id"`
	PartnerIntegrationID uint   `gorm:"index;not null" json:"partner_integration_id"`
	RoomTypeID           uint   `gorm:"index;not null" json:"room_type_id"`
	OTARoomTypeCode      string `gorm:"not null" json:"ota_room_type_code"`
	CreatedAt            int64  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt            int64  `gorm:"autoUpdateTime" json:"updated_at"`
}

type ChannelRateMapping struct {
	ID                   uint   `gorm:"primaryKey" json:"id"`
	HotelID              uint   `gorm:"index;not null" json:"hotel_id"`
	PartnerIntegrationID uint   `gorm:"index;not null" json:"partner_integration_id"`
	PlanID               uint   `gorm:"index;not null" json:"plan_id"`
	OTARatePlanCode      string `gorm:"not null" json:"ota_rate_plan_code"`
	CreatedAt            int64  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt            int64  `gorm:"autoUpdateTime" json:"updated_at"`
}
