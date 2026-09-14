package controllers

import (
	"hms/config"
	"hms/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// POST /staff/:id/increment
func AddStaffIncrement(c *gin.Context) {
	staffID, _ := strconv.Atoi(c.Param("id"))
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	var req struct {
		Amount float64 `json:"amount"`
		Reason string  `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Amount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	var staff models.Staff
	if err := config.DB.Where("id = ? AND hotel_id = ?", staffID, hotelID).First(&staff).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Staff not found"})
		return
	}

	newSalary := staff.GrossSalary + req.Amount
	increment := models.StaffIncrement{
		StaffID:   uint(staffID),
		HotelID:   hotelID,
		Amount:    req.Amount,
		NewSalary: newSalary,
		Reason:    req.Reason,
		AdminID:   adminID,
	}
	if err := config.DB.Create(&increment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save increment"})
		return
	}
	// Update staff salary
	staff.GrossSalary = newSalary
	config.DB.Save(&staff)
	c.JSON(http.StatusOK, increment)
}

// GET /staff/:id/increments
func ListStaffIncrements(c *gin.Context) {
	staffID, _ := strconv.Atoi(c.Param("id"))
	hotelID := c.GetUint("active_hotel_id")
	var increments []models.StaffIncrement
	if err := config.DB.Where("staff_id = ? AND hotel_id = ?", staffID, hotelID).Order("created_at desc").Find(&increments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch increments"})
		return
	}
	c.JSON(http.StatusOK, increments)
}
