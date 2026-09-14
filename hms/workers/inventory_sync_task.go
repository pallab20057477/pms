package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"hms/config"
	"hms/models"
	"hms/services"

	"github.com/hibiken/asynq"
)

const TypeInventorySync = "inventory:sync"

type InventorySyncPayload struct {
	HotelID      uint   `json:"hotel_id"`
	RoomTypeID   uint   `json:"room_type_id"`
	StartDateStr string `json:"start_date"` // YYYY-MM-DD
	EndDateStr   string `json:"end_date"`   // YYYY-MM-DD
}

// EnqueueInventorySyncTask pushes a job to update OTA inventory
func EnqueueInventorySyncTask(hotelID uint, roomTypeID uint, checkIn, checkOut time.Time) error {
	if AsynqClient == nil {
		log.Println("[asynq] WARNING: Client is nil, skipping EnqueueInventorySyncTask")
		return fmt.Errorf("asynq client not initialized")
	}

	payload := InventorySyncPayload{
		HotelID:      hotelID,
		RoomTypeID:   roomTypeID,
		StartDateStr: checkIn.Format("2006-01-02"),
		EndDateStr:   checkOut.Format("2006-01-02"),
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	// MaxRetry(5) implies it will retry up to 5 times with exponential backoff
	task := asynq.NewTask(TypeInventorySync, payloadBytes, asynq.MaxRetry(5), asynq.Queue("critical"))

	info, err := AsynqClient.Enqueue(task)
	if err != nil {
		log.Printf("[asynq] Could not enqueue task: %v", err)
		return err
	}
	log.Printf("[asynq] Enqueued task: id=%s queue=%s", info.ID, info.Queue)
	return nil
}

// HandleInventorySyncTask processes the queued task.
func HandleInventorySyncTask(ctx context.Context, t *asynq.Task) error {
	var payload InventorySyncPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("[asynq] Processing Inventory Sync for Hotel %d, RoomTypeID %d (%s to %s)", payload.HotelID, payload.RoomTypeID, payload.StartDateStr, payload.EndDateStr)

	startDate, _ := time.Parse("2006-01-02", payload.StartDateStr)
	endDate, _ := time.Parse("2006-01-02", payload.EndDateStr)

	// Fetch Room Type for ChannelRoomCode
	var roomType models.RoomType
	if err := config.DB.First(&roomType, payload.RoomTypeID).Error; err != nil {
		return fmt.Errorf("could not find room type %d: %w", payload.RoomTypeID, err)
	}

	// Calculate remaining physical rooms of this type
	var totalRooms int64
	if err := config.DB.Model(&models.Room{}).Where("hotel_id = ? AND room_type_id = ? AND deleted_at IS NULL AND status NOT IN ('maintenance', 'blocked')", payload.HotelID, payload.RoomTypeID).Count(&totalRooms).Error; err != nil {
		return fmt.Errorf("could not get total rooms: %w", err)
	}

	// Calculate conflicting active bookings for this room type during this date range
	var bookedRooms int64
	if err := config.DB.Model(&models.Booking{}).
		Where("hotel_id = ? AND room_type_id = ? AND status NOT IN ('cancelled', 'completed', 'checked_out')", payload.HotelID, payload.RoomTypeID).
		Where("check_in_date < ? AND check_out_date > ?", endDate, startDate).
		Count(&bookedRooms).Error; err != nil {
		return fmt.Errorf("could not get booked rooms: %w", err)
	}

	availableCount := int(totalRooms - bookedRooms)
	if availableCount < 0 {
		availableCount = 0
	}

	log.Printf("[asynq] Calculated Availability for RoomTypeID %d: Total=%d, Booked=%d => Available=%d", payload.RoomTypeID, totalRooms, bookedRooms, availableCount)

	// Call the OTA API
	_, err := services.PushInventoryToBookingHotel(
		payload.HotelID,
		payload.RoomTypeID,
		startDate,
		endDate,
		availableCount,
	)

	if err != nil {
		log.Printf("[asynq] API Call failed: %v", err)
		return err // Returning error forces Asynq to retry later
	}

	log.Printf("[asynq] Successfully pushed inventory for Hotel %d", payload.HotelID)
	return nil
}
