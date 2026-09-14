package controllers

import (
	"fmt"
	"hms/config"
	"hms/models"
	"hms/utils"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type reportDateRange struct {
	fromDate string
	toDate   string
	from     time.Time
	to       time.Time
}

func parseReportDateRange(c *gin.Context) (reportDateRange, bool) {
	fromDate := strings.TrimSpace(c.Query("from_date"))
	toDate := strings.TrimSpace(c.Query("to_date"))
	if fromDate == "" || toDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from_date and to_date are required (YYYY-MM-DD)"})
		return reportDateRange{}, false
	}

	from, err := time.Parse("2006-01-02", fromDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid from_date. Use YYYY-MM-DD"})
		return reportDateRange{}, false
	}
	to, err := time.Parse("2006-01-02", toDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid to_date. Use YYYY-MM-DD"})
		return reportDateRange{}, false
	}
	if to.Before(from) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "to_date must be on or after from_date"})
		return reportDateRange{}, false
	}

	return reportDateRange{fromDate: fromDate, toDate: toDate, from: from, to: to}, true
}

func dateKey(t time.Time) string {
	return t.Format("2006-01-02")
}

func nightsBetween(checkIn, checkOut time.Time) int {
	nights := int(checkOut.Sub(checkIn).Hours() / 24)
	if nights <= 0 {
		return 1
	}
	return nights
}

func overlapNights(booking models.Booking, from, to time.Time) int {
	bookingStart := booking.CheckInDate
	bookingEnd := booking.CheckOutDate
	if bookingEnd.Before(bookingStart) {
		bookingEnd = bookingStart.Add(24 * time.Hour)
	}

	periodEndExclusive := to.Add(24 * time.Hour)
	start := bookingStart
	if start.Before(from) {
		start = from
	}
	end := bookingEnd
	if end.After(periodEndExclusive) {
		end = periodEndExclusive
	}

	if !end.After(start) {
		return 0
	}
	return int(end.Sub(start).Hours() / 24)
}

func dateRangeDays(from, to time.Time) int {
	d := int(to.Sub(from).Hours()/24) + 1
	if d < 1 {
		return 1
	}
	return d
}

func normalizeStatus(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

func reportScopeBookings(hotelID uint, dr reportDateRange) ([]models.Booking, error) {
	var bookings []models.Booking
	err := config.DB.
		Where("hotel_id = ?", hotelID).
		Where("check_in_date <= ? AND check_out_date >= ?", dr.to, dr.from).
		Find(&bookings).Error
	return bookings, err
}

func ReportSummary(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	dr, ok := parseReportDateRange(c)
	if !ok {
		return
	}
	logReportGeneration(c, hotelID, "summary", dr)

	bookings, err := reportScopeBookings(hotelID, dr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load bookings"})
		return
	}

	var rooms []models.Room
	if err := config.DB.Where("hotel_id = ?", hotelID).Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load rooms"})
		return
	}

	roomCount := len(rooms)
	totalDays := dateRangeDays(dr.from, dr.to)
	totalRoomNights := roomCount * totalDays

	occupiedRoomNights := 0
	totalRevenue := 0.0
	pendingTotal := 0.0
	cancelledCount := 0
	cleanedCount := int64(0)

	paymentSumByBooking := map[uint]float64{}
	var payments []models.Payment
	if err := config.DB.
		Joins("JOIN bookings b ON b.id = payments.booking_id AND b.deleted_at IS NULL").
		Where("b.hotel_id = ?", hotelID).
		Where("b.status != ?", "cancelled").
		Where("payments.deleted_at IS NULL").
		Where("DATE(COALESCE(payments.paid_on, payments.created_at)) BETWEEN ? AND ?", dr.fromDate, dr.toDate).
		Find(&payments).Error; err == nil {
		for _, p := range payments {
			paymentSumByBooking[p.BookingID] += p.Amount
		}
	}

	for _, b := range bookings {
		status := normalizeStatus(b.Status)
		if status == "cancelled" {
			cancelledCount++
			continue
		}
		overlap := overlapNights(b, dr.from, dr.to)
		occupiedRoomNights += overlap
		totalRevenue += b.TotalAmount
		pending := b.TotalAmount - paymentSumByBooking[b.ID]
		if pending > 0 {
			pendingTotal += pending
		}
	}

	fromUnix := dr.from.Unix()
	toUnix := dr.to.Add(24*time.Hour - time.Second).Unix()
	if err := config.DB.Model(&models.HousekeepingHistory{}).
		Where("hotel_id = ?", hotelID).
		Where("created_at BETWEEN ? AND ?", fromUnix, toUnix).
		Count(&cleanedCount).Error; err != nil {
		cleanedCount = 0
	}

	occupancyPct := 0.0
	if totalRoomNights > 0 {
		occupancyPct = (float64(occupiedRoomNights) / float64(totalRoomNights)) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"from_date": dr.fromDate,
		"to_date":   dr.toDate,
		"summary": gin.H{
			"occupancy_pct":      math.Round(occupancyPct*100) / 100,
			"total_revenue":      math.Round(totalRevenue*100) / 100,
			"pending_amount":     math.Round(pendingTotal*100) / 100,
			"cancelled_bookings": cancelledCount,
			"rooms_cleaned":      cleanedCount,
		},
	})
}

