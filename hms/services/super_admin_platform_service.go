package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"hms/config"
	"hms/models"
	"io"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"
)

// ════════════════════════════════════════════════════════
// BILLING & USAGE
// ════════════════════════════════════════════════════════

type HotelBillingRow struct {
	HotelID           uint      `json:"hotel_id"`
	HotelName         string    `json:"hotel_name"`
	AdminName         string    `json:"admin_name"`
	AdminEmail        string    `json:"admin_email"`
	SubscriptionTier  string    `json:"subscription_tier"`
	SubscriptionStatus string   `json:"subscription_status"`
	BookingsThisMonth int64     `json:"bookings_this_month"`
	BookingLimitPerDay int      `json:"booking_limit_per_day"`
	MRR               float64   `json:"mrr"`
	LastPaymentDate   *time.Time `json:"last_payment_date"`
	CreatedAt         time.Time  `json:"created_at"`
}

type BillingStats struct {
	TotalMRR        float64           `json:"total_mrr"`
	FreeHotels      int64             `json:"free_hotels"`
	PremiumHotels   int64             `json:"premium_hotels"`
	SuspendedHotels int64             `json:"suspended_hotels"`
	TotalHotels     int64             `json:"total_hotels"`
	MRRByTier       map[string]float64 `json:"mrr_by_tier"`
	MonthlyRevenue  []MonthlyRevenue  `json:"monthly_revenue"`
	Hotels          []HotelBillingRow `json:"hotels"`
}

type MonthlyRevenue struct {
	Month   string  `json:"month"`
	Revenue float64 `json:"revenue"`
}

// tier prices in INR
var tierPrices = map[string]float64{
	"free":    0,
	"premium": 2999,
}

func GetPlatformBilling(page, pageSize int) (*BillingStats, error) {
	var hotels []models.Hotel
	if err := config.DB.Find(&hotels).Error; err != nil {
		return nil, err
	}

	stats := &BillingStats{
		MRRByTier: map[string]float64{},
	}

	var rows []HotelBillingRow
	for _, h := range hotels {
		stats.TotalHotels++
		switch h.SubscriptionTier {
		case "premium":
			stats.PremiumHotels++
		default:
			stats.FreeHotels++
		}
		if h.SubscriptionStatus == "suspended" {
			stats.SuspendedHotels++
		}

		mrr := tierPrices[h.SubscriptionTier]
		stats.TotalMRR += mrr
		stats.MRRByTier[h.SubscriptionTier] += mrr

		var admin models.Admin
		if h.AdminID != nil {
			config.DB.First(&admin, *h.AdminID)
		}

		var bookingsThisMonth int64
		config.DB.Model(&models.Booking{}).
			Where("hotel_id = ? AND EXTRACT(MONTH FROM check_in_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM check_in_date) = EXTRACT(YEAR FROM CURRENT_DATE)", h.ID).
			Count(&bookingsThisMonth)

		rows = append(rows, HotelBillingRow{
			HotelID:            h.ID,
			HotelName:          h.Name,
			AdminName:          admin.Name,
			AdminEmail:         admin.Email,
			SubscriptionTier:   h.SubscriptionTier,
			SubscriptionStatus: h.SubscriptionStatus,
			BookingsThisMonth:  bookingsThisMonth,
			BookingLimitPerDay: h.BookingLimitPerDay,
			MRR:                mrr,
			LastPaymentDate:    h.LastPaymentDate,
			CreatedAt:          h.CreatedAt,
		})
	}

	// Monthly revenue from payments table — last 6 months
	type monthRow struct {
		Month   string  `json:"month"`
		Revenue float64 `json:"revenue"`
	}
	var monthly []monthRow
	config.DB.Raw(`
		SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
		       COALESCE(SUM(amount), 0) AS revenue
		FROM payments
		WHERE deleted_at IS NULL
		  AND created_at >= NOW() - INTERVAL '6 months'
		GROUP BY DATE_TRUNC('month', created_at)
		ORDER BY DATE_TRUNC('month', created_at) ASC
	`).Scan(&monthly)

	for _, m := range monthly {
		stats.MonthlyRevenue = append(stats.MonthlyRevenue, MonthlyRevenue{Month: m.Month, Revenue: m.Revenue})
	}

	// Apply pagination to rows
	total := len(rows)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	if rows != nil {
		stats.Hotels = rows[start:end]
	} else {
		stats.Hotels = []HotelBillingRow{}
	}
	_ = total // suppress unused warning

	return stats, nil
}

