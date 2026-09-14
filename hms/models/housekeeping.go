package models

type Housekeeping struct {
	ID         uint   `gorm:"primaryKey" json:"id"`
	RoomID     uint   `gorm:"not null" json:"room_id"`
	Status     string `json:"status"`
	StaffID    *uint  `gorm:"index;constraint:OnDelete:SET NULL;" json:"staff_id"`
	AssignedTo string `json:"assigned_to"`
	StartTime  string `json:"start_time"`
	EndTime    string `json:"end_time"`
	Notes      string `json:"notes"`
}