func ReportOverview(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	end := time.Now()
	start := time.Date(end.Year(), end.Month(), 1, 0, 0, 0, 0, end.Location())
	dr := reportDateRange{
		fromDate: start.Format("2006-01-02"),
		toDate:   end.Format("2006-01-02"),
		from:     start,
		to:       end,
	}
	bookings, err := reportScopeBookings(hotelID, dr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load bookings"})
		return
	}
	var rooms []models.Room
	if err := config.DB.Where("hotel_id = ?", hotelID).Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load rooms"})
		return
	}
	roomCount := len(rooms)
	totalDays := dateRangeDays(dr.from, dr.to)
	totalRoomNights := roomCount * totalDays
	occupiedRoomNights := 0
	totalRevenue := 0.0
	pendingTotal := 0.0
	cancelledCount := 0

	paymentSumByBooking := map[uint]float64{}
	var payments []models.Payment
	if err := config.DB.
		Joins("JOIN bookings b ON b.id = payments.booking_id AND b.deleted_at IS NULL").
		Where("b.hotel_id = ?", hotelID).
		Where("b.status != ?", "cancelled").
		Where("payments.deleted_at IS NULL").
		Where("DATE(COALESCE(payments.paid_on, payments.created_at)) BETWEEN ? AND ?", dr.fromDate, dr.toDate).
		Find(&payments).Error; err == nil {
		for _, p := range payments {
			paymentSumByBooking[p.BookingID] += p.Amount
		}
	}
	for _, b := range bookings {
		if normalizeStatus(b.Status) == "cancelled" {
			cancelledCount++
			continue
		}
		occupiedRoomNights += overlapNights(b, dr.from, dr.to)
		totalRevenue += b.TotalAmount
		pending := b.TotalAmount - paymentSumByBooking[b.ID]
		if pending > 0 {
			pendingTotal += pending
		}
	}
	occupancyPct := 0.0
	if totalRoomNights > 0 {
		occupancyPct = (float64(occupiedRoomNights) / float64(totalRoomNights)) * 100
	}
	c.JSON(http.StatusOK, gin.H{
		"status": true,
		"data": gin.H{
			"from_date":          dr.fromDate,
			"to_date":            dr.toDate,
			"occupancy_pct":      math.Round(occupancyPct*100) / 100,
			"total_revenue":      math.Round(totalRevenue*100) / 100,
			"pending_amount":     math.Round(pendingTotal*100) / 100,
			"cancelled_bookings": cancelledCount,
			"total_rooms":        roomCount,
		},
	})
}

