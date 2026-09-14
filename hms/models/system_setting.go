package models

type SystemSetting struct {
	ID                       uint    `gorm:"primaryKey" json:"id"`
	HotelID                  uint    `gorm:"not null;uniqueIndex" json:"hotel_id"`
	Hotel                    Hotel   `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"hotel,omitempty"`
	IncludedGuests           int     `gorm:"default:1" json:"included_guests"`
	ExtraGuestPerNight       float64 `gorm:"default:500" json:"extra_guest_charge_per_night"`
	CheckoutTime             string  `gorm:"default:'11:00'" json:"checkout_time"`
	CheckinTime              string  `gorm:"default:'14:00'" json:"checkin_time"`
	LateCheckoutGraceMinutes int     `gorm:"default:30" json:"late_checkout_grace_minutes"`
	LateCheckoutHourlyCharge float64 `gorm:"default:0" json:"late_checkout_hourly_charge"`
	AllowLateCheckout        bool    `gorm:"default:true" json:"allow_late_checkout"`
	DefaultOfferEnabled      bool    `gorm:"default:false" json:"default_offer_enabled"`
	DefaultOfferName         string  `gorm:"default:'Special Offer'" json:"default_offer_name"`
	DefaultOfferPercent      float64 `gorm:"default:0" json:"default_offer_percent"`
	InvoicePrefix            string  `gorm:"default:'INV'" json:"invoice_prefix"`
	CompanyName              string  `json:"company_name"`
	Currency                 string  `gorm:"default:'INR'" json:"currency"`
	DateFormat               string  `gorm:"default:'DD-MM-YYYY'" json:"date_format"`
	TimeZone                 string  `gorm:"default:'Asia/Kolkata'" json:"time_zone"`
	LastClosedDate           string  `json:"last_closed_date"`
	CreatedAt                int64   `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt                int64   `gorm:"autoUpdateTime" json:"updated_at"`
}
