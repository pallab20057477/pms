package models

import (
	"time"

	"gorm.io/gorm"
)

type RoomImage struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	RoomTypeID    uint           `gorm:"not null;default:0;index" json:"room_type_id"`
	URL       string         `json:"url"`
	Order     int            `json:"order"`
	IsPrimary bool           `json:"is_primary" gorm:"default:false"`
	CreatedAt time.Time      `gorm:"autoCreateTime" json:"created_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