func ReportOccupancy(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	dr, ok := parseReportDateRange(c)
	if !ok {
		return
	}
	logReportGeneration(c, hotelID, "occupancy", dr)

	var rooms []models.Room
	if err := config.DB.Where("hotel_id = ?", hotelID).Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load rooms"})
		return
	}

	bookings, err := reportScopeBookings(hotelID, dr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load bookings"})
		return
	}

	totalDays := dateRangeDays(dr.from, dr.to)
	totalRoomNights := len(rooms) * totalDays
	occupiedRoomNights := 0
	stayNightsTotal := 0
	stayCount := 0

	dailyOccupied := map[string]int{}
	for d := dr.from; !d.After(dr.to); d = d.Add(24 * time.Hour) {
		dailyOccupied[dateKey(d)] = 0
	}

	for _, b := range bookings {
		status := normalizeStatus(b.Status)
		if status == "cancelled" {
			continue
		}
		overlap := overlapNights(b, dr.from, dr.to)
		occupiedRoomNights += overlap

		stayNightsTotal += nightsBetween(b.CheckInDate, b.CheckOutDate)
		stayCount++

		periodEndExclusive := dr.to.Add(24 * time.Hour)
		start := b.CheckInDate
		if start.Before(dr.from) {
			start = dr.from
		}
		end := b.CheckOutDate
		if end.After(periodEndExclusive) {
			end = periodEndExclusive
		}
		for day := start; day.Before(end); day = day.Add(24 * time.Hour) {
			k := dateKey(day)
			dailyOccupied[k]++
		}
	}

	avgStay := 0.0
	if stayCount > 0 {
		avgStay = float64(stayNightsTotal) / float64(stayCount)
	}

	occupancyPct := 0.0
	if totalRoomNights > 0 {
		occupancyPct = (float64(occupiedRoomNights) / float64(totalRoomNights)) * 100
	}

	dailyTrend := make([]gin.H, 0, totalDays)
	tableRows := make([]gin.H, 0, totalDays)
	for d := dr.from; !d.After(dr.to); d = d.Add(24 * time.Hour) {
		k := dateKey(d)
		occupied := dailyOccupied[k]
		vacant := len(rooms) - occupied
		if vacant < 0 {
			vacant = 0
		}
		pct := 0.0
		if len(rooms) > 0 {
			pct = (float64(occupied) / float64(len(rooms))) * 100
		}
		roundedPct := math.Round(pct*100) / 100
		dailyTrend = append(dailyTrend, gin.H{
			"date":      k,
			"occupied":  occupied,
			"occupancy": roundedPct,
		})
		tableRows = append(tableRows, gin.H{
			"date":                 k,
			"total_rooms":          len(rooms),
			"occupied_room_nights": occupied,
			"vacant_room_nights":   vacant,
			"occupancy_pct":        roundedPct,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"report_type": "occupancy",
		"from_date":   dr.fromDate,
		"to_date":     dr.toDate,
		"summary": gin.H{
			"occupancy_pct":           math.Round(occupancyPct*100) / 100,
			"total_room_nights":       totalRoomNights,
			"occupied_room_nights":    occupiedRoomNights,
			"average_length_of_stay":  math.Round(avgStay*100) / 100,
			"total_rooms":             len(rooms),
			"days_in_selected_period": totalDays,
		},
		"charts": gin.H{
			"daily_trend": dailyTrend,
		},
		"table": tableRows,
	})
}

