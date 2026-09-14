package controllers

import (
	"hms/config"
	"hms/models"
	"net/http"
	"time"
	"fmt"

	"github.com/gin-gonic/gin"
)

// RatePlanRequest is the payload for creating/updating a RatePlan
type RatePlanRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	MealPlan    string `json:"meal_plan"`
	IsActive    *bool  `json:"is_active"`
}

// GetRatePlans returns all rate plans for the authenticated hotel
func GetRatePlans(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	if hotelID == 0 {
		c.JSON(http.StatusOK, []models.RatePlan{})
		return
	}

	cacheKey := fmt.Sprintf("rate_plans:hotel:%d", hotelID)
	var plans []models.RatePlan

	if config.CacheGet(c.Request.Context(), cacheKey, &plans) {
		c.JSON(http.StatusOK, plans)
		return
	}

	if err := config.DB.Where("hotel_id = ?", hotelID).Order("id asc").Find(&plans).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rate plans"})
		return
	}

	config.CacheSet(c.Request.Context(), cacheKey, plans, 5*time.Minute)
	c.JSON(http.StatusOK, plans)
}

// CreateRatePlan creates a new rate plan for the hotel
func CreateRatePlan(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	if hotelID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Please select a hotel first"})
		return
	}

	var req RatePlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	plan := models.RatePlan{
		HotelID:     hotelID,
		Name:        req.Name,
		Description: req.Description,
		MealPlan:    req.MealPlan,
		IsActive:    isActive,
	}

	if err := config.DB.Create(&plan).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create rate plan"})
		return
	}

	config.CacheDelete(c.Request.Context(), fmt.Sprintf("rate_plans:hotel:%d", hotelID))
	c.JSON(http.StatusCreated, plan)
}

// UpdateRatePlan updates an existing rate plan
func UpdateRatePlan(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	if hotelID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Please select a hotel first"})
		return
	}

	planID := c.Param("id")

	var plan models.RatePlan
	if err := config.DB.Where("id = ? AND hotel_id = ?", planID, hotelID).First(&plan).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rate plan not found"})
		return
	}

	var req RatePlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	plan.Name = req.Name
	plan.Description = req.Description
	plan.MealPlan = req.MealPlan
	if req.IsActive != nil {
		plan.IsActive = *req.IsActive
	}

	if err := config.DB.Save(&plan).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update rate plan"})
		return
	}

	config.CacheDelete(c.Request.Context(), fmt.Sprintf("rate_plans:hotel:%d", hotelID))
	c.JSON(http.StatusOK, plan)
}

// DeleteRatePlan deletes a rate plan
func DeleteRatePlan(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	if hotelID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Please select a hotel first"})
		return
	}

	planID := c.Param("id")

	var plan models.RatePlan
	if err := config.DB.Where("id = ? AND hotel_id = ?", planID, hotelID).First(&plan).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rate plan not found"})
		return
	}

	// We use hard delete here since it's just a config table without soft-delete fields
	if err := config.DB.Delete(&plan).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete rate plan"})
		return
	}

	config.CacheDelete(c.Request.Context(), fmt.Sprintf("rate_plans:hotel:%d", hotelID))
	c.JSON(http.StatusOK, gin.H{"message": "Rate plan deleted successfully"})
}
