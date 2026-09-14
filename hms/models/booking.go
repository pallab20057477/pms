package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

type Booking struct {
	ID                  uint           `gorm:"primaryKey" json:"id"`
	BookingCode         string         `gorm:"unique;not null" json:"booking_code"`
	HotelID             uint           `gorm:"not null;index:idx_booking_hotel_dates;index:idx_booking_hotel_status" json:"hotel_id"`
	Hotel               Hotel          `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"hotel,omitempty"`
	GuestID             uint           `gorm:"not null;index" json:"guest_id"`
	Guest               Guest          `gorm:"foreignKey:GuestID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"guest,omitempty"`
	PublicUserID        *uint          `gorm:"index" json:"public_user_id,omitempty"`
	PublicUser          *PublicUser    `gorm:"foreignKey:PublicUserID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"public_user,omitempty"`
	RoomTypeID          uint           `gorm:"not null;default:0;index" json:"room_type_id"`
	RoomType            RoomType       `gorm:"foreignKey:RoomTypeID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"room_type_details,omitempty"`
	RoomID              *uint          `gorm:"index" json:"room_id"` // Nullable, assigned later for OTA
	Room                *Room          `gorm:"foreignKey:RoomID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"room,omitempty"`
	CheckInDate         time.Time      `gorm:"type:date;index:idx_booking_hotel_dates" json:"check_in_date"`
	CheckOutDate        time.Time      `gorm:"type:date;index:idx_booking_hotel_dates" json:"check_out_date"`
	ActualCheckInAt     *time.Time     `json:"actual_check_in_at"`
	ActualCheckOutAt    *time.Time     `json:"actual_check_out_at"`
	Status              string         `gorm:"index:idx_booking_hotel_status" json:"status"`
	RatePlan            string         `json:"rate_plan"`
	BaseRate            float64        `json:"base_rate"`
	Discount            float64        `json:"discount"`
	DiscountReason      string         `json:"discount_reason"`
	DiscountType        string         `json:"discount_type"`
	ApplyOn             string         `json:"apply_on"` // before_tax or after_tax
	BookingSource       string         `gorm:"type:varchar(100)" json:"booking_source"`
	MarketSegment       string         `gorm:"type:varchar(100)" json:"market_segment"`
	ExpectedArrivalTime string         `gorm:"type:varchar(20)" json:"expected_arrival_time"`
	Tax                 float64        `json:"tax"`
	TaxRate             float64        `json:"tax_rate"`
	TotalAmount         float64        `json:"total_amount"`
	AdvancePayment      float64        `json:"advance_payment"`
	CancellationReason  string         `json:"cancellation_reason"`
	RefundOption        string         `json:"refund_option"`
	RefundAmount        float64        `json:"refund_amount"`
	SpecialRequests     string         `json:"special_requests"`
	TotalGuests         int            `gorm:"default:1" json:"total_guests"`
	CompanionDetails    string         `gorm:"type:text" json:"companion_details"`
	CompanionDocuments  string         `gorm:"type:text" json:"companion_documents"`
	CreatedAt           int64          `gorm:"autoCreateTime;index" json:"created_at"`
	DeletedAt           gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

func (b Booking) MarshalJSON() ([]byte, error) {
	type Alias Booking
	roomTypeName := b.RoomType.Name
	if roomTypeName == "" && b.Room != nil && b.Room.RoomType.Name != "" {
		roomTypeName = b.Room.RoomType.Name
	}
	var roomNumber string
	if b.Room != nil {
		roomNumber = b.Room.RoomNumber
	}
	return json.Marshal(&struct {
		Alias
		RoomTypeString string   `json:"room_type"`
		RoomTypeObj    RoomType `json:"room_type_details"`
		RoomNumber     string   `json:"room_number,omitempty"`
	}{
		Alias:          Alias(b),
		RoomTypeString: roomTypeName,
		RoomTypeObj:    b.RoomType,
		RoomNumber:     roomNumber,
	})
}
