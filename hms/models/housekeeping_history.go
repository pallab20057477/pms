package models

type HousekeepingHistory struct {
	ID             uint   `gorm:"primaryKey" json:"id"`
	HotelID        uint   `gorm:"index" json:"hotel_id"`
	RoomID         uint   `gorm:"index" json:"room_id"`
	RoomNumber     string `json:"room_number"`
	PreviousStatus string `json:"previous_status"`
	CurrentStatus  string `json:"current_status"`
	StaffID        *uint  `gorm:"index;constraint:OnDelete:SET NULL;" json:"staff_id"`
	AssignedTo     string `json:"assigned_to"`
	StartTime      string `json:"start_time"`
	EndTime        string `json:"end_time"`
	DurationMin    int64  `json:"duration_min"`
	Notes          string `json:"notes"`
	CreatedAt      int64  `gorm:"autoCreateTime;index" json:"created_at"`
}
