package repositories

import (
	"hms/config"
	"hms/models"
)

type HotelRepository interface {
	Create(hotel *models.Hotel) error
	FindByIDAndAdmin(id uint, adminID uint) (*models.Hotel, error)
	FindByID(id uint) (*models.Hotel, error)
	ListByAdmin(adminID uint) ([]models.Hotel, error)
	ListAllActive() ([]models.Hotel, error)
	Update(hotel *models.Hotel) error
	Delete(id uint) error
	GetByPublicToken(token string) (*models.Hotel, error)
	HasRooms(hotelID uint) (bool, error)
	HasBookings(hotelID uint) (bool, error)
}

type hotelRepository struct{}

func NewHotelRepository() HotelRepository {
	return &hotelRepository{}
}

func (r *hotelRepository) Create(hotel *models.Hotel) error {
	return config.DB.Create(hotel).Error
}

func (r *hotelRepository) FindByIDAndAdmin(id uint, adminID uint) (*models.Hotel, error) {
	var h models.Hotel
	err := config.DB.Where("id = ? AND admin_id = ?", id, adminID).Take(&h).Error
	return &h, err
}

func (r *hotelRepository) FindByID(id uint) (*models.Hotel, error) {
	var h models.Hotel
	err := config.DB.Where("id = ?", id).Take(&h).Error
	return &h, err
}

func (r *hotelRepository) ListByAdmin(adminID uint) ([]models.Hotel, error) {
	var hotels []models.Hotel
	err := config.DB.Where("admin_id = ?", adminID).Order("id asc").Find(&hotels).Error
	return hotels, err
}

func (r *hotelRepository) ListAllActive() ([]models.Hotel, error) {
	var hotels []models.Hotel
	err := config.DB.Where("status = 'active'").Order("id asc").Find(&hotels).Error
	return hotels, err
}

func (r *hotelRepository) Update(hotel *models.Hotel) error {
	return config.DB.Save(hotel).Error
}

func (r *hotelRepository) Delete(id uint) error {
	return config.DB.Delete(&models.Hotel{}, id).Error
}

func (r *hotelRepository) GetByPublicToken(token string) (*models.Hotel, error) {
	var h models.Hotel
	err := config.DB.Where("public_token = ?", token).Take(&h).Error
	return &h, err
}

func (r *hotelRepository) HasRooms(hotelID uint) (bool, error) {
	var count int64
	err := config.DB.Model(&models.Room{}).Where("hotel_id = ?", hotelID).Count(&count).Error
	return count > 0, err
}

func (r *hotelRepository) HasBookings(hotelID uint) (bool, error) {
	var count int64
	err := config.DB.Model(&models.Booking{}).Where("hotel_id = ?", hotelID).Count(&count).Error
	return count > 0, err
}
