package controllers

import (
	"net/http"
	"strconv"
	"strings"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

func parseLimitParam(c *gin.Context, defaultLimit int) int {
	limit := defaultLimit
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			if parsed > 500 {
				parsed = 500
			}
			limit = parsed
		}
	}
	return limit
}

func jsonCrudList(c *gin.Context, items interface{}, total int64) {
	c.JSON(http.StatusOK, gin.H{
		"status": true,
		"data": gin.H{
			"items": items,
			"total": total,
		},
		"items": items,
		"total": total,
	})
}

func ListExpenses(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	limit := parseLimitParam(c, 100)
	var rows []models.HmsExpense
	q := config.DB.Where("deleted_at IS NULL")
	if hotelID > 0 {
		q = q.Where("hotel_id = ?", hotelID)
	}
	var total int64
	_ = q.Model(&models.HmsExpense{}).Count(&total).Error
	if err := q.Order("id desc").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch expenses"})
		return
	}
	jsonCrudList(c, rows, total)
}

func AddExpense(c *gin.Context) {
	var row models.HmsExpense
	if err := c.ShouldBindJSON(&row); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row.HotelID = c.GetUint("active_hotel_id")
	if strings.TrimSpace(row.Title) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return
	}
	if err := config.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create expense"})
		return
	}
	utils.LogActivity(c.GetUint("active_hotel_id"), "Expense", c.GetUint("admin_id"), "Expense created: "+row.Title)
	c.JSON(http.StatusCreated, row)
}

func UpdateExpense(c *gin.Context) {
	var row models.HmsExpense
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Expense not found"})
		return
	}
	var payload models.HmsExpense
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if payload.Title != "" {
		updates["title"] = payload.Title
	}
	if payload.Category != "" {
		updates["category"] = payload.Category
	}
	if payload.Amount != "" {
		updates["amount"] = payload.Amount
	}
	if payload.ExpenseDate != "" {
		updates["expense_date"] = payload.ExpenseDate
	}
	if payload.Notes != "" {
		updates["notes"] = payload.Notes
	}
	updates["status"] = payload.Status
	if err := config.DB.Model(&row).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update expense"})
		return
	}
	utils.LogActivity(c.GetUint("active_hotel_id"), "Expense", c.GetUint("admin_id"), "Expense updated: "+row.Title)
	c.JSON(http.StatusOK, row)
}

func DeleteExpense(c *gin.Context) {
	var row models.HmsExpense
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Expense not found"})
		return
	}
	if err := config.DB.Delete(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete expense"})
		return
	}
	utils.LogActivity(c.GetUint("active_hotel_id"), "Expense", c.GetUint("admin_id"), "Expense deleted: "+row.Title)
	c.JSON(http.StatusOK, gin.H{"message": "Expense deleted"})
}

func ListTasks(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	limit := parseLimitParam(c, 100)
	var rows []models.Task
	q := config.DB.Where("hotel_id = ?", hotelID)
	var total int64
	_ = q.Model(&models.Task{}).Count(&total).Error
	if err := q.Order("id desc").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tasks"})
		return
	}
	jsonCrudList(c, rows, total)
}

