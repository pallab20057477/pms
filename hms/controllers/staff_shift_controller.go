package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

type shiftNoteRequest struct {
	Notes string `json:"notes"`
}

type staffAttendanceRow struct {
	ShiftID        uint   `json:"shift_id"`
	StaffID        uint   `json:"staff_id"`
	StaffName      string `json:"staff_name"`
	Role           string `json:"role"`
	ShiftDate      string `json:"shift_date"`
	CheckInAt      string `json:"check_in_at"`
	CheckOutAt     string `json:"check_out_at"`
	MinutesWorked  int64  `json:"minutes_worked"`
	ShiftStatus    string `json:"shift_status"`
	AttendanceNote string `json:"attendance_note"`
}

type staffRankingRow struct {
	Role            string  `json:"role"`
	StaffID         uint    `json:"staff_id"`
	StaffName       string  `json:"staff_name"`
	CompletedRooms  int64   `json:"completed_rooms"`
	AvgCleaningMin  float64 `json:"avg_cleaning_min"`
	OnTimeRate      float64 `json:"on_time_rate"`
	ClosedShifts    int64   `json:"closed_shifts"`
	AvgShiftMinutes float64 `json:"avg_shift_minutes"`
	CompositeScore  float64 `json:"composite_score"`
	ScoreLabel      string  `json:"score_label"`
}

func parseOnTimeTargetMinutes(c *gin.Context) int {
	// Default target is 120 minutes to match practical housekeeping SLAs.
	target := 120
	raw := strings.TrimSpace(c.Query("on_time_target_min"))
	if raw == "" {
		return target
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return target
	}
	if n > 1440 {
		return 1440
	}
	return n
}

func parseStaffIDParam(c *gin.Context) (uint, error) {
	raw := strings.TrimSpace(c.Param("id"))
	n, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || n == 0 {
		return 0, fmt.Errorf("invalid staff id")
	}
	return uint(n), nil
}

func getStaffByIDForHotel(hotelID uint, staffID uint) (*models.Staff, error) {
	var s models.Staff
	if err := config.DB.First(&s, staffID).Error; err != nil {
		return nil, err
	}
	if s.HotelID != hotelID {
		return nil, fmt.Errorf("staff not found")
	}
	return &s, nil
}

func ListStaffShifts(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	staffID, err := parseStaffIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": err.Error()})
		return
	}
	if _, err := getStaffByIDForHotel(hotelID, staffID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"status": false, "error": "Staff not found"})
		return
	}

	page := 1
	if q := strings.TrimSpace(c.Query("page")); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 {
			page = n
		}
	}
	pageSize := 20
	if q := strings.TrimSpace(c.Query("page_size")); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 {
			if n > 200 {
				n = 200
			}
			pageSize = n
		}
	}

	dbq := config.DB.Model(&models.StaffShift{}).Where("hotel_id = ? AND staff_id = ? AND deleted_at IS NULL", hotelID, staffID)
	if from := strings.TrimSpace(c.Query("from")); from != "" {
		dbq = dbq.Where("shift_date >= ?", from)
	}
	if to := strings.TrimSpace(c.Query("to")); to != "" {
		dbq = dbq.Where("shift_date <= ?", to)
	}

	var total int64
	if err := dbq.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to count shifts"})
		return
	}

	var rows []models.StaffShift
	if err := dbq.Order("id desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to fetch shifts"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": true, "data": gin.H{"items": rows, "total": total, "page": page, "page_size": pageSize}})
}

