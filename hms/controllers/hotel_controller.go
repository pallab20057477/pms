package controllers

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"hms/config"
	"hms/models"
	"hms/repositories"
	"hms/services"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

var hotelService = services.NewHotelService(repositories.NewHotelRepository())

func parseFormBool(v string) bool {
	s := strings.ToLower(strings.TrimSpace(v))
	return s == "1" || s == "true" || s == "yes" || s == "on"
}

func parseFormFloat(v string) float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
	if err != nil || f < 0 {
		return 0
	}
	return f
}

func AddHotel(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	// Support JSON or multipart/form-data (for logo upload)
	var h models.Hotel
	contentType := c.ContentType()
	if contentType == "multipart/form-data" {
		// parse form fields
		h.Name = c.PostForm("name")
		h.Address1 = c.PostForm("address1")
		h.Address2 = c.PostForm("address2")
		h.City = c.PostForm("city")
		h.State = c.PostForm("state")
		h.Country = c.PostForm("country")
		h.Pincode = c.PostForm("pincode")
		h.Phone = c.PostForm("phone")
		h.Email = c.PostForm("email")
		h.TaxType = c.PostForm("tax_type")
		h.TaxPercent = parseFormFloat(c.PostForm("tax_percent"))
		h.GSTNumber = c.PostForm("gst_number")
		h.PANNumber = c.PostForm("pan_number")
		h.Description = c.PostForm("description")
		h.PropertyType = c.PostForm("property_type")
		if h.PropertyType == "" {
			h.PropertyType = "Hotel"
		}
		if v := c.PostForm("star_rating"); v != "" {
			if s, err := strconv.Atoi(v); err == nil {
				h.StarRating = s
			}
		}
		h.Website = c.PostForm("website")
		h.Status = c.PostForm("status")
		// handle file: try Cloudinary upload via helper, fallback to local storage
		file, err := c.FormFile("logo")
		if err == nil {
			// attempt cloudinary upload using helper
			f, ferr := file.Open()
			if ferr == nil {
				if url, _, upErr := utils.UploadToServer(c.Request.Context(), f, filepath.Base(file.Filename), "hotels"); upErr == nil && url != "" {
					h.Logo = normalizeUploadPath(url)
				} else {
					uploads := utils.UploadDir("hotels")
					_ = os.MkdirAll(uploads, 0755)
					fname := fmt.Sprintf("hotel_%d_%s", utils.RandomInt(), filepath.Base(file.Filename))
					dst := filepath.Join(uploads, fname)
					if err := c.SaveUploadedFile(file, dst); err == nil {
						h.Logo = "/uploads/hotels/" + fname
					}
				}
				_ = f.Close()
			}
		}
	} else {
		if err := c.ShouldBindJSON(&h); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	if h.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	h.Logo = normalizeUploadPath(h.Logo)
	if err := hotelService.CreateHotel(&h, adminID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create hotel"})
		return
	}
	utils.LogActivity(h.ID, "Hotel", adminID, "Hotel created")
	// return created hotel
	c.JSON(http.StatusCreated, h)
}

// normalizeUploadPath ensures only a clean relative path like /uploads/hotels/file.jpg is stored.
// It strips any host/scheme prefix from full URLs.
func normalizeUploadPath(raw string) string {
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		parsed, err := url.Parse(raw)
		if err != nil {
			return raw
		}
		raw = parsed.Path
	}
	if strings.HasPrefix(raw, "./") {
		raw = raw[1:]
	}
	if !strings.HasPrefix(raw, "/") {
		raw = "/" + raw
	}
	return raw
}

// deleteLocalUpload removes a local file given a relative or absolute upload path.
func deleteLocalUpload(raw string) {
	if raw == "" {
		return
	}
	p := normalizeUploadPath(raw)
	if p != "" {
		_ = os.Remove("." + p)
	}
}

func GetHotel(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hotel id"})
		return
	}
	h, err := hotelService.GetHotel(uint(id), adminID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hotel not found"})
		return
	}
	if h.Logo != "" {
		h.Logo = normalizeUploadPath(h.Logo)
	}
	c.JSON(http.StatusOK, h)
}

