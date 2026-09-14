package models

import "time"

type PlanSetting struct {
	ID                     uint      `gorm:"primaryKey" json:"id"`
	TierName               string    `gorm:"uniqueIndex;not null" json:"tier_name"` // free, pro, premium
	Price                  float64   `gorm:"default:0" json:"price"`
	BookingLimitPerDay     int       `gorm:"default:5" json:"booking_limit_per_day"`
	FeatureOnlinePayment   bool      `gorm:"default:false" json:"feature_online_payment"`
	FeatureReports         bool      `gorm:"default:false" json:"feature_reports"`
	FeatureStaffPayroll    bool      `gorm:"default:false" json:"feature_staff_payroll"`
	FeatureHousekeeping    bool      `gorm:"default:false" json:"feature_housekeeping"`
	FeatureEmailNotify     bool      `gorm:"default:false" json:"feature_email_notify"`
	FeatureSeasonalPricing bool      `gorm:"default:false" json:"feature_seasonal_pricing"`
	FeatureChannelManager  bool      `gorm:"default:false" json:"feature_channel_manager"`
	UpdatedAt              time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}
