package models

type ActivityLog struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	HotelID     uint   `json:"hotel_id"`
	Module      string `json:"module"`
	Action      string `gorm:"index" json:"action"`
	Reference   string `gorm:"index" json:"reference"`
	AdminID     uint   `gorm:"index" json:"admin_id"`
	ReferenceID uint   `json:"reference_id"`
	Description string `json:"description"`
	CreatedAt   int64  `gorm:"autoCreateTime" json:"created_at"`
}
