package models

import "gorm.io/gorm"

type TaxRate struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	HotelID     uint           `gorm:"not null;index" json:"hotel_id"`
	Hotel       Hotel          `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"hotel,omitempty"`
	Date        string         `gorm:"size:20;index" json:"date"`
	Account     string         `gorm:"size:150;index" json:"account"`
	Type        string         `gorm:"size:80;index" json:"type"`
	Category    string         `gorm:"size:120;index" json:"category"`
	Amount      float64        `json:"amount"`
	Description string         `gorm:"type:text" json:"description"`
	Credit      float64        `json:"credit"`
	Balance     float64        `json:"balance"`
	CreatedAt   int64          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
