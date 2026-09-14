package models

type PartnerIntegration struct {
	ID              uint   `gorm:"primaryKey" json:"id"`
	PartnerName     string `gorm:"uniqueIndex;not null" json:"partner_name"` // e.g., "BookingHotel"
	InventoryURL    string `json:"inventory_url"` // OTA's URL to receive our inventory updates
	IsActive        bool   `gorm:"default:true" json:"is_active"`
	CreatedAt       int64  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt       int64  `gorm:"autoUpdateTime" json:"updated_at"`
}