func ReportRevenue(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	dr, ok := parseReportDateRange(c)
	if !ok {
		return
	}
	logReportGeneration(c, hotelID, "revenue", dr)

	bookings, err := reportScopeBookings(hotelID, dr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load bookings"})
		return
	}

	totalRevenue := 0.0
	roomRevenue := 0.0
	serviceRevenue := 0.0
	taxCollected := 0.0
	activeBookings := 0

	for _, b := range bookings {
		if normalizeStatus(b.Status) == "cancelled" {
			continue
		}
		activeBookings++
		totalRevenue += b.TotalAmount
		r := b.BaseRate - b.Discount
		if r < 0 {
			r = 0
		}
		roomRevenue += r
		taxCollected += b.Tax
		s := b.TotalAmount - r - b.Tax
		if s > 0 {
			serviceRevenue += s
		}
	}

	var payments []models.Payment
	if err := config.DB.
		Joins("JOIN bookings b ON b.id = payments.booking_id AND b.deleted_at IS NULL").
		Where("b.hotel_id = ?", hotelID).
		Where("b.status != ?", "cancelled").
		Where("payments.deleted_at IS NULL").
		Where("DATE(COALESCE(payments.paid_on, payments.created_at)) BETWEEN ? AND ?", dr.fromDate, dr.toDate).
		Find(&payments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load payments"})
		return
	}

	daily := map[string]float64{}
	dailyPaymentCount := map[string]int{}
	for d := dr.from; !d.After(dr.to); d = d.Add(24 * time.Hour) {
		daily[dateKey(d)] = 0
		dailyPaymentCount[dateKey(d)] = 0
	}
	for _, p := range payments {
		date := p.CreatedAt
		if p.PaidOn != nil {
			date = *p.PaidOn
		}
		k := dateKey(date)
		if _, ok := daily[k]; ok {
			daily[k] += p.Amount
			dailyPaymentCount[k]++
		}
	}

	dailyTrend := make([]gin.H, 0, len(daily))
	tableRows := make([]gin.H, 0, len(daily))
	runningTotal := 0.0
	for d := dr.from; !d.After(dr.to); d = d.Add(24 * time.Hour) {
		k := dateKey(d)
		dayAmount := math.Round(daily[k]*100) / 100
		runningTotal += dayAmount
		dailyTrend = append(dailyTrend, gin.H{"date": k, "amount": dayAmount})
		tableRows = append(tableRows, gin.H{
			"date":             k,
			"collected_amount": dayAmount,
			"payments_count":   dailyPaymentCount[k],
			"running_total":    math.Round(runningTotal*100) / 100,
		})
	}

	periodDays := dateRangeDays(dr.from, dr.to)
	prevFrom := dr.from.AddDate(0, 0, -periodDays)
	prevTo := dr.to.AddDate(0, 0, -periodDays)
	prevBookings, _ := reportScopeBookings(hotelID, reportDateRange{from: prevFrom, to: prevTo})
	prevTotal := 0.0
	for _, b := range prevBookings {
		if normalizeStatus(b.Status) == "cancelled" {
			continue
		}
		prevTotal += b.TotalAmount
	}

	pctChange := 0.0
	if prevTotal > 0 {
		pctChange = ((totalRevenue - prevTotal) / prevTotal) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"report_type": "revenue",
		"from_date":   dr.fromDate,
		"to_date":     dr.toDate,
		"summary": gin.H{
			"total_revenue":               math.Round(totalRevenue*100) / 100,
			"room_revenue":                math.Round(roomRevenue*100) / 100,
			"service_revenue":             math.Round(serviceRevenue*100) / 100,
			"tax_collected":               math.Round(taxCollected*100) / 100,
			"compared_to_prev_period_pct": math.Round(pctChange*100) / 100,
			"active_bookings":             activeBookings,
		},
		"charts": gin.H{
			"daily_trend": dailyTrend,
			"breakdown": []gin.H{
				{"label": "Room Revenue", "value": math.Round(roomRevenue*100) / 100},
				{"label": "Service Revenue", "value": math.Round(serviceRevenue*100) / 100},
				{"label": "Tax Collected", "value": math.Round(taxCollected*100) / 100},
			},
		},
		"table": tableRows,
	})
}