func ListAttendance(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")

	page := 1
	if q := strings.TrimSpace(c.Query("page")); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 {
			page = n
		}
	}
	pageSize := 25
	if q := strings.TrimSpace(c.Query("page_size")); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 {
			if n > 300 {
				n = 300
			}
			pageSize = n
		}
	}

	q := strings.TrimSpace(c.Query("q"))
	role := strings.TrimSpace(c.Query("role"))
	status := strings.TrimSpace(c.Query("status"))
	from := strings.TrimSpace(c.Query("from"))
	to := strings.TrimSpace(c.Query("to"))

	base := config.DB.Table("staff_shifts ss").
		Joins("JOIN staffs s ON s.id = ss.staff_id").
		Where("ss.hotel_id = ? AND ss.deleted_at IS NULL AND s.deleted_at IS NULL", hotelID)

	if q != "" {
		like := "%" + q + "%"
		base = base.Where("s.name ILIKE ? OR s.phone ILIKE ?", like, like)
	}
	if role != "" {
		base = base.Where("LOWER(s.role) = LOWER(?)", role)
	}
	if status != "" && strings.ToLower(status) != "all" {
		base = base.Where("LOWER(ss.status) = LOWER(?)", status)
	}
	if from != "" {
		base = base.Where("ss.shift_date >= ?", from)
	}
	if to != "" {
		base = base.Where("ss.shift_date <= ?", to)
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to count attendance rows"})
		return
	}

	var rows []staffAttendanceRow
	if err := base.Select(`
		ss.id AS shift_id,
		ss.staff_id,
		s.name AS staff_name,
		s.role,
		ss.shift_date,
		ss.check_in_at,
		ss.check_out_at,
		ss.minutes_worked,
		ss.status AS shift_status,
		ss.notes AS attendance_note
	`).Order("ss.shift_date desc, ss.id desc").Offset((page - 1) * pageSize).Limit(pageSize).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to fetch attendance"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": true, "data": gin.H{"items": rows, "total": total, "page": page, "page_size": pageSize}})
}

func StaffPerformanceRanking(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	from := strings.TrimSpace(c.Query("from"))
	to := strings.TrimSpace(c.Query("to"))
	role := strings.TrimSpace(c.Query("role"))
	onTimeTargetMin := parseOnTimeTargetMinutes(c)

	type hkAgg struct {
		StaffName      string
		CompletedRooms int64
		AvgCleaningMin float64
		OnTimeRate     float64
	}
	type shiftAgg struct {
		StaffID         uint
		ClosedShifts    int64
		AvgShiftMinutes float64
	}

	var staffRows []models.Staff
	staffQ := config.DB.Where("hotel_id = ? AND deleted_at IS NULL", hotelID)
	if role != "" && strings.ToLower(role) != "all" {
		staffQ = staffQ.Where("LOWER(role) = LOWER(?)", role)
	}
	if err := staffQ.Find(&staffRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to load staff"})
		return
	}

	staffNames := make([]string, 0, len(staffRows))
	for _, s := range staffRows {
		if name := strings.TrimSpace(s.Name); name != "" {
			staffNames = append(staffNames, name)
		}
	}

	hkByName := map[string]hkAgg{}
	if len(staffNames) > 0 {
		onTimeRateExpr := fmt.Sprintf(`
			COALESCE(
				AVG(
					CASE
						WHEN current_status = 'available' AND duration_min > 0 AND duration_min <= %d THEN 100.0
						WHEN current_status = 'available' AND duration_min > 0 THEN 0.0
						ELSE NULL
					END
				),
			0
			) AS on_time_rate`, onTimeTargetMin)
		hkBase := config.DB.Model(&models.HousekeepingHistory{}).
			Select(`TRIM(assigned_to) AS staff_name,
			COUNT(*) FILTER (WHERE current_status = 'available') AS completed_rooms,
			COALESCE(AVG(duration_min) FILTER (WHERE current_status = 'available'), 0) AS avg_cleaning_min,
			`+onTimeRateExpr).
			Where("hotel_id = ? AND current_status = 'available' AND TRIM(assigned_to) IN ?", hotelID, staffNames)
		if from != "" {
			hkBase = hkBase.Where("(start_time = '' OR start_time >= ?)", from)
		}
		if to != "" {
			hkBase = hkBase.Where("(start_time = '' OR start_time <= ?)", to)
		}
		hkBase = hkBase.Group("TRIM(assigned_to)")

		var hks []hkAgg
		if err := hkBase.Scan(&hks).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to compute housekeeping ranking stats"})
			return
		}
		for _, h := range hks {
			hkByName[strings.TrimSpace(h.StaffName)] = h
		}
	}

	shiftBase := config.DB.Model(&models.StaffShift{}).
		Select("staff_id, COUNT(*) FILTER (WHERE status = 'closed') AS closed_shifts, COALESCE(AVG(minutes_worked) FILTER (WHERE status = 'closed' AND minutes_worked > 0), 0) AS avg_shift_minutes").
		Where("hotel_id = ? AND deleted_at IS NULL", hotelID)
	if from != "" {
		shiftBase = shiftBase.Where("shift_date >= ?", from)
	}
	if to != "" {
		shiftBase = shiftBase.Where("shift_date <= ?", to)
	}
	shiftBase = shiftBase.Group("staff_id")

	var shifts []shiftAgg
	if err := shiftBase.Scan(&shifts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to compute shift ranking stats"})
		return
	}
	shiftByStaff := map[uint]shiftAgg{}
	for _, s := range shifts {
		shiftByStaff[s.StaffID] = s
	}

	rows := make([]staffRankingRow, 0, len(staffRows))
	for _, s := range staffRows {
		h := hkByName[strings.TrimSpace(s.Name)]
		sh := shiftByStaff[s.ID]
		onTimeRate := h.OnTimeRate

		normalizedShiftCount := float64(sh.ClosedShifts * 10)
		if normalizedShiftCount > 100 {
			normalizedShiftCount = 100
		}
		normalizedShiftDuration := sh.AvgShiftMinutes / 6.0
		if normalizedShiftDuration > 100 {
			normalizedShiftDuration = 100
		}
		normalizedRooms := float64(h.CompletedRooms)
		if normalizedRooms > 100 {
			normalizedRooms = 100
		}

		score := 0.0
		scoreLabel := "Attendance Score"
		if strings.EqualFold(strings.TrimSpace(s.Role), "Housekeeping") {
			// Housekeeping balances cleaning output, on-time room completion, and shift consistency.
			score = (0.4 * onTimeRate) + (0.4 * normalizedRooms) + (0.2 * normalizedShiftDuration)
			scoreLabel = "Housekeeping Score"
		} else {
			// Non-housekeeping roles are measured by attendance discipline and shift consistency.
			score = (0.6 * normalizedShiftCount) + (0.4 * normalizedShiftDuration)
		}

		rows = append(rows, staffRankingRow{
			Role:            s.Role,
			StaffID:         s.ID,
			StaffName:       s.Name,
			CompletedRooms:  h.CompletedRooms,
			AvgCleaningMin:  h.AvgCleaningMin,
			OnTimeRate:      onTimeRate,
			ClosedShifts:    sh.ClosedShifts,
			AvgShiftMinutes: sh.AvgShiftMinutes,
			CompositeScore:  score,
			ScoreLabel:      scoreLabel,
		})
	}

	// simple in-memory sort descending by score
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if rows[j].CompositeScore > rows[i].CompositeScore {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": true, "data": gin.H{"items": rows, "total": len(rows)}})
}