func AddTask(c *gin.Context) {
	var row models.Task
	if err := c.ShouldBindJSON(&row); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row.HotelID = c.GetUint("active_hotel_id")
	if strings.TrimSpace(row.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if row.Status == "" {
		row.Status = "running"
	}

	if strings.TrimSpace(row.AssignedTo) != "" {
		var staff models.Staff
		if err := config.DB.Where("hotel_id = ? AND TRIM(name) = ? AND deleted_at IS NULL", row.HotelID, strings.TrimSpace(row.AssignedTo)).First(&staff).Error; err == nil {
			row.StaffID = &staff.ID
		}
	}
	if err := config.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create task"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "Task", c.GetUint("admin_id"), "Created", row.Name, "Task created")
	c.JSON(http.StatusCreated, row)
}

func UpdateTask(c *gin.Context) {
	var row models.Task
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}
	var payload models.Task
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if payload.Name != "" {
		updates["name"] = payload.Name
	}
	if payload.DueDate != "" {
		updates["due_date"] = payload.DueDate
	}
	if payload.Description != "" {
		updates["description"] = payload.Description
	}
	if payload.AssignedTo != "" {
		updates["assigned_to"] = payload.AssignedTo
		var staff models.Staff
		if err := config.DB.Where("hotel_id = ? AND TRIM(name) = ? AND deleted_at IS NULL", row.HotelID, strings.TrimSpace(payload.AssignedTo)).First(&staff).Error; err == nil {
			updates["staff_id"] = staff.ID
		} else {
			updates["staff_id"] = nil
		}
	}
	if payload.Status != "" {
		updates["status"] = payload.Status
	}
	if err := config.DB.Model(&row).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update task"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "Task", c.GetUint("admin_id"), "Updated", row.Name, "Task updated")
	c.JSON(http.StatusOK, row)
}

func DeleteTask(c *gin.Context) {
	var row models.Task
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}
	if err := config.DB.Delete(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete task"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "Task", c.GetUint("admin_id"), "Deleted", row.Name, "Task deleted")
	c.JSON(http.StatusOK, gin.H{"message": "Task deleted"})
}

func ListTaxRates(c *gin.Context) {
	limit := parseLimitParam(c, 100)
	var rows []models.TaxRate
	hotelID := c.GetUint("active_hotel_id")
	q := config.DB.Where("hotel_id = ?", hotelID)
	var total int64
	_ = q.Model(&models.TaxRate{}).Count(&total).Error
	if err := q.Order("id desc").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tax rates"})
		return
	}
	jsonCrudList(c, rows, total)
}

func AddTaxRate(c *gin.Context) {
	var row models.TaxRate
	if err := c.ShouldBindJSON(&row); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row.HotelID = c.GetUint("active_hotel_id")
	if err := config.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create tax rate"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "TaxRate", c.GetUint("admin_id"), "Created", row.Account, "Tax rate created")
	c.JSON(http.StatusCreated, row)
}

func UpdateTaxRate(c *gin.Context) {
	var row models.TaxRate
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tax rate not found"})
		return
	}
	var payload models.TaxRate
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if payload.Date != "" {
		updates["date"] = payload.Date
	}
	if payload.Account != "" {
		updates["account"] = payload.Account
	}
	if payload.Type != "" {
		updates["type"] = payload.Type
	}
	if payload.Category != "" {
		updates["category"] = payload.Category
	}
	if payload.Amount != 0 {
		updates["amount"] = payload.Amount
	}
	if payload.Description != "" {
		updates["description"] = payload.Description
	}
	if payload.Credit != 0 {
		updates["credit"] = payload.Credit
	}
	if payload.Balance != 0 {
		updates["balance"] = payload.Balance
	}
	if err := config.DB.Model(&row).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update tax rate"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "TaxRate", c.GetUint("admin_id"), "Updated", row.Account, "Tax rate updated")
	c.JSON(http.StatusOK, row)
}

func DeleteTaxRate(c *gin.Context) {
	var row models.TaxRate
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tax rate not found"})
		return
	}
	if err := config.DB.Delete(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete tax rate"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "TaxRate", c.GetUint("admin_id"), "Deleted", row.Account, "Tax rate deleted")
	c.JSON(http.StatusOK, gin.H{"message": "Tax rate deleted"})
}

func ListRecurring(c *gin.Context) {
	limit := parseLimitParam(c, 100)
	hotelID := c.GetUint("active_hotel_id")
	var rows []models.Recurring
	q := config.DB.Where("hotel_id = ?", hotelID)
	var total int64
	_ = q.Model(&models.Recurring{}).Count(&total).Error
	if err := q.Order("id desc").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch recurring invoices"})
		return
	}
	jsonCrudList(c, rows, total)
}

