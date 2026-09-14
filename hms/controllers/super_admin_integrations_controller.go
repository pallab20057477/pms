package controllers

import (
	"net/http"

	"hms/config"
	"hms/models"

	"github.com/gin-gonic/gin"
)

// GetPartners returns all global partner integrations
func GetPartners(c *gin.Context) {
	var partners []models.PartnerIntegration
	if err := config.DB.Find(&partners).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch partners"})
		return
	}
	c.JSON(http.StatusOK, partners)
}

// CreatePartner adds a new OTA/Channel Manager global integration
func CreatePartner(c *gin.Context) {
	var req models.PartnerIntegration
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := config.DB.Create(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create partner: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, req)
}

// UpdatePartner updates an existing OTA/Channel Manager configuration
func UpdatePartner(c *gin.Context) {
	id := c.Param("id")
	var partner models.PartnerIntegration

	if err := config.DB.First(&partner, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Partner not found"})
		return
	}

	var req models.PartnerIntegration
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	partner.PartnerName = req.PartnerName
	partner.InventoryURL = req.InventoryURL
	partner.IsActive = req.IsActive

	if err := config.DB.Save(&partner).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update partner"})
		return
	}

	c.JSON(http.StatusOK, partner)
}

// DeletePartner removes a partner integration
func DeletePartner(c *gin.Context) {
	id := c.Param("id")
	if err := config.DB.Delete(&models.PartnerIntegration{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete partner"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Partner deleted successfully"})
}
