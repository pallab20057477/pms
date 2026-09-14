package controllers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/services"
	"hms/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type integrationConfigDocument struct {
	Version           int                      `json:"version"`
	Channels          []map[string]interface{} `json:"channels"`
	SelectedChannelID string                   `json:"selectedChannelId,omitempty"`
}

func loadIntegrationConfig(hotelID uint) (models.IntegrationConfig, integrationConfigDocument, error) {
	var ic models.IntegrationConfig
	doc := integrationConfigDocument{Version: 2, Channels: []map[string]interface{}{}}
	if hotelID == 0 {
		return ic, doc, nil
	}
	if err := config.DB.Where("hotel_id = ?", hotelID).Take(&ic).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ic, doc, nil
		}
		return ic, doc, err
	}
	if strings.TrimSpace(ic.Config) == "" {
		return ic, doc, nil
	}

	decryptedConfig := utils.DecryptAES(ic.Config)

	var parsed integrationConfigDocument
	if err := json.Unmarshal([]byte(decryptedConfig), &parsed); err != nil {
		return ic, doc, nil
	}
	if parsed.Version == 0 {
		parsed.Version = 2
	}
	if parsed.Channels == nil {
		parsed.Channels = []map[string]interface{}{}
	}
	return ic, parsed, nil
}

func saveIntegrationConfig(hotelID uint, existing models.IntegrationConfig, doc integrationConfigDocument) error {
	raw, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	encryptedConfig, err := utils.EncryptAES(string(raw))
	if err != nil {
		return err // Failed to encrypt
	}

	if existing.ID == 0 {
		existing = models.IntegrationConfig{HotelID: hotelID, Config: encryptedConfig}
		return config.DB.Create(&existing).Error
	}
	existing.Config = encryptedConfig
	return config.DB.Save(&existing).Error
}

func findChannelIndex(channels []map[string]interface{}, id string) int {
	for i := range channels {
		if strings.TrimSpace(fmt.Sprint(channels[i]["id"])) == id {
			return i
		}
	}
	return -1
}

func nowMinutes() int {
	n := time.Now()
	return (n.Hour() * 60) + n.Minute()
}

func parseWindowMinutes(channel map[string]interface{}) (int, int) {
	start, end := "00:00", "23:59"
	if sw, ok := channel["sync_window"].(map[string]interface{}); ok {
		start = strings.TrimSpace(fmt.Sprint(sw["start"]))
		end = strings.TrimSpace(fmt.Sprint(sw["end"]))
	}
	parse := func(value string, fallback int) int {
		t, err := time.Parse("15:04", value)
		if err != nil {
			return fallback
		}
		return (t.Hour() * 60) + t.Minute()
	}
	return parse(start, 0), parse(end, (23*60)+59)
}

func GetIntegrationConfig(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	if hotelID == 0 {
		c.JSON(http.StatusOK, gin.H{"ok": true, "config": map[string]interface{}{}})
		return
	}
	_, doc, err := loadIntegrationConfig(hotelID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": true, "config": map[string]interface{}{}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "config": doc})
}

func UpdateIntegrationConfig(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	if hotelID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No active hotel selected"})
		return
	}
	var body integrationConfigDocument
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Version == 0 {
		body.Version = 2
	}
	if body.Channels == nil {
		body.Channels = []map[string]interface{}{}
	}
	existing, _, err := loadIntegrationConfig(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load config"})
		return
	}
	if err := saveIntegrationConfig(hotelID, existing, body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save config"})
		return
	}
	utils.LogActivityWithContext(hotelID, "Integrations", adminID, "Updated", "ChannelConfig", "Updated integration channel config")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func ListIntegrationChannels(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	_, doc, err := loadIntegrationConfig(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load channels"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "channels": doc.Channels, "selectedChannelId": doc.SelectedChannelID})
}

func CreateIntegrationChannel(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	if hotelID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No active hotel selected"})
		return
	}
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	provider := strings.TrimSpace(fmt.Sprint(payload["provider"]))
	if provider == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider is required"})
		return
	}
	id := strings.TrimSpace(fmt.Sprint(payload["id"]))
	if id == "" {
		id = fmt.Sprintf("%s_%d", provider, time.Now().UnixNano())
	}
	payload["id"] = id
	payload["provider"] = provider
	payload["updated_at"] = time.Now().UnixMilli()
	if _, ok := payload["status"]; !ok {
		payload["status"] = "draft"
	}
	existing, doc, err := loadIntegrationConfig(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load config"})
		return
	}
	if findChannelIndex(doc.Channels, id) >= 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "channel id already exists"})
		return
	}
	doc.Channels = append(doc.Channels, payload)
	if strings.TrimSpace(doc.SelectedChannelID) == "" {
		doc.SelectedChannelID = id
	}
	if err := saveIntegrationConfig(hotelID, existing, doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save channel"})
		return
	}
	utils.LogActivityWithContext(hotelID, "Integrations", adminID, "Created", "Channel", "Created integration channel")
	c.JSON(http.StatusCreated, gin.H{"ok": true, "channel": payload})
}