func ReportRoomWiseRevenue(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	dr, ok := parseReportDateRange(c)
	if !ok {
		return
	}
	logReportGeneration(c, hotelID, "room-wise", dr)

	roomType := strings.TrimSpace(c.Query("room_type"))

	var rooms []models.Room
	q := config.DB.Preload("RoomType").Where("rooms.hotel_id = ?", hotelID)
	if roomType != "" {
		q = q.Joins("JOIN room_types ON room_types.id = rooms.room_type_id").Where("room_types.name = ?", roomType)
	}
	if err := q.Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load rooms"})
		return
	}
	roomByID := map[uint]models.Room{}
	for _, r := range rooms {
		roomByID[r.ID] = r
	}
	if len(roomByID) == 0 {
		c.JSON(http.StatusOK, gin.H{"report_type": "room-wise", "from_date": dr.fromDate, "to_date": dr.toDate, "summary": gin.H{}, "table": []gin.H{}})
		return
	}

	bookings, err := reportScopeBookings(hotelID, dr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load bookings"})
		return
	}

	type agg struct {
		revenue  float64
		bookings int
		nights   int
	}
	aggs := map[uint]*agg{}
	for _, b := range bookings {
		if normalizeStatus(b.Status) == "cancelled" {
			continue
		}
		if b.RoomID == nil {
			continue
		}
		if _, ok := roomByID[*b.RoomID]; !ok {
			continue
		}
		if _, ok := aggs[*b.RoomID]; !ok {
			aggs[*b.RoomID] = &agg{}
		}
		a := aggs[*b.RoomID]
		a.revenue += b.TotalAmount
		a.bookings++
		a.nights += nightsBetween(b.CheckInDate, b.CheckOutDate)
	}

	table := make([]gin.H, 0, len(aggs))
	totalRevenue := 0.0
	for roomID, a := range aggs {
		r := roomByID[roomID]
		avgPerNight := 0.0
		if a.nights > 0 {
			avgPerNight = a.revenue / float64(a.nights)
		}
		totalRevenue += a.revenue
		table = append(table, gin.H{
			"room_id":                   roomID,
			"room_number":               r.RoomNumber,
			"room_type":                 r.RoomType.Name,
			"room_type_details":         r.RoomType,
			"total_revenue":             math.Round(a.revenue*100) / 100,
			"bookings_count":            a.bookings,
			"average_revenue_per_night": math.Round(avgPerNight*100) / 100,
		})
	}

	sort.Slice(table, func(i, j int) bool {
		return table[i]["total_revenue"].(float64) > table[j]["total_revenue"].(float64)
	})

	c.JSON(http.StatusOK, gin.H{
		"report_type": "room-wise",
		"from_date":   dr.fromDate,
		"to_date":     dr.toDate,
		"summary": gin.H{
			"total_revenue":   math.Round(totalRevenue*100) / 100,
			"rooms_in_report": len(table),
			"top_earning_room": func() string {
				if len(table) == 0 {
					return ""
				}
				return table[0]["room_number"].(string)
			}(),
		},
		"table": table,
	})
}

func ReportPendingPayments(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	dr, ok := parseReportDateRange(c)
	if !ok {
		return
	}
	logReportGeneration(c, hotelID, "pending-payments", dr)

	bookings, err := reportScopeBookings(hotelID, dr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load bookings"})
		return
	}

	ids := make([]uint, 0, len(bookings))
	for _, b := range bookings {
		ids = append(ids, b.ID)
	}

	paymentSumByBooking := map[uint]float64{}
	if len(ids) > 0 {
		var payments []models.Payment
		if err := config.DB.Where("booking_id IN ?", ids).Find(&payments).Error; err == nil {
			for _, p := range payments {
				paymentSumByBooking[p.BookingID] += p.Amount
			}
		}
	}

	guestByID := map[uint]models.Guest{}
	roomByID := map[uint]models.Room{}

	var guests []models.Guest
	var rooms []models.Room
	_ = config.DB.Where("hotel_id = ?", hotelID).Find(&guests).Error
	_ = config.DB.Where("hotel_id = ?", hotelID).Find(&rooms).Error
	for _, g := range guests {
		guestByID[g.ID] = g
	}
	for _, r := range rooms {
		roomByID[r.ID] = r
	}

	today := time.Now()
	table := make([]gin.H, 0)
	totalPending := 0.0
	overdueCount := 0
	for _, b := range bookings {
		if normalizeStatus(b.Status) == "cancelled" {
			continue
		}
		balance := b.TotalAmount - paymentSumByBooking[b.ID]
		if balance <= 0 {
			continue
		}
		daysOverdue := 0
		if b.CheckOutDate.Before(today) {
			daysOverdue = int(today.Sub(b.CheckOutDate).Hours() / 24)
		}
		if daysOverdue > 0 {
			overdueCount++
		}
		totalPending += balance
		roomNum := ""
		if b.RoomID != nil {
			roomNum = roomByID[*b.RoomID].RoomNumber
		}
		table = append(table, gin.H{
			"booking_id":    b.ID,
			"booking_code":  b.BookingCode,
			"customer_name": guestByID[b.GuestID].Name,
			"room":          roomNum,
			"due_amount":    math.Round(balance*100) / 100,
			"days_overdue":  daysOverdue,
			"status":        b.Status,
		})
	}

	sort.Slice(table, func(i, j int) bool {
		return table[i]["due_amount"].(float64) > table[j]["due_amount"].(float64)
	})

	c.JSON(http.StatusOK, gin.H{
		"report_type": "pending-payments",
		"from_date":   dr.fromDate,
		"to_date":     dr.toDate,
		"summary": gin.H{
			"outstanding_amount": math.Round(totalPending*100) / 100,
			"overdue_bookings":   overdueCount,
			"pending_bookings":   len(table),
		},
		"table": table,
	})
}