// ════════════════════════════════════════════════════════
// SYSTEM & OTA HEALTH
// ════════════════════════════════════════════════════════

type ServiceHealth struct {
	Name        string `json:"name"`
	Status      string `json:"status"` // "ok" | "degraded" | "down"
	Latency     string `json:"latency"`
	Message     string `json:"message"`
	LastChecked string `json:"last_checked"`
}

type OTAHealth struct {
	Channel      string `json:"channel"`
	HotelsLinked int64  `json:"hotels_linked"`
	LastSyncTime string `json:"last_sync_time"`
	PendingJobs  int64  `json:"pending_jobs"`
	FailedJobs   int64  `json:"failed_jobs"`
	Status       string `json:"status"`
	Message      string `json:"message"`
	APILatency   string `json:"api_latency"`
	APIEndpoint  string `json:"api_endpoint"`
}

type SystemHealthReport struct {
	ServerTime    string          `json:"server_time"`
	Uptime        string          `json:"uptime"`
	GoVersion     string          `json:"go_version"`
	NumGoroutines int             `json:"num_goroutines"`
	MemAllocMB    float64         `json:"mem_alloc_mb"`
	Services      []ServiceHealth `json:"services"`
	OTAChannels   []OTAHealth     `json:"ota_channels"`
	RecentErrors  []AuditLogRow   `json:"recent_errors"`
}

var startTime = time.Now()

func GetSystemHealth() (*SystemHealthReport, error) {
	report := &SystemHealthReport{
		ServerTime:    time.Now().Format("2006-01-02 15:04:05 MST"),
		GoVersion:     runtime.Version(),
		NumGoroutines: runtime.NumGoroutine(),
	}

	// Uptime
	up := time.Since(startTime)
	hours := int(up.Hours())
	mins := int(up.Minutes()) % 60
	report.Uptime = fmt.Sprintf("%dh %dm", hours, mins)

	// Memory
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	report.MemAllocMB = float64(ms.Alloc) / 1024 / 1024

	// Check DB
	dbHealth := ServiceHealth{Name: "PostgreSQL Database", LastChecked: time.Now().Format("15:04:05")}
	t0 := time.Now()
	sqlDB, err := config.DB.DB()
	if err == nil {
		err = sqlDB.Ping()
	}
	dbHealth.Latency = fmt.Sprintf("%dms", time.Since(t0).Milliseconds())
	if err != nil {
		dbHealth.Status = "down"
		dbHealth.Message = err.Error()
	} else {
		dbHealth.Status = "ok"
		dbHealth.Message = "Connected and responding"
	}
	report.Services = append(report.Services, dbHealth)

	// Check Redis
	redisHealth := ServiceHealth{Name: "Redis Cache", LastChecked: time.Now().Format("15:04:05")}
	t1 := time.Now()
	var rErr error
	if config.RDB != nil {
		redisCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		rErr = config.RDB.Ping(redisCtx).Err()
	} else {
		rErr = fmt.Errorf("Redis not connected")
	}
	redisHealth.Latency = fmt.Sprintf("%dms", time.Since(t1).Milliseconds())
	if rErr != nil {
		redisHealth.Status = "degraded"
		redisHealth.Message = "Cache unavailable — DB fallback active"
	} else {
		redisHealth.Status = "ok"
		redisHealth.Message = "Connected and responding"
	}
	report.Services = append(report.Services, redisHealth)

	// API Service health (self)
	report.Services = append(report.Services, ServiceHealth{
		Name:        "HMS API Server",
		Status:      "ok",
		Latency:     "0ms",
		Message:     fmt.Sprintf("%d goroutines · %.1f MB allocated", report.NumGoroutines, report.MemAllocMB),
		LastChecked: time.Now().Format("15:04:05"),
	})

	// OTA Channel health — BookingHotel direct API connectivity + local stats
	report.OTAChannels = buildOTAChannelHealth()

	return report, nil
}

