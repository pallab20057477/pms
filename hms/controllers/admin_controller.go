package controllers

import (
	"net/http"
	"strings"

	"hms/config"
	"hms/models"

	"github.com/gin-gonic/gin"
)

// RunAdminImageSync sets RoomType.Image from the first/primary RoomImage when missing.
func RunAdminImageSync(c *gin.Context) {
	var roomTypes []models.RoomType
	if err := config.DB.Find(&roomTypes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list room types"})
		return
	}
	updated := 0
	for _, r := range roomTypes {
		if strings.TrimSpace(r.Image) != "" {
			continue
		}
		var img models.RoomImage
		if err := config.DB.Where("room_type_id = ?", r.ID).Order("is_primary desc, \"order\" asc").First(&img).Error; err == nil {
			if img.URL != "" {
				_ = config.DB.Model(&r).Updates(map[string]interface{}{"image": img.URL}).Error
				updated++
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"updated": updated})
}

// CleanGuestPreferences scrubs legacy garbage from the preferences field.
// Old code incorrectly appended gender, notes, and proof document info into preferences.
// This runs a safe regex-based cleanup directly in Postgres.
func CleanGuestPreferences(c *gin.Context) {
	// Strip patterns like "Gender: Male\n", "Customer Notes: \n", "Proof Documents: ...\n"
	// using Postgres regexp_replace. Run multiple passes to handle all variants.
	queries := []string{
		`UPDATE guests SET preferences = TRIM(regexp_replace(preferences, 'Gender:\s*\S*\s*', '', 'gi')) WHERE preferences ~ 'Gender:'`,
		`UPDATE guests SET preferences = TRIM(regexp_replace(preferences, 'Customer Notes:\s*', '', 'gi')) WHERE preferences ~ 'Customer Notes:'`,
		`UPDATE guests SET preferences = TRIM(regexp_replace(preferences, 'Proof Documents:[^\n]*\n?', '', 'gi')) WHERE preferences ~ 'Proof Documents:'`,
		`UPDATE guests SET preferences = NULL WHERE TRIM(COALESCE(preferences,'')) = ''`,
	}
	total := int64(0)
	for _, q := range queries {
		res := config.DB.Exec(q)
		if res.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.Error.Error(), "query": q})
			return
		}
		total += res.RowsAffected
	}
	c.JSON(http.StatusOK, gin.H{"message": "Guest preferences cleaned", "rows_affected": total})
}
func DropCloudinaryColumns(c *gin.Context) {
	// perform safely using IF EXISTS
	if err := config.DB.Exec("ALTER TABLE IF EXISTS room_images DROP COLUMN IF EXISTS cloudinary_public_id;").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to drop column on room_images", "detail": err.Error()})
		return
	}
	if err := config.DB.Exec("ALTER TABLE IF EXISTS rooms DROP COLUMN IF EXISTS cloudinary_public_id;").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to drop column on rooms", "detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