func ReportCancellations(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	dr, ok := parseReportDateRange(c)
	if !ok {
		return
	}
	logReportGeneration(c, hotelID, "cancellations", dr)

	bookings, err := reportScopeBookings(hotelID, dr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load bookings"})
		return
	}

	reasonCounts := map[string]int{}
	totalRefund := 0.0
	table := make([]gin.H, 0)
	cancelledCount := 0
	for _, b := range bookings {
		if normalizeStatus(b.Status) != "cancelled" {
			continue
		}
		cancelledCount++
		reason := strings.TrimSpace(b.CancellationReason)
		if reason == "" {
			reason = "Unspecified"
		}
		reasonCounts[reason]++
		totalRefund += b.RefundAmount
		table = append(table, gin.H{
			"booking_id":          b.ID,
			"booking_code":        b.BookingCode,
			"check_in_date":       b.CheckInDate.Format("2006-01-02"),
			"check_out_date":      b.CheckOutDate.Format("2006-01-02"),
			"cancellation_reason": reason,
			"refund_option":       b.RefundOption,
			"refund_amount":       math.Round(b.RefundAmount*100) / 100,
		})
	}

	reasons := make([]gin.H, 0, len(reasonCounts))
	for k, v := range reasonCounts {
		reasons = append(reasons, gin.H{"label": k, "value": v})
	}
	sort.Slice(reasons, func(i, j int) bool { return reasons[i]["value"].(int) > reasons[j]["value"].(int) })

	c.JSON(http.StatusOK, gin.H{
		"report_type": "cancellations",
		"from_date":   dr.fromDate,
		"to_date":     dr.toDate,
		"summary": gin.H{
			"cancelled_bookings": cancelledCount,
			"refund_amount":      math.Round(totalRefund*100) / 100,
			"top_reason": func() string {
				if len(reasons) == 0 {
					return ""
				}
				return reasons[0]["label"].(string)
			}(),
		},
		"charts": gin.H{"reasons": reasons},
		"table":  table,
	})
}