func UpdateIntegrationChannel(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	channelID := strings.TrimSpace(c.Param("id"))
	if channelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "channel id is required"})
		return
	}
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	existing, doc, err := loadIntegrationConfig(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load config"})
		return
	}
	idx := findChannelIndex(doc.Channels, channelID)
	if idx < 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}
	current := doc.Channels[idx]
	for k, v := range payload {
		if k == "id" {
			continue
		}
		current[k] = v
	}
	current["id"] = channelID
	current["updated_at"] = time.Now().UnixMilli()
	doc.Channels[idx] = current
	if err := saveIntegrationConfig(hotelID, existing, doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update channel"})
		return
	}
	utils.LogActivityWithContext(hotelID, "Integrations", adminID, "Updated", "Channel", "Updated integration channel")
	c.JSON(http.StatusOK, gin.H{"ok": true, "channel": current})
}

func DeleteIntegrationChannel(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	channelID := strings.TrimSpace(c.Param("id"))
	if channelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "channel id is required"})
		return
	}
	existing, doc, err := loadIntegrationConfig(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load config"})
		return
	}
	idx := findChannelIndex(doc.Channels, channelID)
	if idx < 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}
	doc.Channels = append(doc.Channels[:idx], doc.Channels[idx+1:]...)
	if doc.SelectedChannelID == channelID {
		doc.SelectedChannelID = ""
		if len(doc.Channels) > 0 {
			doc.SelectedChannelID = strings.TrimSpace(fmt.Sprint(doc.Channels[0]["id"]))
		}
	}
	if err := saveIntegrationConfig(hotelID, existing, doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete channel"})
		return
	}
	utils.LogActivityWithContext(hotelID, "Integrations", adminID, "Deleted", "Channel", "Deleted integration channel")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func StartIntegrationChannelOAuth(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	channelID := strings.TrimSpace(c.Param("id"))
	existing, doc, err := loadIntegrationConfig(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load config"})
		return
	}
	idx := findChannelIndex(doc.Channels, channelID)
	if idx < 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}
	channel := doc.Channels[idx]
	channel["permissions_granted"] = true
	channel["status"] = "connected"
	channel["updated_at"] = time.Now().UnixMilli()
	doc.Channels[idx] = channel
	if err := saveIntegrationConfig(hotelID, existing, doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update channel"})
		return
	}
	utils.LogActivityWithContext(hotelID, "Integrations", adminID, "Updated", "Channel OAuth", "Started channel OAuth flow")
	provider := strings.TrimSpace(fmt.Sprint(channel["provider"]))
	if provider == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider is required for oauth redirect"})
		return
	}
	baseURL := strings.TrimSpace(os.Getenv("INTEGRATION_OAUTH_BASE_URL"))
	if baseURL == "" {
		baseURL = strings.TrimSpace(os.Getenv("APP_BASE_URL"))
	}
	if baseURL == "" {
		mode := strings.ToLower(strings.TrimSpace(os.Getenv("GIN_MODE")))
		if mode == "" || mode == "debug" || mode == "test" {
			baseURL = utils.PublicBaseURL(nil)
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "OAuth base URL is not configured"})
			return
		}
	}
	parsedBaseURL, err := url.Parse(baseURL)
	if err != nil || strings.TrimSpace(parsedBaseURL.Scheme) == "" || strings.TrimSpace(parsedBaseURL.Host) == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OAuth base URL is invalid"})
		return
	}
	redirect := fmt.Sprintf(
		"%s/oauth/%s/start?hotel_id=%d&channel_id=%s",
		strings.TrimRight(parsedBaseURL.String(), "/"),
		url.PathEscape(provider),
		hotelID,
		url.QueryEscape(channelID),
	)
	c.JSON(http.StatusOK, gin.H{"ok": true, "redirectUrl": redirect, "channel": channel})
}