func StaffCheckIn(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	staffID, err := parseStaffIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": err.Error()})
		return
	}
	staff, err := getStaffByIDForHotel(hotelID, staffID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"status": false, "error": "Staff not found"})
		return
	}
	if !staff.Status {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "Inactive staff cannot check in"})
		return
	}

	var existing models.StaffShift
	openShiftCheck := config.DB.Where("hotel_id = ? AND staff_id = ? AND status = ? AND deleted_at IS NULL", hotelID, staffID, "open").Order("id desc").Limit(1).Find(&existing)
	if openShiftCheck.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to validate open shift"})
		return
	}
	if openShiftCheck.RowsAffected > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "Staff already checked in"})
		return
	}

	var req shiftNoteRequest
	_ = c.ShouldBindJSON(&req)
	now := time.Now()
	shift := models.StaffShift{
		HotelID:   hotelID,
		StaffID:   staffID,
		ShiftDate: now.Format("2006-01-02"),
		CheckInAt: now.Format(time.RFC3339),
		Status:    "open",
		Notes:     strings.TrimSpace(req.Notes),
	}
	if err := config.DB.Create(&shift).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to check in"})
		return
	}
	utils.LogActivity(hotelID, "Staff", adminID, fmt.Sprintf("Staff check-in: %s", staff.Name))
	c.JSON(http.StatusOK, gin.H{"status": true, "message": "Check-in recorded", "data": shift})
}