func AddRecurring(c *gin.Context) {
	var row models.Recurring
	if err := c.ShouldBindJSON(&row); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row.HotelID = c.GetUint("active_hotel_id")
	row.IsRecurring = true
	if row.Status == "" {
		row.Status = "draft"
	}
	if err := config.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create recurring invoice"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "Recurring", c.GetUint("admin_id"), "Created", row.InvoiceNo, "Recurring invoice created")
	c.JSON(http.StatusCreated, row)
}

func UpdateRecurring(c *gin.Context) {
	var row models.Recurring
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recurring invoice not found"})
		return
	}
	var payload models.Recurring
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if payload.CustomerID != 0 {
		updates["customer_id"] = payload.CustomerID
	}
	if payload.Amount != 0 {
		updates["amount"] = payload.Amount
	}
	if payload.InvoiceNo != "" {
		updates["invoice_no"] = payload.InvoiceNo
	}
	if payload.InvoiceDate != "" {
		updates["invoice_date"] = payload.InvoiceDate
	}
	if payload.DueDate != "" {
		updates["due_date"] = payload.DueDate
	}
	if payload.Status != "" {
		updates["status"] = payload.Status
	}
	if err := config.DB.Model(&row).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update recurring invoice"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "Recurring", c.GetUint("admin_id"), "Updated", row.InvoiceNo, "Recurring invoice updated")
	c.JSON(http.StatusOK, row)
}

func DeleteRecurring(c *gin.Context) {
	var row models.Recurring
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recurring invoice not found"})
		return
	}
	if err := config.DB.Delete(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete recurring invoice"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "Recurring", c.GetUint("admin_id"), "Deleted", row.InvoiceNo, "Recurring invoice deleted")
	c.JSON(http.StatusOK, gin.H{"message": "Recurring invoice deleted"})
}

func ListQuotes(c *gin.Context) {
	limit := parseLimitParam(c, 100)
	hotelID := c.GetUint("active_hotel_id")
	var rows []models.Quote
	q := config.DB.Where("hotel_id = ?", hotelID)
	var total int64
	_ = q.Model(&models.Quote{}).Count(&total).Error
	if err := q.Order("id desc").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch quotes"})
		return
	}
	jsonCrudList(c, rows, total)
}

func AddQuote(c *gin.Context) {
	var row models.Quote
	if err := c.ShouldBindJSON(&row); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row.HotelID = c.GetUint("active_hotel_id")
	if row.Stage == "" {
		row.Stage = "draft"
	}
	if err := config.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create quote"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "Quote", c.GetUint("admin_id"), "Created", row.SubjectName, "Quote created")
	c.JSON(http.StatusCreated, row)
}

func UpdateQuote(c *gin.Context) {
	var row models.Quote
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quote not found"})
		return
	}
	var payload models.Quote
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if payload.Account != "" {
		updates["account"] = payload.Account
	}
	if payload.SubjectName != "" {
		updates["subject_name"] = payload.SubjectName
	}
	if payload.Amount != 0 {
		updates["amount"] = payload.Amount
	}
	if payload.EntryDate != "" {
		updates["entry_date"] = payload.EntryDate
	}
	if payload.ExpiredDate != "" {
		updates["expired_date"] = payload.ExpiredDate
	}
	if payload.Stage != "" {
		updates["stage"] = payload.Stage
	}
	if err := config.DB.Model(&row).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update quote"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "Quote", c.GetUint("admin_id"), "Updated", row.SubjectName, "Quote updated")
	c.JSON(http.StatusOK, row)
}

func DeleteQuote(c *gin.Context) {
	var row models.Quote
	if err := config.DB.Where("hotel_id = ?", c.GetUint("active_hotel_id")).First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quote not found"})
		return
	}
	if err := config.DB.Delete(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete quote"})
		return
	}
	utils.LogActivityWithContext(row.HotelID, "Quote", c.GetUint("admin_id"), "Deleted", row.SubjectName, "Quote deleted")
	c.JSON(http.StatusOK, gin.H{"message": "Quote deleted"})
}
