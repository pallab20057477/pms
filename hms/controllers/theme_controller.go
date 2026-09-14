package controllers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

// ── helpers ──────────────────────────────────────────────────────────────────

func hotelIDFromParam(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("hotel_id"), 10, 32)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hotel_id"})
		return 0, false
	}
	return uint(id), true
}

func themeIDFromParam(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("theme_id"), 10, 32)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid theme_id"})
		return 0, false
	}
	return uint(id), true
}

// resolveActiveTheme returns the theme that should be applied for a hotel.
// Priority:
//  1. Hotel-specific IsActive=true theme
//  2. Hotel-specific date-range match
//  3. Global IsActive=true theme (is_global=true)
//  4. Global date-range match
func resolveActiveTheme(hotelID uint) *models.HotelTheme {
	now := time.Now()

	// ── 1 & 2: hotel-specific ──────────────────────────────────────────────
	var hotelThemes []models.HotelTheme
	config.DB.Where("hotel_id = ? AND is_global = false", hotelID).
		Order("is_active DESC, created_at DESC").
		Find(&hotelThemes)

	if t := pickBestTheme(hotelThemes, now); t != nil {
		return t
	}

	// ── 3 & 4: global fallback ─────────────────────────────────────────────
	var globalThemes []models.HotelTheme
	config.DB.Where("is_global = true").
		Order("is_active DESC, created_at DESC").
		Find(&globalThemes)

	return pickBestTheme(globalThemes, now)
}

// pickBestTheme selects the best matching theme from a slice.
// Rules (Industry Standard):
// 1. If IsActive is false, the theme is DISABLED and will NEVER be picked as Live.
// 2. If IsActive is true and it has scheduled dates (ActiveFrom / ActiveUntil),
//    it is picked ONLY if the current time falls within that date window.
// 3. If IsActive is true and has NO date constraints, it runs continuously as Force Active.
func pickBestTheme(themes []models.HotelTheme, now time.Time) *models.HotelTheme {
	// Pass 1: Active theme matching scheduled date range
	for i := range themes {
		t := &themes[i]
		if !t.IsActive {
			continue
		}
		if t.ActiveFrom != nil || t.ActiveUntil != nil {
			afterStart := t.ActiveFrom == nil || !now.Before(*t.ActiveFrom)
			beforeEnd := t.ActiveUntil == nil || now.Before(*t.ActiveUntil)
			if afterStart && beforeEnd {
				return t
			}
		}
	}

	// Pass 2: Active theme without date constraints (Force Active / Continuous)
	for i := range themes {
		t := &themes[i]
		if !t.IsActive {
			continue
		}
		if t.ActiveFrom == nil && t.ActiveUntil == nil {
			return t
		}
	}

	return nil
}

// ── Super Admin endpoints — Global Themes ────────────────────────────────────

// GET /api/super-admin/global-themes
func ListGlobalThemes(c *gin.Context) {
	var themes []models.HotelTheme
	if err := config.DB.Where("is_global = true").Order("created_at DESC").Find(&themes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load global themes"})
		return
	}
	now := time.Now()
	active := pickBestTheme(themes, now)
	type row struct {
		models.HotelTheme
		IsCurrentlyActive bool `json:"is_currently_active"`
	}
	result := make([]row, len(themes))
	for i, t := range themes {
		result[i] = row{HotelTheme: t, IsCurrentlyActive: active != nil && active.ID == t.ID}
	}
	c.JSON(http.StatusOK, gin.H{"themes": result})
}

// POST /api/super-admin/global-themes
func CreateGlobalTheme(c *gin.Context) {
	var body models.HotelTheme
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.HotelID = 0
	body.IsGlobal = true
	if body.IsActive {
		config.DB.Model(&models.HotelTheme{}).Where("is_global = true").Update("is_active", false)
	}
	if err := config.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create global theme"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"theme": body})
}

