package models

import "gorm.io/gorm"

type Invoice struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	HotelID       uint           `gorm:"not null;index" json:"hotel_id"`
	Hotel         Hotel          `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"hotel,omitempty"`
	BookingID     uint           `gorm:"not null;unique" json:"booking_id"`
	Booking       Booking        `gorm:"foreignKey:BookingID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"booking,omitempty"`
	InvoiceNumber int64          `gorm:"uniqueIndex" json:"invoice_number"`
	InvoiceNo     string         `gorm:"not null;unique" json:"invoice_no"`
	Status        string         `gorm:"type:varchar(20);default:'unpaid'" json:"status"`
	InvoiceDate   string         `json:"invoice_date"`
	Subtotal      float64        `json:"subtotal"`
	TaxPart1      float64        `json:"tax_part1"`
	TaxPart2      float64        `json:"tax_part2"`
	TaxTotal      float64        `json:"tax_total"`
	TotalAmount   float64        `json:"total_amount"`
	CreatedAt     int64          `gorm:"autoCreateTime" json:"created_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}