func UpdateHotel(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hotel id"})
		return
	}
	var h models.Hotel
	if err := config.DB.Where("id = ? AND admin_id = ?", uint(id), adminID).Take(&h).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hotel not found"})
		return
	}
	contentType := c.ContentType()
	if contentType == "multipart/form-data" {
		// update fields from form
		if v := c.PostForm("name"); v != "" {
			h.Name = v
		}
		if v := c.PostForm("address1"); v != "" {
			h.Address1 = v
		}
		if v := c.PostForm("city"); v != "" {
			h.City = v
		}
		if v := c.PostForm("state"); v != "" {
			h.State = v
		}
		if v := c.PostForm("country"); v != "" {
			h.Country = v
		}
		if v := c.PostForm("pincode"); v != "" {
			h.Pincode = v
		}
		if v := c.PostForm("phone"); v != "" {
			h.Phone = v
		}
		if v := c.PostForm("email"); v != "" {
			h.Email = v
		}
		if v := c.PostForm("tax_type"); v != "" {
			h.TaxType = v
		}
		if v := c.PostForm("tax_percent"); v != "" {
			h.TaxPercent = parseFormFloat(v)
		}
		if v := c.PostForm("gst_number"); v != "" {
			h.GSTNumber = v
		}
		if v := c.PostForm("pan_number"); v != "" {
			h.PANNumber = v
		}
		if v := c.PostForm("description"); v != "" {
			h.Description = v
		}
		if v := c.PostForm("property_type"); v != "" {
			h.PropertyType = v
		}
		if v := c.PostForm("star_rating"); v != "" {
			if s, err := strconv.Atoi(v); err == nil {
				h.StarRating = s
			}
		}
		// Allow clearing website if needed, or just updating if provided. Since it's a form, empty string is tricky to distinguish from "not provided", but usually forms send all fields.
		if v := c.PostForm("website"); v != "" {
			h.Website = v
		} else if c.PostForm("name") != "" { // if form is submitted
			h.Website = ""
		}
		// file update: try Cloudinary upload, fallback to local storage
		file, err := c.FormFile("logo")
		if err == nil {
			f, ferr := file.Open()
			if ferr == nil {
				prevLogo := h.Logo
				if url, _, upErr := utils.UploadToServer(c.Request.Context(), f, filepath.Base(file.Filename), "hotels"); upErr == nil && url != "" {
					newLogo := normalizeUploadPath(url)
					deleteLocalUpload(prevLogo)
					h.Logo = newLogo
				} else {
					uploads := utils.UploadDir("hotels")
					_ = os.MkdirAll(uploads, 0755)
					fname := fmt.Sprintf("hotel_%d_%s", utils.RandomInt(), filepath.Base(file.Filename))
					dst := filepath.Join(uploads, fname)
					if err := c.SaveUploadedFile(file, dst); err == nil {
						deleteLocalUpload(prevLogo)
						h.Logo = "/uploads/hotels/" + fname
					}
				}
				_ = f.Close()
			}
		}
	} else {
		var in models.Hotel
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		// copy allowed fields
		if in.Name != "" {
			h.Name = in.Name
		}
		if in.Address1 != "" {
			h.Address1 = in.Address1
		}
		if in.Address2 != "" {
			h.Address2 = in.Address2
		}
		if in.City != "" {
			h.City = in.City
		}
		if in.State != "" {
			h.State = in.State
		}
		if in.Country != "" {
			h.Country = in.Country
		}
		if in.Pincode != "" {
			h.Pincode = in.Pincode
		}
		if in.Phone != "" {
			h.Phone = in.Phone
		}
		if in.Email != "" {
			h.Email = in.Email
		}
		if in.TaxType != "" {
			h.TaxType = in.TaxType
		}
		if in.TaxPercent >= 0 {
			h.TaxPercent = in.TaxPercent
		}
		if in.GSTNumber != "" {
			h.GSTNumber = in.GSTNumber
		}
		if in.PANNumber != "" {
			h.PANNumber = in.PANNumber
		}
		if in.Description != "" {
			h.Description = in.Description
		}
		if in.PropertyType != "" {
			h.PropertyType = in.PropertyType
		}
		if in.StarRating >= 0 {
			h.StarRating = in.StarRating
		}
		// Always update website since JSON can clearly distinguish null/missing vs empty string.
		if in.Website != "" {
			h.Website = in.Website
		} else if in.Name != "" { // if JSON is submitted
			h.Website = ""
		}
		if in.Status != "" {
			h.Status = in.Status
		}
	}
	// Always normalize logo to relative path before saving
	h.Logo = normalizeUploadPath(h.Logo)
	if err := hotelService.UpdateHotel(&h); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update hotel"})
		return
	}
	utils.LogActivity(h.ID, "Hotel", adminID, "Hotel updated")
	c.JSON(http.StatusOK, h)
}

func DeleteHotel(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	idParam, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || idParam == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hotel id"})
		return
	}

	h, err := hotelService.GetHotel(uint(idParam), adminID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hotel not found"})
		return
	}

	if err := hotelService.DeleteHotel(uint(idParam), adminID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	deleteLocalUpload(h.Logo)
	utils.LogActivity(0, "Hotel", adminID, "Hotel deleted")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func ListHotels(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	hotels, err := hotelService.ListHotels(adminID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hotels"})
		return
	}
	for i := range hotels {
		if hotels[i].Logo != "" {
			hotels[i].Logo = normalizeUploadPath(hotels[i].Logo)
		}
	}
	c.JSON(http.StatusOK, hotels)
}

// RegeneratePublicToken creates a new public booking URL token for security
func RegeneratePublicToken(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	hotelID := c.GetUint("active_hotel_id")

	if hotelID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No hotel selected. Please select a hotel first."})
		return
	}

	token, err := hotelService.RegeneratePublicToken(hotelID, adminID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	utils.LogActivity(hotelID, "Hotel", adminID, "Public booking URL token regenerated")
	c.JSON(http.StatusOK, gin.H{"public_token": token, "message": "Public URL regenerated successfully"})
}

// generateRandomToken creates a cryptographically secure random token
func generateRandomToken(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		randVal, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[randVal.Int64()]
	}
	return string(b)
}

// Handles: Add hotel, List hotels, Switch active hotel
