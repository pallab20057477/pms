package models

type RoomAmenityMap struct {
	ID        uint `gorm:"primaryKey" json:"id"`
	RoomID    uint `gorm:"not null" json:"room_id"`
	AmenityID uint `gorm:"not null" json:"amenity_id"`
}
