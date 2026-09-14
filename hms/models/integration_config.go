package models

type IntegrationConfig struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	HotelID   uint   `gorm:"not null;uniqueIndex" json:"hotel_id"`
	Config    string `gorm:"type:jsonb" json:"config"`
	CreatedAt int64  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt int64  `gorm:"autoUpdateTime" json:"updated_at"`
}
