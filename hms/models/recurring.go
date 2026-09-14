package models

import "gorm.io/gorm"

type Recurring struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	HotelID     uint           `gorm:"not null;index" json:"hotel_id"`
	CustomerID  uint           `gorm:"index" json:"customer_id"`
	Amount      float64        `json:"amount"`
	InvoiceNo   string         `gorm:"size:80;index" json:"invoice_no"`
	InvoiceDate string         `gorm:"size:20;index" json:"invoice_date"`
	DueDate     string         `gorm:"size:20;index" json:"due_date"`
	Status      string         `gorm:"size:30;index;default:'draft'" json:"status"`
	IsRecurring bool           `gorm:"default:true" json:"is_recurring"`
	CreatedAt   int64          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
