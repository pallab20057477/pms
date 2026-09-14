package repositories

import (
	"hms/config"
	"hms/models"

	"gorm.io/gorm"
)

type RoomRepository interface {
	Create(room *models.Room) error
	FindByIDAndHotel(id uint, hotelID uint) (*models.Room, error)
	ListByHotel(hotelID uint) ([]models.Room, error)
	ListByStatus(hotelID uint, status string) ([]models.Room, error)
	Update(room *models.Room) error
	Delete(id uint) error
	HasBookings(roomID uint) (bool, error)
}

type roomRepository struct{}

func NewRoomRepository() RoomRepository {
	return &roomRepository{}
}

func roomQueryWithRelations(db *gorm.DB) *gorm.DB {
	return db.Preload("RoomType").
		Preload("RoomType.Images", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("\"is_primary\" desc, \"order\" asc, id asc")
		}).
		Preload("RoomType.Amenities", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("name asc")
		})
}

func (r *roomRepository) Create(room *models.Room) error {
	return config.DB.Create(room).Error
}

func (r *roomRepository) FindByIDAndHotel(id uint, hotelID uint) (*models.Room, error) {
	var room models.Room
	err := roomQueryWithRelations(config.DB).Where("id = ? AND hotel_id = ?", id, hotelID).Take(&room).Error
	return &room, err
}

func (r *roomRepository) ListByHotel(hotelID uint) ([]models.Room, error) {
	var rooms []models.Room
	err := roomQueryWithRelations(config.DB).Where("hotel_id = ?", hotelID).Order("room_number asc").Find(&rooms).Error
	return rooms, err
}

func (r *roomRepository) ListByStatus(hotelID uint, status string) ([]models.Room, error) {
	var rooms []models.Room
	err := roomQueryWithRelations(config.DB).Where("hotel_id = ? AND status = ?", hotelID, status).Order("room_number asc").Find(&rooms).Error
	return rooms, err
}

func (r *roomRepository) Update(room *models.Room) error {
	return config.DB.Save(room).Error
}

func (r *roomRepository) Delete(id uint) error {
	return config.DB.Delete(&models.Room{}, id).Error
}

func (r *roomRepository) HasBookings(roomID uint) (bool, error) {
	var count int64
	err := config.DB.Model(&models.Booking{}).Where("room_id = ?", roomID).Count(&count).Error
	return count > 0, err
}
