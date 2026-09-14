package services

import (
	"crypto/rand"
	"errors"
	"math/big"
	"hms/config"
	"hms/models"
	"hms/repositories"
)

type HotelService interface {
	CreateHotel(hotel *models.Hotel, adminID uint) error
	GetHotel(id uint, adminID uint) (*models.Hotel, error)
	ListHotels(adminID uint) ([]models.Hotel, error)
	UpdateHotel(hotel *models.Hotel) error
	DeleteHotel(id uint, adminID uint) error
	RegeneratePublicToken(id uint, adminID uint) (string, error)
	UpdateHotelRating(hotelID uint) error
}

type hotelService struct {
	repo repositories.HotelRepository
}

func NewHotelService(repo repositories.HotelRepository) HotelService {
	return &hotelService{repo: repo}
}

func (s *hotelService) CreateHotel(hotel *models.Hotel, adminID uint) error {
	if hotel.Name == "" {
		return errors.New("name is required")
	}
	hotel.AdminID = &adminID
	return s.repo.Create(hotel)
}

func (s *hotelService) GetHotel(id uint, adminID uint) (*models.Hotel, error) {
	return s.repo.FindByIDAndAdmin(id, adminID)
}

func (s *hotelService) ListHotels(adminID uint) ([]models.Hotel, error) {
	return s.repo.ListByAdmin(adminID)
}

func (s *hotelService) UpdateHotel(hotel *models.Hotel) error {
	return s.repo.Update(hotel)
}

func (s *hotelService) DeleteHotel(id uint, adminID uint) error {
	// First check if hotel exists and belongs to admin
	_, err := s.repo.FindByIDAndAdmin(id, adminID)
	if err != nil {
		return errors.New("hotel not found or access denied")
	}
	
	hasRooms, err := s.repo.HasRooms(id)
	if err != nil || hasRooms {
		return errors.New("cannot delete hotel with rooms")
	}

	hasBookings, err := s.repo.HasBookings(id)
	if err != nil || hasBookings {
		return errors.New("cannot delete hotel with bookings")
	}

	return s.repo.Delete(id)
}

func (s *hotelService) RegeneratePublicToken(id uint, adminID uint) (string, error) {
	hotel, err := s.repo.FindByIDAndAdmin(id, adminID)
	if err != nil {
		return "", err
	}
	token, _ := generateRandomString(32)
	hotel.PublicToken = token
	if err := s.repo.Update(hotel); err != nil {
		return "", err
	}
	return token, nil
}

// UpdateHotelRating calculates and updates the average rating for a hotel from published reviews
func (s *hotelService) UpdateHotelRating(hotelID uint) error {
	var avgRating float64
	err := config.DB.Model(&models.HotelReview{}).
		Where("hotel_id = ? AND status = ? AND deleted_at IS NULL", hotelID, "published").
		Select("COALESCE(AVG(rating), 0)").
		Scan(&avgRating).Error
	if err != nil {
		return err
	}

	return config.DB.Model(&models.Hotel{}).
		Where("id = ?", hotelID).
		Update("avg_rating", avgRating).Error
}

func generateRandomString(n int) (string, error) {
	const letters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
	ret := make([]byte, n)
	for i := 0; i < n; i++ {
		num, err := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		if err != nil {
			return "", err
		}
		ret[i] = letters[num.Int64()]
	}
	return string(ret), nil
}
