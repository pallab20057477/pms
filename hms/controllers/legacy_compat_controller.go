package controllers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

type legacyUpdateInvoicePayload struct {
	Amount  *float64 `json:"amount"`
	DueDate *string  `json:"due_date"`
	Status  *string  `json:"status"`
}

type legacyListResponse struct {
	Status bool                   `json:"status"`
	Data   map[string]interface{} `json:"data"`
	Items  interface{}            `json:"items"`
	Total  int64                  `json:"total"`
}

type legacyCustomerRow struct {
	ID           uint   `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Name         string `json:"name"`
	CustomerName string `json:"customer_name"`
	Phone        string `json:"phone"`
	Email        string `json:"email"`
	Address      string `json:"address"`
	Status       string `json:"status"`
}

type legacyInvoiceRow struct {
	ID         uint    `json:"id"`
	InvoiceNo  string  `json:"invoice_no"`
	BookingID  uint    `json:"booking_id"`
	CustomerID uint    `json:"customer_id"`
	Amount     float64 `json:"amount"`
	CreatedAt  int64   `json:"created_at"`
	DueDate    string  `json:"due_date"`
	Type       string  `json:"type"`
	Status     string  `json:"status"`
}

type legacyPaymentRow struct {
	ID           uint    `json:"id"`
	InvoiceID    uint    `json:"invoice_id"`
	BookingID    uint    `json:"booking_id"`
	Amount       float64 `json:"amount"`
	Method       string  `json:"method"`
	Reference    string  `json:"reference"`
	PaidOn       string  `json:"paid_on"`
	CreatedAt    int64   `json:"created_at"`
	Status       string  `json:"status"`
	From         string  `json:"from"`
	To           string  `json:"to"`
	Description  string  `json:"description"`
	BookingCode  string  `json:"booking_code"`
	CustomerName string  `json:"customer_name"`
	InvoiceNo    string  `json:"invoice_no"`
}

type legacyUpdatePaymentPayload struct {
	InvoiceID *uint    `json:"invoice_id"`
	Amount    *float64 `json:"amount"`
	Method    *string  `json:"method"`
	Reference *string  `json:"reference"`
	PaidOn    *string  `json:"paid_on"`
	Status    *string  `json:"status"`
}

func parseLimit(c *gin.Context, defaultLimit int) int {
	limit := defaultLimit
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 500 {
				n = 500
			}
			limit = n
		}
	}
	return limit
}

func ListPayments(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	limit := parseLimit(c, 100)

	var rows []models.Payment
	query := config.DB.Model(&models.Payment{}).
		Joins("JOIN bookings b ON b.id = payments.booking_id").
		Where("b.hotel_id = ?", hotelID)

	var total int64
	_ = query.Count(&total).Error

	if err := query.Order("payments.id desc").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payments"})
		return
	}

	bookingIDs := make([]uint, 0, len(rows))
	for _, p := range rows {
		bookingIDs = append(bookingIDs, p.BookingID)
	}

	type bookingInfo struct {
		ID          uint
		BookingCode string
		GuestName   string
	}
	bookingMap := map[uint]bookingInfo{}
	
	invoiceByBooking := map[uint]models.Invoice{}
	if len(bookingIDs) > 0 {
		var invoices []models.Invoice
		_ = config.DB.Where("booking_id IN ?", bookingIDs).Find(&invoices).Error
		for _, inv := range invoices {
			invoiceByBooking[inv.BookingID] = inv
		}
		
		var infos []bookingInfo
		_ = config.DB.Table("bookings").
			Select("bookings.id, bookings.booking_code, guests.name as guest_name").
			Joins("JOIN guests ON guests.id = bookings.guest_id").
			Where("bookings.id IN ?", bookingIDs).
			Scan(&infos).Error
			
		for _, info := range infos {
			bookingMap[info.ID] = info
		}
	}

	legacyRows := make([]legacyPaymentRow, 0, len(rows))
	for _, p := range rows {
		inv := invoiceByBooking[p.BookingID]
		b := bookingMap[p.BookingID]
		
		paidOn := ""
		if p.PaidOn != nil {
			paidOn = p.PaidOn.Format("2006-01-02")
		}
		createdAt := p.CreatedAt.Unix()
		if createdAt > 0 {
			createdAt = createdAt * 1000
		}

		status := p.Status
		if status == "" {
			status = "success"
		}

		legacyRows = append(legacyRows, legacyPaymentRow{
			ID:           p.ID,
			InvoiceID:    inv.ID,
			BookingID:    p.BookingID,
			Amount:       p.Amount,
			Method:       p.Method,
			Reference:    p.Reference,
			PaidOn:       paidOn,
			CreatedAt:    createdAt,
			Status:       status,
			From:         p.Method,
			To:           "Hotel",
			Description:  p.Reference,
			BookingCode:  b.BookingCode,
			CustomerName: b.GuestName,
			InvoiceNo:    inv.InvoiceNo,
		})
	}

	c.JSON(http.StatusOK, legacyListResponse{
		Status: true,
		Data:   map[string]interface{}{"items": legacyRows, "total": total},
		Items:  legacyRows,
		Total:  total,
	})
}

func ListInvoices(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	limit := parseLimit(c, 100)

	var rows []models.Invoice
	query := config.DB.Model(&models.Invoice{}).Where("hotel_id = ?", hotelID)

	var total int64
	_ = query.Count(&total).Error

	if err := query.Order("id desc").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch invoices"})
		return
	}

	bookingIDs := make([]uint, 0, len(rows))
	for _, inv := range rows {
		bookingIDs = append(bookingIDs, inv.BookingID)
	}

	bookingsMap := map[uint]models.Booking{}
	if len(bookingIDs) > 0 {
		var bookings []models.Booking
		_ = config.DB.Where("id IN ?", bookingIDs).Find(&bookings).Error
		for _, b := range bookings {
			bookingsMap[b.ID] = b
		}
	}

	type paySumRow struct {
		BookingID uint
		Sum       float64
	}
	paymentsMap := map[uint]float64{}
	if len(bookingIDs) > 0 {
		var sums []paySumRow
		_ = config.DB.Model(&models.Payment{}).
			Select("booking_id, COALESCE(SUM(amount),0) as sum").
			Where("booking_id IN ?", bookingIDs).
			Group("booking_id").
			Scan(&sums).Error
		for _, s := range sums {
			paymentsMap[s.BookingID] = s.Sum
		}
	}

	legacyRows := make([]legacyInvoiceRow, 0, len(rows))
	for _, inv := range rows {
		b := bookingsMap[inv.BookingID]
		createdAt := inv.CreatedAt
		if createdAt > 0 && createdAt < 1_000_000_000_000 {
			createdAt = createdAt * 1000
		}
		dueDate := strings.TrimSpace(inv.InvoiceDate)
		if dueDate == "" && !b.CheckOutDate.IsZero() {
			dueDate = b.CheckOutDate.Format("2006-01-02")
		}
		balanceDue := inv.TotalAmount - paymentsMap[inv.BookingID]
		status := strings.TrimSpace(strings.ToLower(inv.Status))
		if status == "" {
			status = "unpaid"
			if balanceDue <= 0.01 {
				status = "paid"
			}
		}

		legacyRows = append(legacyRows, legacyInvoiceRow{
			ID:         inv.ID,
			InvoiceNo:  inv.InvoiceNo,
			BookingID:  inv.BookingID,
			CustomerID: b.GuestID,
			Amount:     inv.TotalAmount,
			CreatedAt:  createdAt,
			DueDate:    dueDate,
			Type:       "Onetime",
			Status:     status,
		})
	}

	c.JSON(http.StatusOK, legacyListResponse{
		Status: true,
		Data:   map[string]interface{}{"items": legacyRows, "total": total},
		Items:  legacyRows,
		Total:  total,
	})
}

func ListCustomers(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	limit := parseLimit(c, 100)

	var guests []models.Guest
	query := config.DB.Model(&models.Guest{}).
		Where("hotel_id = ? AND deleted_at IS NULL", hotelID)

	var total int64
	_ = query.Count(&total).Error

	if err := query.Order("id desc").Limit(limit).Find(&guests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch customers"})
		return
	}

	rows := make([]legacyCustomerRow, 0, len(guests))
	for _, g := range guests {
		rows = append(rows, legacyCustomerRow{
			ID:           g.ID,
			FirstName:    g.Name,
			LastName:     "",
			Name:         g.Name,
			CustomerName: g.Name,
			Phone:        g.Phone,
			Email:        g.Email,
			Address:      g.Address,
			Status:       "active",
		})
	}

	c.JSON(http.StatusOK, legacyListResponse{
		Status: true,
		Data:   map[string]interface{}{"items": rows, "total": total},
		Items:  rows,
		Total:  total,
	})
}

// UpdatePaymentLegacy supports legacy payments edit flow.
func UpdatePaymentLegacy(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payment id"})
		return
	}

	var p models.Payment
	if err := config.DB.Model(&models.Payment{}).
		Joins("JOIN bookings b ON b.id = payments.booking_id").
		Where("payments.id = ? AND b.hotel_id = ?", id, hotelID).
		Select("payments.*").
		First(&p).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment not found"})
		return
	}
	if p.PaidOn != nil {
		if err := utils.EnsureBusinessDateOpen(hotelID, *p.PaidOn); err != nil {
			c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
			return
		}
	} else if err := utils.EnsureTodayOpen(hotelID); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}

	var payload legacyUpdatePaymentPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	updates := map[string]interface{}{}
	if payload.Amount != nil {
		if *payload.Amount < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Amount must be non-negative"})
			return
		}
		updates["amount"] = *payload.Amount
	}
	if payload.Method != nil {
		updates["method"] = *payload.Method
	}
	if payload.Reference != nil {
		updates["reference"] = *payload.Reference
	}
	if payload.InvoiceID != nil {
		var inv models.Invoice
		if err := config.DB.Where("id = ? AND hotel_id = ?", *payload.InvoiceID, hotelID).First(&inv).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invoice_id"})
			return
		}
		updates["booking_id"] = inv.BookingID
	}
	if payload.PaidOn != nil {
		if *payload.PaidOn == "" {
			updates["paid_on"] = nil
		} else {
			t, err := time.Parse("2006-01-02", *payload.PaidOn)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid paid_on format, expected YYYY-MM-DD"})
				return
			}
			if err := utils.EnsureBusinessDateOpen(hotelID, t); err != nil {
				c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
				return
			}
			updates["paid_on"] = t
		}
	}
	if payload.Status != nil {
		status := strings.TrimSpace(strings.ToLower(*payload.Status))
		if status == "success" || status == "pending" || status == "failed" {
			updates["status"] = status
		}
	}

	if len(updates) > 0 {
		if err := config.DB.Model(&p).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update payment"})
			return
		}
	}

	if err := config.DB.First(&p, p.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated payment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": true, "data": p})
}

// DeletePaymentLegacy supports legacy payments delete flow.
func DeletePaymentLegacy(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payment id"})
		return
	}

	var p models.Payment
	if err := config.DB.Model(&models.Payment{}).
		Joins("JOIN bookings b ON b.id = payments.booking_id").
		Where("payments.id = ? AND b.hotel_id = ?", id, hotelID).
		Select("payments.*").
		First(&p).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment not found"})
		return
	}
	if p.PaidOn != nil {
		if err := utils.EnsureBusinessDateOpen(hotelID, *p.PaidOn); err != nil {
			c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
			return
		}
	} else if err := utils.EnsureTodayOpen(hotelID); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}

	if err := config.DB.Delete(&p).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete payment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": true, "message": "Payment deleted"})
}

// UpdateInvoiceLegacy supports legacy invoice edit flows that update amount/status/due date.
func UpdateInvoiceLegacy(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invoice id"})
		return
	}

	var inv models.Invoice
	if err := config.DB.Where("id = ? AND hotel_id = ?", id, hotelID).First(&inv).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice not found"})
		return
	}
	if err := utils.EnsureBusinessDateOpenString(hotelID, inv.InvoiceDate); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}

	var payload legacyUpdateInvoicePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	updates := map[string]interface{}{}
	if payload.Amount != nil {
		if *payload.Amount < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Amount must be non-negative"})
			return
		}
		updates["total_amount"] = *payload.Amount
	}

	if payload.DueDate != nil {
		if err := utils.EnsureBusinessDateOpenString(hotelID, *payload.DueDate); err != nil {
			c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
			return
		}
		updates["invoice_date"] = *payload.DueDate
	}

	if payload.Status != nil {
		status := strings.TrimSpace(strings.ToLower(*payload.Status))
		if status != "" {
			if status != "paid" && status != "unpaid" && status != "active" && status != "inactive" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
				return
			}
			updates["status"] = status
		}
	}

	if len(updates) > 0 {
		if err := config.DB.Model(&inv).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update invoice"})
			return
		}
	}

	if err := config.DB.Where("id = ?", inv.ID).First(&inv).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated invoice"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": true, "data": inv})
}

// DeleteInvoiceLegacy supports legacy invoice delete flows.
func DeleteInvoiceLegacy(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invoice id"})
		return
	}

	var inv models.Invoice
	if err := config.DB.Where("id = ? AND hotel_id = ?", id, hotelID).First(&inv).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice not found"})
		return
	}
	if err := utils.EnsureBusinessDateOpenString(hotelID, inv.InvoiceDate); err != nil {
		c.JSON(http.StatusLocked, gin.H{"error": err.Error()})
		return
	}

	if err := config.DB.Delete(&inv).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete invoice"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": true, "message": "Invoice deleted"})
}