func ReportGuestHistory(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	dr, ok := parseReportDateRange(c)
	if !ok {
		return
	}
	logReportGeneration(c, hotelID, "guest-history", dr)
	guestType := strings.TrimSpace(strings.ToLower(c.Query("guest_type")))

	bookings, err := reportScopeBookings(hotelID, dr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load bookings"})
		return
	}

	var guests []models.Guest
	if err := config.DB.Where("hotel_id = ?", hotelID).Find(&guests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load guests"})
		return
	}
	guestByID := map[uint]models.Guest{}
	for _, g := range guests {
		guestByID[g.ID] = g
	}

	type agg struct {
		bookings int
		spend    float64
		lastStay time.Time
	}
	aggs := map[uint]*agg{}
	for _, b := range bookings {
		if normalizeStatus(b.Status) == "cancelled" {
			continue
		}
		if _, ok := aggs[b.GuestID]; !ok {
			aggs[b.GuestID] = &agg{}
		}
		a := aggs[b.GuestID]
		a.bookings++
		a.spend += b.TotalAmount
		if b.CheckOutDate.After(a.lastStay) {
			a.lastStay = b.CheckOutDate
		}
	}

	if guestType == "new" || guestType == "returning" {
		for id, a := range aggs {
			if guestType == "new" && a.bookings > 1 {
				delete(aggs, id)
			}
			if guestType == "returning" && a.bookings <= 1 {
				delete(aggs, id)
			}
		}
	}

	table := make([]gin.H, 0, len(aggs))
	totalSpend := 0.0
	newCount := 0
	returningCount := 0
	topRepeat := make([]gin.H, 0)
	for guestID, a := range aggs {
		segment := "new"
		if a.bookings > 1 {
			segment = "returning"
			returningCount++
			topRepeat = append(topRepeat, gin.H{
				"guest_id":      guestID,
				"customer_name": guestByID[guestID].Name,
				"bookings":      a.bookings,
				"spend":         math.Round(a.spend*100) / 100,
			})
		} else {
			newCount++
		}
		totalSpend += a.spend
		table = append(table, gin.H{
			"guest_id":      guestID,
			"customer_name": guestByID[guestID].Name,
			"bookings":      a.bookings,
			"total_spend":   math.Round(a.spend*100) / 100,
			"avg_spend":     math.Round((a.spend/float64(a.bookings))*100) / 100,
			"segment":       segment,
			"last_visit":    a.lastStay.Format("2006-01-02"),
		})
	}

	sort.Slice(table, func(i, j int) bool {
		return table[i]["total_spend"].(float64) > table[j]["total_spend"].(float64)
	})
	sort.Slice(topRepeat, func(i, j int) bool {
		return topRepeat[i]["bookings"].(int) > topRepeat[j]["bookings"].(int)
	})
	if len(topRepeat) > 10 {
		topRepeat = topRepeat[:10]
	}

	avgSpend := 0.0
	if len(aggs) > 0 {
		avgSpend = totalSpend / float64(len(aggs))
	}

	c.JSON(http.StatusOK, gin.H{
		"report_type": "guest-history",
		"from_date":   dr.fromDate,
		"to_date":     dr.toDate,
		"summary": gin.H{
			"customers":               len(aggs),
			"average_spend_per_guest": math.Round(avgSpend*100) / 100,
			"new_guests":              newCount,
			"returning_guests":        returningCount,
		},
		"charts": gin.H{
			"segments": []gin.H{
				{"label": "New", "value": newCount},
				{"label": "Returning", "value": returningCount},
			},
		},
		"top_repeat_guests": topRepeat,
		"table":             table,
	})
}

func ReportHousekeeping(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	dr, ok := parseReportDateRange(c)
	if !ok {
		return
	}
	logReportGeneration(c, hotelID, "housekeeping", dr)

	fromUnix := dr.from.Unix()
	toUnix := dr.to.Add(24*time.Hour - time.Second).Unix()

	var rows []models.HousekeepingHistory
	if err := config.DB.
		Where("hotel_id = ?", hotelID).
		Where("created_at BETWEEN ? AND ?", fromUnix, toUnix).
		Order("created_at asc").
		Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load housekeeping history"})
		return
	}

	totalDuration := int64(0)
	daily := map[string]int{}
	for d := dr.from; !d.After(dr.to); d = d.Add(24 * time.Hour) {
		daily[dateKey(d)] = 0
	}
	staffTasks := map[string]int{}
	for _, r := range rows {
		totalDuration += r.DurationMin
		d := time.Unix(r.CreatedAt, 0)
		k := dateKey(d)
		if _, ok := daily[k]; ok {
			daily[k]++
		}
		name := strings.TrimSpace(r.AssignedTo)
		if name == "" {
			name = "Unassigned"
		}
		staffTasks[name]++
	}

	avgDuration := 0.0
	if len(rows) > 0 {
		avgDuration = float64(totalDuration) / float64(len(rows))
	}

	dailyTrend := make([]gin.H, 0, len(daily))
	for d := dr.from; !d.After(dr.to); d = d.Add(24 * time.Hour) {
		k := dateKey(d)
		dailyTrend = append(dailyTrend, gin.H{"date": k, "count": daily[k]})
	}

	staffTable := make([]gin.H, 0, len(staffTasks))
	for name, cnt := range staffTasks {
		staffTable = append(staffTable, gin.H{"staff": name, "tasks_completed": cnt})
	}
	sort.Slice(staffTable, func(i, j int) bool {
		return staffTable[i]["tasks_completed"].(int) > staffTable[j]["tasks_completed"].(int)
	})

	c.JSON(http.StatusOK, gin.H{
		"report_type": "housekeeping",
		"from_date":   dr.fromDate,
		"to_date":     dr.toDate,
		"summary": gin.H{
			"rooms_cleaned":         len(rows),
			"average_cleaning_time": math.Round(avgDuration*100) / 100,
		},
		"charts": gin.H{"daily_trend": dailyTrend},
		"table":  staffTable,
	})
}

