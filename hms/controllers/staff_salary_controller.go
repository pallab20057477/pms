package controllers

import (
	"fmt"
	"hms/config"
	"hms/models"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// List all salary records for a staff member
func ListStaffSalaries(c *gin.Context) {
	staffID := c.Param("id")
	hotelID := c.GetUint("active_hotel_id")
	var salaries []models.StaffSalary
	if err := config.DB.Where("staff_id = ? AND hotel_id = ?", staffID, hotelID).Order("month desc").Find(&salaries).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load salaries"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": salaries})
}

// Create a new salary record
func CreateStaffSalary(c *gin.Context) {
	var input struct {
		Month  string  `json:"month"`
		Amount float64 `json:"amount"`
		Status string  `json:"status"`
		PaidOn *string `json:"paid_on"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: " + err.Error()})
		return
	}
	staffID := c.Param("id")
	hotelID := c.GetUint("active_hotel_id")

	salary := models.StaffSalary{
		StaffID:   parseUint(staffID),
		HotelID:   hotelID,
		Month:     input.Month,
		Amount:    input.Amount,
		Status:    input.Status,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Parse paid_on if provided
	if input.PaidOn != nil && *input.PaidOn != "" {
		t, err := time.Parse(time.RFC3339, *input.PaidOn)
		if err != nil {
			// try date-only format
			t, err = time.Parse("2006-01-02", *input.PaidOn)
		}
		if err == nil {
			salary.PaidOn = &t
		}
	}

	// If amount is zero, fetch staff's gross_salary
	if salary.Amount == 0 {
		var staff models.Staff
		if err := config.DB.Where("id = ? AND hotel_id = ?", staffID, hotelID).First(&staff).Error; err == nil {
			salary.Amount = staff.GrossSalary
		}
	}

	if salary.Status == "" {
		salary.Status = "unpaid"
	}

	if err := config.DB.Create(&salary).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create salary record"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": salary})
}

// Update salary status (mark as paid/unpaid)
func UpdateStaffSalaryStatus(c *gin.Context) {
	id := c.Param("id")
	hotelID := c.GetUint("active_hotel_id")
	var salary models.StaffSalary
	if err := config.DB.Where("id = ? AND hotel_id = ?", id, hotelID).First(&salary).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Salary record not found"})
		return
	}
	var input struct {
		Status string  `json:"status"`
		PaidOn *string `json:"paid_on"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}
	salary.Status = input.Status
	if input.PaidOn != nil && *input.PaidOn != "" {
		t, err := time.Parse(time.RFC3339, *input.PaidOn)
		if err != nil {
			t, err = time.Parse("2006-01-02", *input.PaidOn)
		}
		if err == nil {
			salary.PaidOn = &t
		}
	} else {
		salary.PaidOn = nil
	}
	salary.UpdatedAt = time.Now()
	if err := config.DB.Save(&salary).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update salary status"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": salary})
}

// parseUint is a helper to parse string to uint
func parseUint(s string) uint {
	var v uint
	_, _ = fmt.Sscan(s, &v)
	return v
}
