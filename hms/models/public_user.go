package models

import "gorm.io/gorm"

// PublicUser is the portal guest account — separate from hotel-scoped Guest records.
// provider: "local" | "google"
type PublicUser struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Name         string         `gorm:"not null" json:"name"`
	Email        string         `gorm:"uniqueIndex;not null" json:"email"`
	Phone        string         `gorm:"index" json:"phone"`
	PasswordHash string         `gorm:"column:password_hash" json:"-"`
	Provider     string         `gorm:"type:varchar(20);default:'local'" json:"provider"` // local | google
	ProviderID   string         `gorm:"index" json:"provider_id,omitempty"`               // google sub id
	EmailVerified bool          `gorm:"default:false" json:"email_verified"`
	CreatedAt    int64          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}
