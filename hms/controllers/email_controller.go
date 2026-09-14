package controllers

import (
	"net/http"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

// SendEmailUpdate sends booking-related emails
func SendEmailUpdate(c *gin.Context) {
	var req struct {
		BookingID   uint            `json:"booking_id" binding:"required"`
		EmailType   string          `json:"email_type" binding:"required"`
		CustomData  map[string]string `json:"custom_data"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Convert string to EmailType
	emailType := utils.EmailType(req.EmailType)
	
	if err := utils.SendBookingEmails(req.BookingID, emailType, req.CustomData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Email sent successfully"})
}

// SendPromotionalEmail sends promotional emails to multiple guests
func SendPromotionalEmail(c *gin.Context) {
	var req struct {
		GuestEmails []string `json:"guest_emails" binding:"required"`
		Subject     string   `json:"subject" binding:"required"`
		Message     string   `json:"message" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.GuestEmails) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot send to more than 100 guests at once"})
		return
	}

	if err := utils.SendPromotionalEmail(req.GuestEmails, req.Subject, req.Message); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Promotional email sent successfully"})
}

// GetGuestEmails returns email addresses of guests for promotional emails
func GetGuestEmails(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	
	var guests []struct {
		ID    uint   `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}

	if err := config.DB.Model(&models.Guest{}).
		Select("id, name, email").
		Where("hotel_id = ? AND email IS NOT NULL AND email != '' AND deleted_at IS NULL", hotelID).
		Find(&guests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch guests"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"guests": guests})
}

// GetEmailStatistics returns email usage statistics
func GetEmailStatistics(c *gin.Context) {
	stats := utils.GetEmailStatistics()
	c.JSON(http.StatusOK, stats)
}

// ValidateEmailConfig validates email configuration
func ValidateEmailConfig(c *gin.Context) {
	if err := utils.ValidateEmailConfig(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"valid": false,
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid": true,
		"message": "Email configuration is valid",
	})
}

// SendCustomEmail sends a custom email
func SendCustomEmail(c *gin.Context) {
	var req struct {
		To      string `json:"to" binding:"required,email"`
		Subject string `json:"subject" binding:"required"`
		Message string `json:"message" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	em := utils.NewEmailManager()
	data := utils.EmailData{
		ToEmail: req.To,
		Subject: req.Subject,
		Data: map[string]interface{}{
			"html": req.Message,
		},
	}

	if err := em.SendEmail(utils.EmailCustom, data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Custom email sent successfully"})
}

// TestEmail sends a test email to validate configuration
func TestEmail(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email parameter is required"})
		return
	}

	em := utils.NewEmailManager()
	data := utils.EmailData{
		ToEmail: email,
		Subject: "🧪 Test Email - HMS System",
		Data: map[string]interface{}{
			"html": `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>
		body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
		.container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
		.header { text-align: center; color: #009688; margin-bottom: 20px; }
		.success { color: #4caf50; font-size: 18px; text-align: center; margin: 20px 0; }
		.details { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0; }
		.footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>🧪 Test Email</h1>
			<p>Hotel Management System</p>
		</div>
		<div class="success">
			✅ <strong>Email Configuration is Working!</strong>
		</div>
		<div class="details">
			<h3>Test Details:</h3>
			<p><strong>Sent to:</strong> ` + email + `</p>
			<p><strong>Time:</strong> ` + utils.GetFormattedTime() + `</p>
			<p><strong>System:</strong> HMS Email Service</p>
		</div>
		<p>This is a test email to verify that your email configuration is working correctly. If you received this email, your SMTP settings are properly configured.</p>
		<div class="footer">
			<p>This is an automated test message. Please do not reply.</p>
		</div>
	</div>
</body>
</html>`,
		},
	}

	if err := em.SendEmail(utils.EmailCustom, data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Test email sent successfully"})
}