func ReportStaffPerformance(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	dr, ok := parseReportDateRange(c)
	if !ok {
		return
	}
	logReportGeneration(c, hotelID, "staff-performance", dr)

	var staff []models.Staff
	if err := config.DB.Where("hotel_id = ?", hotelID).Find(&staff).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load staff"})
		return
	}

	fromUnix := dr.from.Unix()
	toUnix := dr.to.Add(24*time.Hour - time.Second).Unix()

	var shifts []models.StaffShift
	_ = config.DB.
		Where("hotel_id = ?", hotelID).
		Where("created_at BETWEEN ? AND ?", fromUnix, toUnix).
		Find(&shifts).Error

	var hkRows []models.HousekeepingHistory
	_ = config.DB.
		Where("hotel_id = ?", hotelID).
		Where("created_at BETWEEN ? AND ?", fromUnix, toUnix).
		Find(&hkRows).Error

	tasksByName := map[string]int{}
	for _, row := range hkRows {
		name := strings.TrimSpace(row.AssignedTo)
		if name == "" {
			continue
		}
		tasksByName[name]++
	}

	shiftsByStaff := map[uint]int{}
	closedByStaff := map[uint]int{}
	for _, s := range shifts {
		shiftsByStaff[s.StaffID]++
		if normalizeStatus(s.Status) == "closed" {
			closedByStaff[s.StaffID]++
		}
	}

	totalDays := dateRangeDays(dr.from, dr.to)
	table := make([]gin.H, 0, len(staff))
	for _, s := range staff {
		attendancePct := 0.0
		if totalDays > 0 {
			attendancePct = (float64(shiftsByStaff[s.ID]) / float64(totalDays)) * 100
		}
		tasks := tasksByName[s.Name]
		table = append(table, gin.H{
			"staff_id":        s.ID,
			"name":            s.Name,
			"role":            s.Role,
			"attendance_pct":  math.Round(attendancePct*100) / 100,
			"shifts_logged":   shiftsByStaff[s.ID],
			"shifts_closed":   closedByStaff[s.ID],
			"tasks_completed": tasks,
		})
	}

	sort.Slice(table, func(i, j int) bool {
		li := table[i]["attendance_pct"].(float64) + float64(table[i]["tasks_completed"].(int))*2
		lj := table[j]["attendance_pct"].(float64) + float64(table[j]["tasks_completed"].(int))*2
		return li > lj
	})

	c.JSON(http.StatusOK, gin.H{
		"report_type": "staff-performance",
		"from_date":   dr.fromDate,
		"to_date":     dr.toDate,
		"summary": gin.H{
			"staff_count":  len(staff),
			"total_tasks":  len(hkRows),
			"total_shifts": len(shifts),
		},
		"table": table,
	})
}

func reportDateRangeDebug(dr reportDateRange) string {
	return fmt.Sprintf("%s to %s", dr.fromDate, dr.toDate)
}

func logReportGeneration(c *gin.Context, hotelID uint, reportName string, dr reportDateRange) {
	adminID := c.GetUint("admin_id")
	utils.LogActivity(hotelID, "Reports", adminID, fmt.Sprintf("Generated %s report (%s)", reportName, reportDateRangeDebug(dr)))
}
