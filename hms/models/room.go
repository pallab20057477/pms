package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

type Room struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	HotelID           uint           `gorm:"not null;index:idx_hotel_status;index:idx_hotel_room_number,unique" json:"hotel_id"`
	Hotel             Hotel          `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"hotel,omitempty"`
	RoomTypeID        uint           `gorm:"not null;default:0;index" json:"room_type_id"`
	RoomType          RoomType       `gorm:"foreignKey:RoomTypeID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"room_type_details,omitempty"`
	RoomNumber        string         `gorm:"not null;index:idx_hotel_room_number,unique" json:"room_number"`
	Status            string         `json:"status" gorm:"default:'available';index:idx_hotel_status"`
	MaintenanceReason string         `json:"maintenance_reason"`
	MaintenanceUntil  *time.Time     `json:"maintenance_until"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

func (r Room) MarshalJSON() ([]byte, error) {
	type Alias Room
	images := r.RoomType.Images
	if images == nil {
		images = []RoomImage{}
	}
	amenities := r.RoomType.Amenities
	if amenities == nil {
		amenities = []RoomAmenity{}
	}
	return json.Marshal(&struct {
		Alias
		RoomTypeString string        `json:"room_type"`
		RoomTypeObj    RoomType      `json:"room_type_details"`
		BasePrice      float64       `json:"base_price"`
		MaxOccupancy   int           `json:"max_occupancy"`
		BedType        string        `json:"bed_type"`
		RoomSize       int           `json:"room_size"`
		ViewType       string        `json:"view_type"`
		Description    string        `json:"description"`
		Images         []RoomImage   `json:"images"`
		Amenities      []RoomAmenity `json:"amenities"`
		Image          string        `json:"image"`
	}{
		Alias:          Alias(r),
		RoomTypeString: r.RoomType.Name,
		RoomTypeObj:    r.RoomType,
		BasePrice:      r.RoomType.BasePrice,
		MaxOccupancy:   r.RoomType.MaxOccupancy,
		BedType:        r.RoomType.BedType,
		RoomSize:       r.RoomType.RoomSize,
		ViewType:       r.RoomType.ViewType,
		Description:    r.RoomType.Description,
		Images:         images,
		Amenities:      amenities,
		Image:          r.RoomType.Image,
	})
}