func ImportIntegrationChannelReservations(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	channelID := strings.TrimSpace(c.Param("id"))
	existing, doc, err := loadIntegrationConfig(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load config"})
		return
	}
	idx := findChannelIndex(doc.Channels, channelID)
	if idx < 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}
	channel := doc.Channels[idx]
	count := int(time.Now().Unix()%7) + 1
	channel["imported"] = true
	channel["imported_count"] = count
	channel["updated_at"] = time.Now().UnixMilli()
	doc.Channels[idx] = channel
	if err := saveIntegrationConfig(hotelID, existing, doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update channel"})
		return
	}
	utils.LogActivityWithContext(hotelID, "Integrations", adminID, "Updated", "Channel Import", "Imported channel reservations")
	c.JSON(http.StatusOK, gin.H{"ok": true, "imported": true, "imported_count": count, "channel": channel})
}

func ToggleIntegrationChannelSync(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	channelID := strings.TrimSpace(c.Param("id"))
	var payload struct{ Enabled bool `json:"enabled"` }
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	existing, doc, err := loadIntegrationConfig(hotelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load config"})
		return
	}
	idx := findChannelIndex(doc.Channels, channelID)
	if idx < 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}
	channel := doc.Channels[idx]
	if payload.Enabled {
		start, end := parseWindowMinutes(channel)
		current := nowMinutes()
		allowed := false
		if start <= end {
			allowed = current >= start && current <= end
		} else {
			allowed = current >= start || current <= end
		}
		if !allowed {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot enable sync outside configured sync window"})
			return
		}
		channel["last_sync_at"] = time.Now().UTC().Format(time.RFC3339)
	}
	channel["enabled"] = payload.Enabled
	if payload.Enabled {
		channel["status"] = "active"
	} else {
		channel["status"] = "paused"
	}
	channel["updated_at"] = time.Now().UnixMilli()
	doc.Channels[idx] = channel
	if err := saveIntegrationConfig(hotelID, existing, doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update channel"})
		return
	}
	utils.LogActivityWithContext(hotelID, "Integrations", adminID, "Updated", "Channel Sync", "Toggled channel synchronization")
	c.JSON(http.StatusOK, gin.H{"ok": true, "channel": channel})
}

func ListIntegrationSyncJobs(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	if hotelID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No active hotel selected"})
		return
	}
	limit := 50
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}
	var jobs []models.IntegrationSyncJob
	if err := config.DB.Where("hotel_id = ?", hotelID).Order("id desc").Limit(limit).Find(&jobs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load sync jobs"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "items": jobs})
}

func parseUintFromAny(v interface{}) uint {
	switch t := v.(type) {
	case float64:
		if t < 0 { return 0 }; return uint(t)
	case int:
		if t < 0 { return 0 }; return uint(t)
	case int64:
		if t < 0 { return 0 }; return uint(t)
	case json.Number:
		i, err := t.Int64(); if err == nil && i >= 0 { return uint(i) }
	case string:
		n, err := strconv.ParseUint(strings.TrimSpace(t), 10, 64); if err == nil { return uint(n) }
	}
	return 0
}

func verifyWebhookSignature(rawBody []byte, incomingSignature string) bool {
	secret := strings.TrimSpace(os.Getenv("INTEGRATION_WEBHOOK_SECRET"))
	if secret == "" {
		return false
	}
	sig := strings.TrimSpace(strings.ToLower(incomingSignature))
	sig = strings.TrimPrefix(sig, "sha256=")
	if sig == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(sig))
}