// ─────────────────────────────────────────────────────────
// buildOTAChannelHealth checks BookingHotel API reachability
// and collects local booking / sync-job stats per channel.
// ─────────────────────────────────────────────────────────
func buildOTAChannelHealth() []OTAHealth {
	var results []OTAHealth

	// ── BookingHotel (the only connected OTA) ──────────────
	bh := checkBookingHotelHealth()
	results = append(results, bh)

	// ── Other channels — listed as inactive (not integrated) ──
	inactive := []string{"Expedia", "Agoda", "MakeMyTrip"}
	for _, ch := range inactive {
		results = append(results, OTAHealth{
			Channel:      ch,
			HotelsLinked: 0,
			Status:       "inactive",
			Message:      "Not integrated — connect via Channel Manager settings",
		})
	}

	return results
}

// checkBookingHotelHealth does a real HTTP probe against BookingHotel's
// inventory endpoint and enriches with local DB stats.
func checkBookingHotelHealth() OTAHealth {
	h := OTAHealth{Channel: "BookingHotel"}

	// 1. Local DB stats — bookings received via this channel
	config.DB.Model(&models.ChannelBooking{}).
		Where("channel_name = 'BookingHotel'").
		Count(&h.HotelsLinked) // reuse field: total bookings received

	// hotels with channel_hotel_code set (i.e. registered with BookingHotel)
	var linkedHotels int64
	config.DB.Model(&models.Hotel{}).
		Where("channel_hotel_code != '' AND feature_channel_manager = true").
		Count(&linkedHotels)
	h.HotelsLinked = linkedHotels

	// 2. Sync-job stats
	config.DB.Model(&models.IntegrationSyncJob{}).
		Where("provider = 'bookinghotel' AND status IN ('queued','processing')").
		Count(&h.PendingJobs)
	config.DB.Model(&models.IntegrationSyncJob{}).
		Where("provider = 'bookinghotel' AND status = 'failed'").
		Count(&h.FailedJobs)

	// 3. Last successful sync time
	var lastJob models.IntegrationSyncJob
	if err := config.DB.Where("provider = 'bookinghotel' AND status = 'success'").
		Order("updated_at DESC").First(&lastJob).Error; err == nil {
		if lastJob.UpdatedAt > 0 {
			t := time.UnixMilli(lastJob.UpdatedAt)
			h.LastSyncTime = t.Format("2006-01-02 15:04:05")
		}
	}

	// 4. Last inbound booking from BookingHotel
	var lastCB models.ChannelBooking
	if err := config.DB.Where("channel_name = 'BookingHotel'").
		Order("created_at DESC").First(&lastCB).Error; err == nil {
		if lastCB.CreatedAt > 0 {
			t := time.UnixMilli(lastCB.CreatedAt)
			h.LastSyncTime = t.Format("2006-01-02 15:04:05")
		}
	}

	// 5. Live connectivity probe — hit BookingHotel's inventory API with dummy
	//    credentials (expects a "Fail" response — proves the endpoint is UP)
	apiURL := os.Getenv("BOOKINGHOTEL_INVENTORY_URL")
	if apiURL == "" {
		apiURL = "https://api.bookinghotel.co.in/api/Inventory/UpdateInventory"
	}

	probeStatus, probeLatency, probeMsg := probeBookingHotelAPI(apiURL)
	h.APILatency = probeLatency
	h.APIEndpoint = apiURL

	switch probeStatus {
	case "reachable":
		if h.FailedJobs > 20 {
			h.Status = "degraded"
			h.Message = fmt.Sprintf("API reachable (%s) but %d failed sync jobs", probeLatency, h.FailedJobs)
		} else {
			h.Status = "ok"
			h.Message = fmt.Sprintf("API reachable · %s latency · %d hotels linked", probeLatency, linkedHotels)
		}
	case "auth_fail":
		// BookingHotel returned a Fail response — the API is UP, credentials are just test values
		h.Status = "ok"
		h.Message = fmt.Sprintf("API reachable · responded with Fail (expected for probe) · %s", probeLatency)
	case "unreachable":
		h.Status = "down"
		h.Message = "BookingHotel API unreachable: " + probeMsg
	default:
		h.Status = "degraded"
		h.Message = probeMsg
	}

	return h
}

