package services

import (
	"errors"
	"hms/models"
	"hms/repositories"
)

type GuestService interface {
	CreateGuest(guest *models.Guest) error
	GetGuest(id uint, hotelID uint) (*models.Guest, error)
	ListGuests(hotelID uint) ([]models.Guest, error)
	SearchGuests(hotelID uint, query string) ([]models.Guest, error)
	UpdateGuest(guest *models.Guest) error
	DeleteGuest(id uint, hotelID uint) error
}

type guestService struct {
	repo repositories.GuestRepository
}

func NewGuestService(repo repositories.GuestRepository) GuestService {
	return &guestService{repo: repo}
}

func (s *guestService) CreateGuest(guest *models.Guest) error {
	if guest.Name == "" {
		return errors.New("name is required")
	}
	if guest.HotelID == 0 {
		return errors.New("hotel_id is required")
	}
	return s.repo.Create(guest)
}

func (s *guestService) GetGuest(id uint, hotelID uint) (*models.Guest, error) {
	return s.repo.FindByIDAndHotel(id, hotelID)
}

func (s *guestService) ListGuests(hotelID uint) ([]models.Guest, error) {
	return s.repo.ListByHotel(hotelID)
}

func (s *guestService) SearchGuests(hotelID uint, query string) ([]models.Guest, error) {
	if query == "" {
		return s.repo.ListByHotel(hotelID)
	}
	return s.repo.SearchByHotel(hotelID, query)
}

func (s *guestService) UpdateGuest(guest *models.Guest) error {
	return s.repo.Update(guest)
}

func (s *guestService) DeleteGuest(id uint, hotelID uint) error {
	_, err := s.repo.FindByIDAndHotel(id, hotelID)
	if err != nil {
		return errors.New("guest not found or access denied")
	}

	hasBookings, err := s.repo.HasBookings(id)
	if err != nil || hasBookings {
		return errors.New("cannot delete guest with associated bookings")
	}

	return s.repo.Delete(id)
}
