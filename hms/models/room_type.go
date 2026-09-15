package models

import (
	"time"

	"gorm.io/gorm"
)

type RoomType struct {
	ID                               uint           `gorm:"primaryKey" json:"id"`
	HotelID                          uint           `gorm:"not null;index:idx_hotel_name,unique" json:"hotel_id"`
	Hotel                            Hotel          `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"hotel,omitempty"`
	Name                             string         `gorm:"not null;index:idx_hotel_name,unique" json:"name"`
	ChannelRoomCode                  string         `gorm:"size:50;index" json:"channel_room_code"` // e.g. "4841" for BookingHotel
	BasePrice                        float64        `json:"base_price"`
	IncludedGuestsOverride           *int           `json:"included_guests_override"`
	ExtraGuestChargePerNightOverride *float64       `json:"extra_guest_charge_per_night_override"`
	Description                      string         `json:"description"`
	MaxOccupancy                     int            `json:"max_occupancy"`
	BedType                          string         `json:"bed_type"`
	RoomSize                         int            `json:"room_size"`
	ViewType                         string         `json:"view_type"`
	Image                            string         `json:"image"`
	Images                           []RoomImage    `gorm:"foreignKey:RoomTypeID" json:"images"`
	Amenities                        []RoomAmenity  `gorm:"many2many:room_type_amenity_maps;joinForeignKey:RoomTypeID;joinReferences:AmenityID" json:"amenities"`
	CreatedAt                        time.Time      `json:"created_at"`
	UpdatedAt                        time.Time      `json:"updated_at"`
	DeletedAt                        gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
