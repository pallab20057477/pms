package models

import "gorm.io/gorm"

type Task struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	HotelID     uint           `gorm:"not null;index" json:"hotel_id"`
	Hotel       Hotel          `gorm:"foreignKey:HotelID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"hotel,omitempty"`
	Name        string         `gorm:"size:200;not null" json:"name"`
	DueDate     string         `gorm:"size:20;index" json:"due_date"`
	Description string         `gorm:"type:text" json:"description"`
	StaffID     *uint          `gorm:"index" json:"staff_id"`
	Staff       *Staff         `gorm:"foreignKey:StaffID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"staff,omitempty"`
	AssignedTo  string         `gorm:"size:150;index" json:"assigned_to"`
	Status      string         `gorm:"size:30;index;default:'running'" json:"status"`
	CreatedAt   int64          `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   int64          `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
