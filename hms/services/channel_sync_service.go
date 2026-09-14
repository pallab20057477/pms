package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type integrationConfigDocument struct {
	Version  int                      `json:"version"`
	Channels []map[string]interface{} `json:"channels"`
}

func DispatchChannelSyncForBooking(hotelID, bookingID, adminID uint, eventType string, payload map[string]interface{}) {
	dispatchChannelSync(hotelID, adminID, "booking", bookingID, eventType, payload)
}

func DispatchChannelSyncForRoom(hotelID, roomID, adminID uint, eventType string, payload map[string]interface{}) {
	dispatchChannelSync(hotelID, adminID, "room", roomID, eventType, payload)
}

func dispatchChannelSync(hotelID, adminID uint, entityType string, entityID uint, eventType string, payload map[string]interface{}) {
	_ = adminID
	if hotelID == 0 || strings.TrimSpace(eventType) == "" {
		return
	}

	var hotel models.Hotel
	if err := config.DB.Select("id", "feature_channel_manager").First(&hotel, hotelID).Error; err != nil {
		return
	}
	if !hotel.FeatureChannelManager {
		return
	}

	var cfg models.IntegrationConfig
	if err := config.DB.Where("hotel_id = ?", hotelID).Take(&cfg).Error; err != nil {
		return
	}

	var doc integrationConfigDocument
	decryptedConfig := utils.DecryptAES(cfg.Config)
	if err := json.Unmarshal([]byte(decryptedConfig), &doc); err != nil {
		return
	}
	if len(doc.Channels) == 0 {
		return
	}

	payloadBytes, _ := json.Marshal(payload)
	entityRef := strings.TrimSpace(fmt.Sprint(payload["booking_code"]))
	if entityRef == "" {
		entityRef = strings.TrimSpace(fmt.Sprint(payload["room_number"]))
	}
	if entityRef == "" {
		entityRef = fmt.Sprint(entityID)
	}
	for _, channel := range doc.Channels {
		enabled := false
		if v, ok := channel["enabled"].(bool); ok {
			enabled = v
		}
		permissionsGranted := false
		if v, ok := channel["permissions_granted"].(bool); ok {
			permissionsGranted = v
		}
		if !enabled || !permissionsGranted {
			continue
		}

		channelID := strings.TrimSpace(fmt.Sprint(channel["id"]))
		provider := strings.TrimSpace(fmt.Sprint(channel["provider"]))
		if channelID == "" || provider == "" {
			continue
		}

		job := models.IntegrationSyncJob{
			HotelID:    hotelID,
			ChannelID:  channelID,
			Provider:   provider,
			EventType:  eventType,
			EntityType: entityType,
			EntityID:   entityID,
			DedupeKey:  fmt.Sprintf("%d:%s:%s:%s:%s", hotelID, channelID, eventType, entityType, entityRef),
			Status:     "queued",
			Payload:    string(payloadBytes),
		}
		if err := config.DB.Create(&job).Error; err != nil {
			continue
		}
		go processSyncJob(job.ID, channel)
	}
}

func processSyncJob(jobID uint, channel map[string]interface{}) {
	const maxAttempts = 3

	credentials := map[string]interface{}{}
	if raw, ok := channel["credentials"].(map[string]interface{}); ok {
		credentials = raw
	}
	propertyID := strings.TrimSpace(fmt.Sprint(credentials["property_id"]))
	apiKey := strings.TrimSpace(fmt.Sprint(credentials["api_key"]))

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		var job models.IntegrationSyncJob
		if err := config.DB.First(&job, jobID).Error; err != nil {
			return
		}
		if strings.EqualFold(job.Status, "success") {
			return
		}

		_ = config.DB.Model(&job).Updates(map[string]interface{}{
			"status":        "processing",
			"attempts":      attempt,
			"next_retry_at": int64(0),
		}).Error

		if propertyID == "" || apiKey == "" {
			lastErr := "missing property_id or api_key in channel credentials"
			nextRetryAt := int64(0)
			nextStatus := "failed"
			if attempt < maxAttempts {
				nextStatus = "queued"
				nextRetryAt = time.Now().Add(time.Duration(attempt*attempt) * time.Second).UnixMilli()
			}
			_ = config.DB.Model(&job).Updates(map[string]interface{}{
				"status":        nextStatus,
				"last_error":    lastErr,
				"processed_at":  time.Now().UnixMilli(),
				"next_retry_at": nextRetryAt,
			}).Error
			if attempt < maxAttempts {
				time.Sleep(time.Duration(attempt*attempt) * time.Second)
				continue
			}
			return
		}

		response := map[string]interface{}{
			"provider":      job.Provider,
			"event_type":    job.EventType,
			"entity_type":   job.EntityType,
			"entity_id":     job.EntityID,
			"sync_ref":      fmt.Sprintf("%s_%d", job.Provider, time.Now().UnixNano()),
			"processed_utc": time.Now().UTC().Format(time.RFC3339),
			"attempt":       attempt,
		}
		respBytes, _ := json.Marshal(response)

		txErr := config.DB.Transaction(func(tx *gorm.DB) error {
			var latest models.IntegrationSyncJob
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&latest, job.ID).Error; err != nil {
				return err
			}
			if strings.EqualFold(latest.Status, "success") {
				return nil
			}
			return tx.Model(&latest).Updates(map[string]interface{}{
				"status":        "success",
				"response":      string(respBytes),
				"processed_at":  time.Now().UnixMilli(),
				"last_error":    "",
				"next_retry_at": int64(0),
			}).Error
		})
		if txErr == nil {
			return
		}

		if attempt < maxAttempts {
			time.Sleep(time.Duration(attempt*attempt) * time.Second)
			continue
		}
		_ = config.DB.Model(&job).Updates(map[string]interface{}{
			"status":        "failed",
			"last_error":    txErr.Error(),
			"processed_at":  time.Now().UnixMilli(),
			"next_retry_at": int64(0),
		}).Error
	}
}
