package models

type IntegrationWebhookEvent struct {
	ID              uint   `gorm:"primaryKey" json:"id"`
	Provider        string `gorm:"size:80;index" json:"provider"`
	EventType       string `gorm:"size:80;index" json:"event_type"`
	HotelID         uint   `gorm:"index" json:"hotel_id"`
	ProviderEventID string `gorm:"size:180;index" json:"provider_event_id"`
	SignatureValid  bool   `gorm:"default:false" json:"signature_valid"`
	Status          string `gorm:"size:30;index;default:'received'" json:"status"` // received, processed, ignored, failed
	Payload         string `gorm:"type:jsonb" json:"payload"`
	LastError       string `gorm:"type:text" json:"last_error"`
	ProcessedAt     int64  `json:"processed_at"`
	CreatedAt       int64  `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt       int64  `gorm:"autoUpdateTime" json:"updated_at"`
}