// probeBookingHotelAPI sends a lightweight probe request to BookingHotel's inventory API.
// A "Fail" response from BookingHotel means the server is UP (just invalid creds).
func probeBookingHotelAPI(apiURL string) (status, latency, message string) {
	probe := map[string]interface{}{
		"Header":     map[string]string{"Username": "_probe_", "Password": "_probe_"},
		"HotelId":    "0",
		"RoomTypeId": "0",
		"InfoDays":   "01/01/2000|01/01/2000|0",
	}
	body, _ := json.Marshal(probe)

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewBuffer(body))
	if err != nil {
		return "unreachable", "—", err.Error()
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	t0 := time.Now()
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	elapsed := fmt.Sprintf("%dms", time.Since(t0).Milliseconds())

	if err != nil {
		if strings.Contains(err.Error(), "context deadline exceeded") || strings.Contains(err.Error(), "timeout") {
			return "unreachable", elapsed, "connection timed out"
		}
		return "unreachable", elapsed, err.Error()
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)

	// Any HTTP 200 means reachable
	if resp.StatusCode == http.StatusOK {
		// Check if response says Fail (expected for probe creds)
		respStr := strings.ToLower(string(respBytes))
		if strings.Contains(respStr, "fail") || strings.Contains(respStr, "invalid") {
			return "auth_fail", elapsed, string(respBytes)
		}
		return "reachable", elapsed, string(respBytes)
	}

	return "unreachable", elapsed, fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(respBytes))
}

// ════════════════════════════════════════════════════════
// COMPLIANCE & AUDIT
// ════════════════════════════════════════════════════════

type AuditLogRow struct {
	ID          uint   `json:"id"`
	HotelID     uint   `json:"hotel_id"`
	HotelName   string `json:"hotel_name"`
	AdminName   string `json:"admin_name"`
	Module      string `json:"module"`
	Action      string `json:"action"`
	Reference   string `json:"reference"`
	Description string `json:"description"`
	CreatedAt   int64  `json:"created_at"`
}

type AuditListResult struct {
	Data       []AuditLogRow `json:"data"`
	Total      int64         `json:"total"`
	Page       int           `json:"page"`
	PageSize   int           `json:"page_size"`
	TotalPages int64         `json:"total_pages"`
}

func GetPlatformAuditLogs(page, pageSize int, module, action, hotelID string) (*AuditListResult, error) {
	query := config.DB.Model(&models.ActivityLog{})
	if module != "" {
		query = query.Where("module = ?", module)
	}
	if action != "" {
		query = query.Where("action ILIKE ?", "%"+action+"%")
	}
	if hotelID != "" {
		query = query.Where("hotel_id = ?", hotelID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	var logs []models.ActivityLog
	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&logs).Error; err != nil {
		return nil, err
	}

	// Resolve hotel and admin names in batch
	hotelIDs := map[uint]string{}
	adminIDs := map[uint]string{}
	for _, l := range logs {
		hotelIDs[l.HotelID] = ""
		adminIDs[l.AdminID] = ""
	}

	var hList []models.Hotel
	if len(hotelIDs) > 0 {
		ids := make([]uint, 0, len(hotelIDs))
		for id := range hotelIDs {
			ids = append(ids, id)
		}
		config.DB.Select("id, name").Where("id IN ?", ids).Find(&hList)
		for _, h := range hList {
			hotelIDs[h.ID] = h.Name
		}
	}

	var aList []models.Admin
	if len(adminIDs) > 0 {
		ids := make([]uint, 0, len(adminIDs))
		for id := range adminIDs {
			ids = append(ids, id)
		}
		config.DB.Select("id, name, username").Where("id IN ?", ids).Find(&aList)
		for _, a := range aList {
			name := a.Name
			if name == "" {
				name = a.Username
			}
			adminIDs[a.ID] = name
		}
	}

	rows := make([]AuditLogRow, 0, len(logs))
	for _, l := range logs {
		rows = append(rows, AuditLogRow{
			ID:          l.ID,
			HotelID:     l.HotelID,
			HotelName:   hotelIDs[l.HotelID],
			AdminName:   adminIDs[l.AdminID],
			Module:      l.Module,
			Action:      l.Action,
			Reference:   l.Reference,
			Description: l.Description,
			CreatedAt:   l.CreatedAt,
		})
	}

	totalPages := (total + int64(pageSize) - 1) / int64(pageSize)
	return &AuditListResult{
		Data:       rows,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
}

// GetAuditModules returns distinct module names for filter dropdown
func GetAuditModules() ([]string, error) {
	var modules []string
	err := config.DB.Model(&models.ActivityLog{}).
		Distinct("module").
		Where("module != ''").
		Order("module").
		Pluck("module", &modules).Error
	return modules, err
}