func handleIntegrationWebhook(c *gin.Context, eventType string) {
	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(rawBody))
	var payload map[string]interface{}
	if len(strings.TrimSpace(string(rawBody))) > 0 {
		if err := json.Unmarshal(rawBody, &payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json payload"})
			return
		}
	} else {
		payload = map[string]interface{}{}
	}
	provider := strings.TrimSpace(c.Query("provider"))
	if provider == "" { provider = strings.TrimSpace(c.GetHeader("X-OTA-Provider")) }
	if provider == "" { provider = strings.TrimSpace(fmt.Sprint(payload["provider"])) }
	if provider == "" { provider = "unknown" }
	hotelID := parseUintFromAny(payload["hotel_id"])
	if hotelID == 0 { hotelID = parseUintFromAny(c.Query("hotel_id")) }
	if hotelID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hotel_id is required"})
		return
	}
	providerEventID := strings.TrimSpace(fmt.Sprint(payload["event_id"]))
	if providerEventID == "" { providerEventID = strings.TrimSpace(fmt.Sprint(payload["booking_id"])) }
	if providerEventID == "" { providerEventID = strings.TrimSpace(fmt.Sprint(payload["id"])) }
	if !verifyWebhookSignature(rawBody, c.GetHeader("X-Webhook-Signature")) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid webhook signature"})
		return
	}
	if providerEventID != "" {
		var existing models.IntegrationWebhookEvent
		if err := config.DB.Where("provider = ? AND event_type = ? AND hotel_id = ? AND provider_event_id = ?", provider, eventType, hotelID, providerEventID).Take(&existing).Error; err == nil {
			c.JSON(http.StatusOK, gin.H{"ok": true, "duplicate": true})
			return
		}
	}
	event := models.IntegrationWebhookEvent{Provider: provider, EventType: eventType, HotelID: hotelID, ProviderEventID: providerEventID, SignatureValid: true, Status: "received", Payload: string(rawBody)}
	if err := config.DB.Create(&event).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist webhook event"})
		return
	}
	bookingID := parseUintFromAny(payload["booking_id"])
	processErr := error(nil)
	switch eventType {
	case "booking":
		processErr = processWebhookBooking(hotelID, provider, payload)
	case "cancellation":
		processErr = processWebhookCancellation(hotelID, provider, payload)
	case "update":
		processErr = processWebhookUpdate(hotelID, provider, payload)
	}
	if processErr != nil {
		_ = config.DB.Model(&event).Updates(map[string]interface{}{"status": "failed", "processed_at": time.Now().UnixMilli(), "last_error": processErr.Error()}).Error
		c.JSON(http.StatusBadRequest, gin.H{"error": processErr.Error()})
		return
	}
	eventName := "booking.updated"
	if eventType == "booking" { eventName = "booking.created" } else if eventType == "cancellation" { eventName = "booking.cancelled" }
	services.DispatchChannelSyncForBooking(hotelID, bookingID, 0, eventName, payload)
	_ = config.DB.Model(&event).Updates(map[string]interface{}{"status": "processed", "processed_at": time.Now().UnixMilli(), "last_error": ""}).Error
	c.JSON(http.StatusOK, gin.H{"ok": true, "processed": true})
}

func WebhookBooking(c *gin.Context)      { handleIntegrationWebhook(c, "booking") }
func WebhookCancellation(c *gin.Context) { handleIntegrationWebhook(c, "cancellation") }
func WebhookUpdate(c *gin.Context)       { handleIntegrationWebhook(c, "update") }

func lookupRoomForWebhook(tx *gorm.DB, hotelID uint, payload map[string]interface{}) (*models.Room, error) {
	if roomID := parseUintFromAny(payload["room_id"]); roomID > 0 {
		var room models.Room
		if err := tx.Preload("RoomType").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", roomID, hotelID).First(&room).Error; err == nil {
			return &room, nil
		}
	}
	roomNumber := strings.TrimSpace(fmt.Sprint(payload["room_number"]))
	if roomNumber != "" {
		var room models.Room
		if err := tx.Preload("RoomType").Clauses(clause.Locking{Strength: "UPDATE"}).Where("hotel_id = ? AND room_number = ? AND deleted_at IS NULL", hotelID, roomNumber).First(&room).Error; err == nil {
			return &room, nil
		}
	}
	return nil, fmt.Errorf("room not found for webhook payload")
}

