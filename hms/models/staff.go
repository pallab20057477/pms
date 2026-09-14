package models

import "gorm.io/gorm"

type Staff struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	HotelID           uint           `gorm:"not null;index;uniqueIndex:idx_staff_hotel_phone" json:"hotel_id"`
	Hotel             Hotel          `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"hotel,omitempty"`
	Name              string         `gorm:"not null" json:"name"`
	CountryCode       string         `gorm:"size:10;default:'+91'" json:"country_code"`
	Email             string         `json:"email"`
	Phone             string         `gorm:"not null;uniqueIndex:idx_staff_hotel_phone" json:"phone"`
	AltPhone          string         `json:"alt_phone"`
	AltEmail          string         `json:"alt_email"`
	FamilyContactName string         `json:"family_contact_name"`
	FamilyPhone       string         `json:"family_phone"`
	HouseStreet       string         `json:"house_street"`
	City              string         `json:"city"`
	District          string         `json:"district"`
	State             string         `json:"state"`
	Pincode           string         `json:"pincode"`
	Country           string         `json:"country"`
	Role              string         `gorm:"not null" json:"role"`
	Photo             string         `json:"photo"`
	StaffDocument     string         `json:"staff_document"`
	StaffDocumentType string         `gorm:"size:80" json:"staff_document_type"`
	Notes             string         `gorm:"type:text" json:"notes"`
	BasicSalary       float64        `json:"basic_salary"`
	Allowances        float64        `json:"allowances"`
	GrossSalary       float64        `json:"gross_salary"`
	EmploymentStatus  string         `gorm:"default:'Working'" json:"employment_status"`
	PortalAccess      bool           `gorm:"default:true" json:"portal_access"`
	CRMPasswordHash   string         `json:"-"`
	Status            bool           `gorm:"default:true" json:"status"`
	JoinDate          string         `json:"join_date"`
	CreatedAt         int64          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt         int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
