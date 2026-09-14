package services

import (
	"errors"
	"hms/models"
	"hms/repositories"
)

type RoomService interface {
	CreateRoom(room *models.Room) error
	GetRoom(id uint, hotelID uint) (*models.Room, error)
	ListRooms(hotelID uint) ([]models.Room, error)
	ListRoomsByStatus(hotelID uint, status string) ([]models.Room, error)
	UpdateRoom(room *models.Room) error
	DeleteRoom(id uint, hotelID uint) error
}

type roomService struct {
	repo repositories.RoomRepository
}

func NewRoomService(repo repositories.RoomRepository) RoomService {
	return &roomService{repo: repo}
}

func (s *roomService) CreateRoom(room *models.Room) error {
	if room.RoomNumber == "" {
		return errors.New("room_number is required")
	}
	if room.HotelID == 0 {
		return errors.New("hotel_id is required")
	}
	// Default status if missing
	if room.Status == "" {
		room.Status = "available"
	}
	return s.repo.Create(room)
}

func (s *roomService) GetRoom(id uint, hotelID uint) (*models.Room, error) {
	return s.repo.FindByIDAndHotel(id, hotelID)
}

func (s *roomService) ListRooms(hotelID uint) ([]models.Room, error) {
	return s.repo.ListByHotel(hotelID)
}

func (s *roomService) ListRoomsByStatus(hotelID uint, status string) ([]models.Room, error) {
	return s.repo.ListByStatus(hotelID, status)
}

func (s *roomService) UpdateRoom(room *models.Room) error {
	return s.repo.Update(room)
}

func (s *roomService) DeleteRoom(id uint, hotelID uint) error {
	_, err := s.repo.FindByIDAndHotel(id, hotelID)
	if err != nil {
		return errors.New("room not found or access denied")
	}

	hasBookings, err := s.repo.HasBookings(id)
	if err != nil || hasBookings {
		return errors.New("cannot delete room with associated bookings")
	}

	return s.repo.Delete(id)
}