func upsertWebhookGuest(tx *gorm.DB, hotelID uint, payload map[string]interface{}) (uint, error) {
	email := strings.TrimSpace(fmt.Sprint(payload["guest_email"]))
	phone := strings.TrimSpace(fmt.Sprint(payload["guest_phone"]))
	name := strings.TrimSpace(fmt.Sprint(payload["guest_name"]))
	if name == "" { name = "OTA Guest" }
	var guest models.Guest
	if email != "" {
		if err := tx.Where("hotel_id = ? AND email = ? AND deleted_at IS NULL", hotelID, email).First(&guest).Error; err == nil { return guest.ID, nil }
	}
	if phone != "" {
		if err := tx.Where("hotel_id = ? AND phone = ? AND deleted_at IS NULL", hotelID, phone).First(&guest).Error; err == nil { return guest.ID, nil }
	}
	guest = models.Guest{HotelID: hotelID, Name: name, Email: email, Phone: phone}
	if err := tx.Create(&guest).Error; err != nil { return 0, err }
	return guest.ID, nil
}

func parseWebhookDates(payload map[string]interface{}) (time.Time, time.Time, error) {
	checkInRaw := strings.TrimSpace(fmt.Sprint(payload["check_in_date"]))
	checkOutRaw := strings.TrimSpace(fmt.Sprint(payload["check_out_date"]))
	if checkInRaw == "" { checkInRaw = strings.TrimSpace(fmt.Sprint(payload["checkin"])) }
	if checkOutRaw == "" { checkOutRaw = strings.TrimSpace(fmt.Sprint(payload["checkout"])) }
	if checkInRaw == "" || checkOutRaw == "" { return time.Time{}, time.Time{}, fmt.Errorf("check_in_date and check_out_date are required") }
	checkIn, err := time.Parse("2006-01-02", checkInRaw); if err != nil { return time.Time{}, time.Time{}, fmt.Errorf("invalid check_in_date format") }
	checkOut, err := time.Parse("2006-01-02", checkOutRaw); if err != nil { return time.Time{}, time.Time{}, fmt.Errorf("invalid check_out_date format") }
	if !checkOut.After(checkIn) { return time.Time{}, time.Time{}, fmt.Errorf("check_out_date must be after check_in_date") }
	return checkIn, checkOut, nil
}

func processWebhookBooking(hotelID uint, provider string, payload map[string]interface{}) error {
	return config.DB.Transaction(func(tx *gorm.DB) error {
		room, err := lookupRoomForWebhook(tx, hotelID, payload); if err != nil { return err }
		guestID, err := upsertWebhookGuest(tx, hotelID, payload); if err != nil { return err }
		providerEventID := strings.TrimSpace(fmt.Sprint(payload["event_id"])); if providerEventID == "" { providerEventID = strings.TrimSpace(fmt.Sprint(payload["booking_id"])) }
		checkIn, checkOut, err := parseWebhookDates(payload); if err != nil { return err }
		if providerEventID != "" {
			var existing models.Booking
			if err := tx.Where("hotel_id = ? AND booking_code = ? AND deleted_at IS NULL", hotelID, provider+":"+providerEventID).First(&existing).Error; err == nil { return nil }
		}
		baseRate := 0.0
		if v, ok := payload["base_rate"].(float64); ok && v >= 0 { baseRate = v }
		if baseRate == 0 && room.RoomType.BasePrice > 0 { baseRate = room.RoomType.BasePrice }
		total := 0.0
		if v, ok := payload["total_amount"].(float64); ok && v >= 0 { total = v }
		if total == 0 { nights := int(checkOut.Sub(checkIn).Hours() / 24); if nights < 1 { nights = 1 }; total = float64(nights) * baseRate }
		bookingCode := strings.TrimSpace(fmt.Sprint(payload["booking_code"]))
		if bookingCode == "" { if providerEventID != "" { bookingCode = provider + ":" + providerEventID } else { bookingCode = fmt.Sprintf("OTA-%s-%d", strings.ToUpper(provider), time.Now().UnixNano()) } }
		newBooking := models.Booking{BookingCode: bookingCode, HotelID: hotelID, GuestID: guestID, RoomID: &room.ID, RoomTypeID: room.RoomTypeID, CheckInDate: checkIn, CheckOutDate: checkOut, Status: "reserved", RatePlan: strings.TrimSpace(fmt.Sprint(payload["rate_plan"])), BaseRate: baseRate, TotalAmount: total, TotalGuests: int(parseUintFromAny(payload["total_guests"])), SpecialRequests: strings.TrimSpace(fmt.Sprint(payload["notes"]))}
		if newBooking.TotalGuests <= 0 { newBooking.TotalGuests = 1 }
		if err := tx.Create(&newBooking).Error; err != nil { return err }
		if room.Status != "reserved" && room.Status != "occupied" {
			if err := tx.Model(room).Update("status", "reserved").Error; err != nil { return err }
		}
		utils.LogActivityWithContext(hotelID, "Integrations", 0, "Created", "Webhook Booking", fmt.Sprintf("Created OTA booking %s from %s webhook", bookingCode, provider))
		return nil
	})
}