func StaffCheckOut(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	staffID, err := parseStaffIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": err.Error()})
		return
	}
	staff, err := getStaffByIDForHotel(hotelID, staffID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"status": false, "error": "Staff not found"})
		return
	}

	var req shiftNoteRequest
	_ = c.ShouldBindJSON(&req)

	var shift models.StaffShift
	openShiftQuery := config.DB.Where("hotel_id = ? AND staff_id = ? AND status = ? AND deleted_at IS NULL", hotelID, staffID, "open").Order("id desc").Limit(1).Find(&shift)
	if openShiftQuery.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to load open shift"})
		return
	}
	if openShiftQuery.RowsAffected == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "No open shift found for checkout"})
		return
	}

	now := time.Now()
	checkInAt, parseErr := time.Parse(time.RFC3339, shift.CheckInAt)
	minutes := int64(0)
	if parseErr == nil {
		minutes = int64(now.Sub(checkInAt).Minutes())
		if minutes < 0 {
			minutes = 0
		}
	}

	shift.CheckOutAt = now.Format(time.RFC3339)
	shift.Status = "closed"
	shift.MinutesWorked = minutes
	if strings.TrimSpace(req.Notes) != "" {
		shift.Notes = strings.TrimSpace(req.Notes)
	}

	if err := config.DB.Save(&shift).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to check out"})
		return
	}
	utils.LogActivity(hotelID, "Staff", adminID, fmt.Sprintf("Staff check-out: %s", staff.Name))
	c.JSON(http.StatusOK, gin.H{"status": true, "message": "Check-out recorded", "data": shift})
}

func StaffPerformance(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	staffID, err := parseStaffIDParam(c)
	onTimeTargetMin := parseOnTimeTargetMinutes(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": err.Error()})
		return
	}
	staff, err := getStaffByIDForHotel(hotelID, staffID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"status": false, "error": "Staff not found"})
		return
	}

	staffName := strings.TrimSpace(staff.Name)

	var completed int64
	_ = config.DB.Model(&models.HousekeepingHistory{}).
		Where("hotel_id = ? AND TRIM(assigned_to) = ? AND current_status = ?", hotelID, staffName, "available").
		Count(&completed).Error

	var avgCleaningMin float64
	_ = config.DB.Model(&models.HousekeepingHistory{}).
		Where("hotel_id = ? AND TRIM(assigned_to) = ? AND current_status = ?", hotelID, staffName, "available").
		Select("COALESCE(AVG(duration_min), 0)").
		Scan(&avgCleaningMin).Error

	var onTimeCount int64
	_ = config.DB.Model(&models.HousekeepingHistory{}).
		Where("hotel_id = ? AND TRIM(assigned_to) = ? AND current_status = ? AND duration_min > 0 AND duration_min <= ?", hotelID, staffName, "available", onTimeTargetMin).
		Count(&onTimeCount).Error

	onTimeRate := 0.0
	if completed > 0 {
		onTimeRate = (float64(onTimeCount) / float64(completed)) * 100.0
	}

	var totalShifts int64
	_ = config.DB.Model(&models.StaffShift{}).
		Where("hotel_id = ? AND staff_id = ? AND deleted_at IS NULL", hotelID, staffID).
		Count(&totalShifts).Error

	var closedShifts int64
	_ = config.DB.Model(&models.StaffShift{}).
		Where("hotel_id = ? AND staff_id = ? AND status = ? AND deleted_at IS NULL", hotelID, staffID, "closed").
		Count(&closedShifts).Error

	var avgShiftMin float64
	_ = config.DB.Model(&models.StaffShift{}).
		Where("hotel_id = ? AND staff_id = ? AND status = ? AND minutes_worked > 0 AND deleted_at IS NULL", hotelID, staffID, "closed").
		Select("COALESCE(AVG(minutes_worked), 0)").
		Scan(&avgShiftMin).Error

	var openShift models.StaffShift
	openShiftQuery := config.DB.Where("hotel_id = ? AND staff_id = ? AND status = ? AND deleted_at IS NULL", hotelID, staffID, "open").Order("id desc").Limit(1).Find(&openShift)
	openShiftExists := openShiftQuery.Error == nil && openShiftQuery.RowsAffected > 0

	c.JSON(http.StatusOK, gin.H{
		"status": true,
		"data": gin.H{
			"staff_id":                 staffID,
			"staff_name":               staff.Name,
			"attendance_total_shifts":  totalShifts,
			"attendance_closed_shifts": closedShifts,
			"attendance_avg_shift_min": avgShiftMin,
			"open_shift":               map[bool]interface{}{true: openShift, false: nil}[openShiftExists],
			"quality_completed_rooms":  completed,
			"quality_avg_cleaning_min": avgCleaningMin,
			"quality_on_time_rate":     onTimeRate,
			"quality_on_time_target":   onTimeTargetMin,
		},
	})
}
