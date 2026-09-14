package models

type IntegrationSyncJob struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	HotelID     uint   `gorm:"not null;index" json:"hotel_id"`
	ChannelID   string `gorm:"size:120;index" json:"channel_id"`
	Provider    string `gorm:"size:60;index" json:"provider"`
	EventType   string `gorm:"size:80;index" json:"event_type"`
	EntityType  string `gorm:"size:40;index" json:"entity_type"`
	EntityID    uint   `gorm:"index" json:"entity_id"`
	DedupeKey   string `gorm:"size:200;index" json:"dedupe_key"`
	Status      string `gorm:"size:30;index;default:'queued'" json:"status"` // queued, processing, success, failed
	Attempts    int    `gorm:"default:0" json:"attempts"`
	NextRetryAt int64  `gorm:"index" json:"next_retry_at"`
	LastError   string `gorm:"type:text" json:"last_error"`
	Payload     string `gorm:"type:jsonb" json:"payload"`
	Response    string `gorm:"type:jsonb" json:"response"`
	CreatedAt   int64  `gorm:"autoCreateTime;index" json:"created_at"`
	ProcessedAt int64  `json:"processed_at"`
	UpdatedAt   int64  `gorm:"autoUpdateTime" json:"updated_at"`
}
