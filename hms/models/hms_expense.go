package models

import (
	"gorm.io/gorm"
)

// HmsExpense represents an expense record in the system
// TableName: hms_expenses

type HmsExpense struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	HotelID     uint           `gorm:"index" json:"hotel_id"`
	Title       string         `gorm:"size:200;not null" json:"title"`
	Category    string         `gorm:"size:100;not null" json:"category"`
	Amount      string         `gorm:"not null" json:"amount"`
	ExpenseDate string         `gorm:"not null" json:"expense_date"`
	Notes       string         `gorm:"type:text" json:"notes"`
	Status      bool           `gorm:"not null" json:"status"`
	CreatedAt   int64          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

func (HmsExpense) TableName() string {
	return "hms_expenses"
}
