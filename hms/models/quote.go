package models

import "gorm.io/gorm"

type Quote struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	HotelID     uint           `gorm:"not null;index" json:"hotel_id"`
	Account     string         `gorm:"size:150;index" json:"account"`
	SubjectName string         `gorm:"size:200;index" json:"subject_name"`
	Amount      float64        `json:"amount"`
	EntryDate   string         `gorm:"size:20;index" json:"entry_date"`
	ExpiredDate string         `gorm:"size:20;index" json:"expired_date"`
	Stage       string         `gorm:"size:40;index;default:'draft'" json:"stage"`
	CreatedAt   int64          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