// PUT /api/super-admin/global-themes/:theme_id
func UpdateGlobalTheme(c *gin.Context) {
	themeID, ok := themeIDFromParam(c)
	if !ok {
		return
	}
	var theme models.HotelTheme
	if err := config.DB.Where("id = ? AND is_global = true", themeID).First(&theme).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Global theme not found"})
		return
	}

	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if activeVal, hasActive := req["is_active"]; hasActive {
		if activeBool, isBool := activeVal.(bool); isBool && activeBool {
			config.DB.Model(&models.HotelTheme{}).Where("is_global = true AND id != ?", themeID).Update("is_active", false)
		}
	}

	if err := config.DB.Model(&theme).Updates(req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update global theme"})
		return
	}

	config.DB.First(&theme, themeID)
	c.JSON(http.StatusOK, gin.H{"theme": theme})
}

// DELETE /api/super-admin/global-themes/:theme_id
func DeleteGlobalTheme(c *gin.Context) {
	themeID, ok := themeIDFromParam(c)
	if !ok {
		return
	}
	if err := config.DB.Where("id = ? AND is_global = true", themeID).Delete(&models.HotelTheme{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete global theme"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Global theme deleted"})
}

// ── Super Admin endpoints — Per-hotel Themes ──────────────────────────────────

// GET /api/super-admin/hotels/:hotel_id/themes
func ListHotelThemes(c *gin.Context) {
	hotelID, ok := hotelIDFromParam(c)
	if !ok {
		return
	}

	var themes []models.HotelTheme
	if err := config.DB.Where("hotel_id = ?", hotelID).Order("created_at DESC").Find(&themes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load themes"})
		return
	}

	// Annotate which one is currently active
	active := resolveActiveTheme(hotelID)
	type ThemeWithStatus struct {
		models.HotelTheme
		IsCurrentlyActive bool `json:"is_currently_active"`
	}
	result := make([]ThemeWithStatus, len(themes))
	for i, t := range themes {
		result[i] = ThemeWithStatus{HotelTheme: t, IsCurrentlyActive: active != nil && active.ID == t.ID}
	}

	c.JSON(http.StatusOK, gin.H{"themes": result, "hotel_id": hotelID})
}

// POST /api/super-admin/hotels/:hotel_id/themes
func CreateHotelTheme(c *gin.Context) {
	hotelID, ok := hotelIDFromParam(c)
	if !ok {
		return
	}

	var theme models.HotelTheme
	if err := c.ShouldBindJSON(&theme); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	theme.HotelID = hotelID
	theme.IsGlobal = false

	if theme.PrimaryColor == "" {
		theme.PrimaryColor = "#003580"
	}
	if theme.AccentColor == "" {
		theme.AccentColor = "#FF6B00"
	}
	if theme.BgGradientFrom == "" {
		theme.BgGradientFrom = "#001f5c"
	}
	if theme.BgGradientTo == "" {
		theme.BgGradientTo = "#003580"
	}
	if theme.TextOnBanner == "" {
		theme.TextOnBanner = "#ffffff"
	}
	if theme.FontFamily == "" {
		theme.FontFamily = "Inter"
	}

	if theme.IsActive {
		config.DB.Model(&models.HotelTheme{}).Where("hotel_id = ? AND is_global = false", hotelID).Update("is_active", false)
	}

	if err := config.DB.Create(&theme).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create theme"})
		return
	}
	c.JSON(http.StatusCreated, theme)
}

// PUT /api/super-admin/hotels/:hotel_id/themes/:theme_id
func UpdateHotelTheme(c *gin.Context) {
	hotelID, ok := hotelIDFromParam(c)
	if !ok {
		return
	}
	themeID, ok := themeIDFromParam(c)
	if !ok {
		return
	}

	var theme models.HotelTheme
	if err := config.DB.Where("id = ? AND hotel_id = ?", themeID, hotelID).First(&theme).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Theme not found"})
		return
	}

	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if activeVal, hasActive := req["is_active"]; hasActive {
		if activeBool, isBool := activeVal.(bool); isBool && activeBool {
			config.DB.Model(&models.HotelTheme{}).Where("hotel_id = ? AND is_global = false AND id != ?", hotelID, themeID).Update("is_active", false)
		}
	}

	if err := config.DB.Model(&theme).Updates(req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update theme"})
		return
	}

	// Re-fetch to return updated record
	config.DB.First(&theme, themeID)
	c.JSON(http.StatusOK, theme)
}

