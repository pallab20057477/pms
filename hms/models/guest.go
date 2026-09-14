package models

import "gorm.io/gorm"

type Guest struct {
	ID             uint   `gorm:"primaryKey" json:"id"`
	HotelID        uint   `gorm:"not null;index:idx_guest_hotel_phone;index:idx_guest_hotel_email" json:"hotel_id"`
	Hotel          Hotel  `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"hotel,omitempty"`
	Name           string `gorm:"not null" json:"name"`
	Phone          string `gorm:"index:idx_guest_hotel_phone" json:"phone"`
	Email          string `gorm:"index:idx_guest_hotel_email" json:"email"`
	Gender         string `gorm:"type:varchar(20)" json:"gender"`
	Nationality    string `gorm:"type:varchar(100)" json:"nationality"`
	DateOfBirth    string `gorm:"type:varchar(20)" json:"date_of_birth"`
	LoyaltyTier    string `gorm:"type:varchar(50)" json:"loyalty_tier"`
	Photo          string `json:"photo"`
	ProofDocument  string `json:"proof_document"`
	ProofDocuments string `gorm:"type:text" json:"proof_documents"` // JSON array or map of proof documents
	IDType         string         `gorm:"type:varchar(50)" json:"id_type"`
	IDNumber       string         `gorm:"type:varchar(100)" json:"id_number"`
	IDVerified     bool           `json:"id_verified"`
	Preferences string         `json:"preferences"` // Only guest notes, never proof document info
	Address     string         `json:"address"`
	City        string         `json:"city"`
	State       string         `json:"state"`
	Pincode     string         `json:"pincode"`
	Country     string         `json:"country"`
	CreatedAt   int64          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
