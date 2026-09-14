package repositories

import (
	"hms/config"
	"hms/models"
)

type GuestRepository interface {
	Create(guest *models.Guest) error
	FindByIDAndHotel(id uint, hotelID uint) (*models.Guest, error)
	ListByHotel(hotelID uint) ([]models.Guest, error)
	SearchByHotel(hotelID uint, query string) ([]models.Guest, error)
	Update(guest *models.Guest) error
	Delete(id uint) error
	HasBookings(guestID uint) (bool, error)
}

type guestRepository struct{}

func NewGuestRepository() GuestRepository {
	return &guestRepository{}
}

func (r *guestRepository) Create(guest *models.Guest) error {
	return config.DB.Create(guest).Error
}

func (r *guestRepository) FindByIDAndHotel(id uint, hotelID uint) (*models.Guest, error) {
	var guest models.Guest
	err := config.DB.Where("id = ? AND hotel_id = ?", id, hotelID).Take(&guest).Error
	return &guest, err
}

func (r *guestRepository) ListByHotel(hotelID uint) ([]models.Guest, error) {
	var guests []models.Guest
	err := config.DB.Where("hotel_id = ?", hotelID).Order("id desc").Find(&guests).Error
	return guests, err
}

func (r *guestRepository) SearchByHotel(hotelID uint, query string) ([]models.Guest, error) {
	var guests []models.Guest
	like := "%" + query + "%"
	err := config.DB.Where("hotel_id = ? AND (name ILIKE ? OR email ILIKE ? OR phone ILIKE ? OR identification_number ILIKE ?)", hotelID, like, like, like, like).Order("id desc").Limit(20).Find(&guests).Error
	return guests, err
}

func (r *guestRepository) Update(guest *models.Guest) error {
	return config.DB.Save(guest).Error
}

func (r *guestRepository) Delete(id uint) error {
	return config.DB.Delete(&models.Guest{}, id).Error
}

func (r *guestRepository) HasBookings(guestID uint) (bool, error) {
	var count int64
	err := config.DB.Model(&models.Booking{}).Where("guest_id = ?", guestID).Count(&count).Error
	return count > 0, err
}