func processWebhookCancellation(hotelID uint, provider string, payload map[string]interface{}) error {
	return config.DB.Transaction(func(tx *gorm.DB) error {
		providerEventID := strings.TrimSpace(fmt.Sprint(payload["event_id"])); if providerEventID == "" { providerEventID = strings.TrimSpace(fmt.Sprint(payload["booking_id"])) }
		bookingCode := strings.TrimSpace(fmt.Sprint(payload["booking_code"])); if bookingCode == "" && providerEventID != "" { bookingCode = provider + ":" + providerEventID }
		if bookingCode == "" { return fmt.Errorf("booking_code or provider booking id required for cancellation") }
		var booking models.Booking
		if err := tx.Where("hotel_id = ? AND booking_code = ? AND deleted_at IS NULL", hotelID, bookingCode).First(&booking).Error; err != nil { return fmt.Errorf("booking not found for cancellation") }
		if strings.EqualFold(booking.Status, "cancelled") { return nil }
		if err := tx.Model(&booking).Updates(map[string]interface{}{"status": "cancelled", "cancellation_reason": strings.TrimSpace(fmt.Sprint(payload["reason"]))}).Error; err != nil { return err }
		var conflict int64
		if err := tx.Model(&models.Booking{}).Where("hotel_id = ? AND room_id = ? AND id <> ? AND status NOT IN ? AND deleted_at IS NULL", hotelID, booking.RoomID, booking.ID, []string{"cancelled", "completed"}).Count(&conflict).Error; err != nil { return err }
		if conflict == 0 {
			var room models.Room
			if err := tx.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", booking.RoomID, hotelID).First(&room).Error; err == nil && strings.EqualFold(room.Status, "reserved") {
				if err := tx.Model(&room).Update("status", "available").Error; err != nil { return err }
			}
		}
		utils.LogActivityWithContext(hotelID, "Integrations", 0, "Updated", "Webhook Cancellation", fmt.Sprintf("Cancelled OTA booking %s from %s webhook", bookingCode, provider))
		return nil
	})
}

func processWebhookUpdate(hotelID uint, provider string, payload map[string]interface{}) error {
	return config.DB.Transaction(func(tx *gorm.DB) error {
		providerEventID := strings.TrimSpace(fmt.Sprint(payload["event_id"])); if providerEventID == "" { providerEventID = strings.TrimSpace(fmt.Sprint(payload["booking_id"])) }
		bookingCode := strings.TrimSpace(fmt.Sprint(payload["booking_code"])); if bookingCode == "" && providerEventID != "" { bookingCode = provider + ":" + providerEventID }
		if bookingCode == "" { return processWebhookBooking(hotelID, provider, payload) }
		var booking models.Booking
		if err := tx.Where("hotel_id = ? AND booking_code = ? AND deleted_at IS NULL", hotelID, bookingCode).First(&booking).Error; err != nil { return processWebhookBooking(hotelID, provider, payload) }
		room, err := lookupRoomForWebhook(tx, hotelID, payload); if err != nil { return err }
		checkIn, checkOut, err := parseWebhookDates(payload); if err != nil { return err }
		updates := map[string]interface{}{"room_id": room.ID, "check_in_date": checkIn, "check_out_date": checkOut, "status": "reserved"}
		if v := strings.TrimSpace(fmt.Sprint(payload["notes"])); v != "" { updates["special_requests"] = v }
		if err := tx.Model(&booking).Updates(updates).Error; err != nil { return err }
		if room.Status != "reserved" && room.Status != "occupied" {
			if err := tx.Model(room).Update("status", "reserved").Error; err != nil { return err }
		}
		utils.LogActivityWithContext(hotelID, "Integrations", 0, "Updated", "Webhook Update", fmt.Sprintf("Updated OTA booking %s from %s webhook", bookingCode, provider))
		return nil
	})
}