// DELETE /api/super-admin/hotels/:hotel_id/themes/:theme_id
func DeleteHotelTheme(c *gin.Context) {
	hotelID, ok := hotelIDFromParam(c)
	if !ok {
		return
	}
	themeID, ok := themeIDFromParam(c)
	if !ok {
		return
	}

	result := config.DB.Where("id = ? AND hotel_id = ?", themeID, hotelID).Delete(&models.HotelTheme{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete theme"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Theme not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Theme deleted"})
}

// GET /api/super-admin/hotels/:hotel_id/themes/active
// Returns the currently active theme (if any) for a hotel — useful for preview
func GetActiveHotelTheme(c *gin.Context) {
	hotelID, ok := hotelIDFromParam(c)
	if !ok {
		return
	}
	active := resolveActiveTheme(hotelID)
	if active == nil {
		c.JSON(http.StatusOK, gin.H{"theme": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"theme": active})
}

// ── Public endpoint (no auth) ─────────────────────────────────────────────────

// GetPublicActiveTheme — called by the public booking portal to get the active theme
// GET /api/public/hotels/:hotel_id/theme
func GetPublicActiveTheme(c *gin.Context) {
	hotelID, ok := hotelIDFromParam(c)
	if !ok {
		return
	}
	active := resolveActiveTheme(hotelID)
	if active == nil {
		c.JSON(http.StatusOK, gin.H{"theme": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"theme": active})
}

// ── utility ───────────────────────────────────────────────────────────────────

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// UploadThemeBanner — POST /api/super-admin/hotels/:hotel_id/themes/upload-banner
// Accepts a multipart file field named "banner", saves to /uploads/themes/, returns { url }
func UploadThemeBanner(c *gin.Context) {
	uploadThemeImage(c, "banner")
}

// UploadThemePanelImage — POST /api/super-admin/hotels/:hotel_id/themes/upload-panel
// Accepts "panel" field (left/right panel festive artwork), returns { url }
func UploadThemePanelImage(c *gin.Context) {
	uploadThemeImage(c, "panel")
}

// UploadThemeLogo — POST /api/super-admin/hotels/:hotel_id/themes/upload-logo
// Accepts "logo" field, returns { url }
func UploadThemeLogo(c *gin.Context) {
	uploadThemeImage(c, "logo")
}

func uploadThemeImage(c *gin.Context, fieldName string) {
	file, err := c.FormFile(fieldName)
	if err != nil {
		// try fallback field name "image"
		file, err = c.FormFile("image")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("No file uploaded (field name must be '%s' or 'image')", fieldName)})
			return
		}
	}

	// Validate type by extension
	ext := filepath.Ext(file.Filename)
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	if !allowed[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only JPG, PNG, WEBP and GIF images are allowed"})
		return
	}

	// Limit to 5 MB
	if file.Size > 5<<20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large (max 5 MB)"})
		return
	}

	// Try the server-side upload utility first (S3 / remote), fall back to local disk
	f, openErr := file.Open()
	if openErr == nil {
		defer f.Close()
		if u, _, upErr := utils.UploadToServer(c.Request.Context(), f, filepath.Base(file.Filename), "themes"); upErr == nil && u != "" {
			c.JSON(http.StatusOK, gin.H{"url": u})
			return
		}
	}

	// Local disk fallback — identical to room/hotel image pattern
	uploadsDir := utils.UploadDir("themes")
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create uploads directory"})
		return
	}
	fname := fmt.Sprintf("theme_%d%s", utils.RandomInt(), ext)
	dst := filepath.Join(uploadsDir, fname)
	if err := c.SaveUploadedFile(file, dst); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save image"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": "/uploads/themes/" + fname})
}
