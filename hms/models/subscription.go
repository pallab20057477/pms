package models

import (
	"time"

	"gorm.io/gorm"
)

type Subscription struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	HotelID           uint           `gorm:"not null;index" json:"hotel_id"`
	Tier              string         `gorm:"default:'free'" json:"tier"` // free, premium
	Status            string         `gorm:"default:'active'" json:"status"` // active, suspended, expired
	BookingLimitDaily int            `gorm:"default:5" json:"booking_limit_daily"`
	StartDate         time.Time      `json:"start_date"`
	EndDate           *time.Time     `json:"end_date"`
	AutoRenew         bool           `gorm:"default:true" json:"auto_renew"`
	PaymentStatus     string         `gorm:"default:'unpaid'" json:"payment_status"` // paid, unpaid, failed
	LastPaymentDate   *time.Time     `json:"last_payment_date"`
	RenewalDate       *time.Time     `json:"renewal_date"`
	Notes             string         `json:"notes"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
}

type SubscriptionLog struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	HotelID        uint           `gorm:"not null;index" json:"hotel_id"`
	AdminID        uint           `gorm:"index" json:"admin_id"`
	Action         string         `json:"action"` // created, upgraded, downgraded, suspended, activated
	OldTier        string         `json:"old_tier"`
	NewTier        string         `json:"new_tier"`
	Reason         string         `json:"reason"`
	DurationMonths int            `json:"duration_months"`
	Amount         float64        `json:"amount"`
	PaymentStatus  string         `gorm:"default:'unpaid'" json:"payment_status"` // paid, unpaid, failed
	StartDate      *time.Time     `json:"start_date"`
	EndDate        *time.Time     `json:"end_date"`
	CreatedAt      time.Time      `json:"created_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}
