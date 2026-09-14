package models

import "gorm.io/gorm"

// HotelReview stores a guest review after checkout.
// One review per booking — enforced by unique index on booking_id.
type HotelReview struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	HotelID      uint           `gorm:"not null;index" json:"hotel_id"`
	BookingID    uint           `gorm:"not null;uniqueIndex" json:"booking_id"` // one review per booking
	PublicUserID uint           `gorm:"not null;index" json:"public_user_id"`
	GuestName    string         `gorm:"not null" json:"guest_name"`
	Rating       int            `gorm:"not null;check:rating >= 1 AND rating <= 5" json:"rating"` // 1–5 stars
	Title        string         `gorm:"size:120" json:"title"`
	Body         string         `gorm:"type:text;not null" json:"body"`
	// Sub-ratings (optional, 1–5 each, 0 = not rated)
	RatingCleanliness int `gorm:"default:0" json:"rating_cleanliness"`
	RatingService     int `gorm:"default:0" json:"rating_service"`
	RatingLocation    int `gorm:"default:0" json:"rating_location"`
	RatingValue       int `gorm:"default:0" json:"rating_value"`
	// Moderation
	Status    string `gorm:"default:'published'" json:"status"` // published | hidden
	CreatedAt int64  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt int64  `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
