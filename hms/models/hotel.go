package models

import (
	"time"

	"gorm.io/gorm"
)

type Hotel struct {
	ID                  uint       `gorm:"primaryKey" json:"id"`
	AdminID             *uint      `gorm:"index" json:"admin_id"` // nullable to handle existing data
	Name                string     `gorm:"not null;index" json:"name"`
	Address1            string     `json:"address1"`
	Address2            string     `json:"address2"`
	City                string     `gorm:"index" json:"city"`
	State               string     `json:"state"`
	Pincode             string     `json:"pincode"`
	Phone               string     `json:"phone"`
	Email               string     `json:"email"`
	Country             string     `json:"country"`
	TaxType             string     `json:"tax_type"`
	TaxPercent          float64    `json:"tax_percent"`
	GSTNumber           string     `json:"gst_number"`
	PANNumber           string     `json:"pan_number"`
	Logo                string     `json:"logo"`
	Description         string     `json:"description"`
	PropertyType        string     `gorm:"default:'Hotel'" json:"property_type"`
	StarRating          int        `gorm:"default:3" json:"star_rating"`
	Website             string     `json:"website"`
	Status              string     `gorm:"default:'active';index:idx_hotel_public" json:"status"`          // active, suspended
	SubscriptionTier    string     `gorm:"default:'free'" json:"subscription_tier"` // free, premium
	BookingLimitPerDay  int        `gorm:"default:5" json:"booking_limit_per_day"`
	SubscriptionStatus  string     `gorm:"default:'active';index:idx_hotel_public" json:"subscription_status"` // active, suspended, expired
	SubscriptionEndDate *time.Time `json:"subscription_end_date"`
	LastPaymentDate     *time.Time `json:"last_payment_date"`

	// Public booking URL security token (regenerable)
	PublicToken string `gorm:"index" json:"public_token"`
	BookingEnabled bool `gorm:"default:true;index:idx_hotel_public" json:"booking_enabled"`
	BookingBaseUrl string `json:"booking_base_url"`
	BookingPath string `gorm:"default:'/book'" json:"booking_path"`
	BookingCampaignTag string `json:"booking_campaign_tag"`
	AdvancePaymentPercent float64 `gorm:"default:0" json:"advance_payment_percent"` // 0 to 100% advance deposit required for online booking
	ChannelHotelCode string `gorm:"size:50;index" json:"channel_hotel_code"` // e.g. "137" for BookingHotel

	// Feature flags — controlled by super admin
	FeatureOnlinePayment   bool `gorm:"default:false" json:"feature_online_payment"`
	FeatureReports         bool `gorm:"default:true"  json:"feature_reports"`
	FeatureStaffPayroll    bool `gorm:"default:false" json:"feature_staff_payroll"`
	FeatureHousekeeping    bool `gorm:"default:true"  json:"feature_housekeeping"`
	FeatureEmailNotify     bool `gorm:"default:false" json:"feature_email_notify"`
	FeatureSeasonalPricing bool `gorm:"default:false" json:"feature_seasonal_pricing"`
	FeatureChannelManager  bool `gorm:"default:true"  json:"feature_channel_manager"`

	// Aggregated rating (updated via trigger or cron)
	AvgRating float64 `gorm:"default:0" json:"avg_rating"`

	// Per-hotel Online Payment Gateway Configuration (set by super admin)
	// PaymentGateway options: "razorpay", "phonepe"
	PaymentGateway    string `gorm:"size:50;default:'razorpay'" json:"payment_gateway"`

	// Per-hotel Razorpay credentials (set by super admin)
	RazorpayKeyID     string `gorm:"size:100" json:"razorpay_key_id"`
	RazorpayKeySecret string `gorm:"size:200" json:"-"` // never expose secret in JSON responses

	// Per-hotel PhonePe credentials (set by super admin)
	PhonePeMerchantID string `gorm:"size:100" json:"phonepe_merchant_id"`
	PhonePeSaltKey    string `gorm:"size:200" json:"-"` // never expose secret in JSON responses
	PhonePeSaltIndex  string `gorm:"size:20;default:'1'" json:"phonepe_salt_index"`
	PhonePeEnv        string `gorm:"size:20;default:'UAT'" json:"phonepe_env"` // "UAT" (Sandbox) or "PRODUCTION"

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
