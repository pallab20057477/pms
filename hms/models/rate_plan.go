package models

// RatePlan represents a hotel's specific pricing and meal plan (e.g., EP, CP, MAP, AP)
type RatePlan struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	HotelID     uint   `gorm:"not null;index" json:"hotel_id"`
	Hotel       Hotel  `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"hotel,omitempty"`
	Name        string `gorm:"not null" json:"name"`        // e.g., "Standard Rate", "Breakfast Included"
	Description string `json:"description"`                 // e.g., "Room and Breakfast"
	MealPlan    string `json:"meal_plan"`                   // e.g., "EP", "CP", "MAP", "AP"
	IsActive    bool   `gorm:"default:true" json:"is_active"`
	CreatedAt   int64  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   int64  `gorm:"autoUpdateTime" json:"updated_at"`
}
