package controllers

import (
	"fmt"
	"hms/config"
	"hms/models"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// POST /api/public/reviews
// Requires guest JWT. Guest can only review a booking they own that is completed/checked_out.
func CreateReview(c *gin.Context) {
	publicUserID := c.GetUint("public_user_id")

	var req struct {
		BookingCode string `json:"booking_code" binding:"required"`
		Rating      int    `json:"rating" binding:"required,min=1,max=5"`
		Title       string `json:"title"`
		Body        string `json:"body" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Body = strings.TrimSpace(req.Body)
	req.Title = strings.TrimSpace(req.Title)
	if len(req.Body) < 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Review must be at least 10 characters"})
		return
	}
	if len(req.Body) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Review cannot exceed 2000 characters"})
		return
	}

	// Load booking
	var booking models.Booking
	if err := config.DB.Where("booking_code = ?", req.BookingCode).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}

	// Verify booking is completed or checked_out
	status := strings.ToLower(strings.ReplaceAll(booking.Status, "-", "_"))
	if status != "completed" && status != "checked_out" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You can only review a completed stay"})
		return
	}

	// Verify ownership — guest must match public user
	var guest models.Guest
	if err := config.DB.First(&guest, booking.GuestID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Guest not found"})
		return
	}
	var publicUser models.PublicUser
	if err := config.DB.First(&publicUser, publicUserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	if guest.Phone != publicUser.Phone && guest.Email != publicUser.Email {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not own this booking"})
		return
	}

	// Check duplicate — one review per booking
	var existing models.HotelReview
	if err := config.DB.Where("booking_id = ?", booking.ID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "You have already reviewed this stay"})
		return
	}

	review := models.HotelReview{
		HotelID:           booking.HotelID,
		BookingID:         booking.ID,
		PublicUserID:      publicUserID,
		GuestName:         guest.Name,
		Rating:            req.Rating,
		Title:             req.Title,
		Body:              req.Body,
		Status:            "published",
	}
	if err := config.DB.Create(&review).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save review"})
		return
	}

	// Update hotel's average rating
	go updateHotelRating(booking.HotelID)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Review submitted successfully",
		"review":  review,
	})
}

// GET /api/public/hotels/:hotel_id/reviews
// Public — no auth required. Returns published reviews with summary stats.
func GetHotelReviews(c *gin.Context) {
	hotelID, err := strconv.ParseUint(c.Param("hotel_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hotel ID"})
		return
	}

	page := 1
	pageSize := 10
	if v := c.Query("page"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			page = p
		}
	}

	var total int64
	config.DB.Model(&models.HotelReview{}).
		Where("hotel_id = ? AND status = ? AND deleted_at IS NULL", hotelID, "published").
		Count(&total)

	var reviews []models.HotelReview
	config.DB.Where("hotel_id = ? AND status = ? AND deleted_at IS NULL", hotelID, "published").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&reviews)

	// Aggregate stats
	type stats struct {
		AvgRating            float64 `json:"avg_rating"`
		AvgCleanliness       float64 `json:"avg_cleanliness"`
		AvgService           float64 `json:"avg_service"`
		AvgLocation          float64 `json:"avg_location"`
		AvgValue             float64 `json:"avg_value"`
		Count5               int64   `json:"count_5"`
		Count4               int64   `json:"count_4"`
		Count3               int64   `json:"count_3"`
		Count2               int64   `json:"count_2"`
		Count1               int64   `json:"count_1"`
	}
	var s stats
	config.DB.Model(&models.HotelReview{}).
		Where("hotel_id = ? AND status = ? AND deleted_at IS NULL", hotelID, "published").
		Select(`
			COALESCE(AVG(rating), 0) as avg_rating,
			COALESCE(AVG(NULLIF(rating_cleanliness, 0)), 0) as avg_cleanliness,
			COALESCE(AVG(NULLIF(rating_service, 0)), 0) as avg_service,
			COALESCE(AVG(NULLIF(rating_location, 0)), 0) as avg_location,
			COALESCE(AVG(NULLIF(rating_value, 0)), 0) as avg_value,
			COUNT(CASE WHEN rating = 5 THEN 1 END) as count_5,
			COUNT(CASE WHEN rating = 4 THEN 1 END) as count_4,
			COUNT(CASE WHEN rating = 3 THEN 1 END) as count_3,
			COUNT(CASE WHEN rating = 2 THEN 1 END) as count_2,
			COUNT(CASE WHEN rating = 1 THEN 1 END) as count_1
		`).Scan(&s)

	c.JSON(http.StatusOK, gin.H{
		"reviews":   reviews,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
		"summary":   s,
	})
}

// GET /api/public/reviews/check/:booking_code
// Requires guest JWT. Returns whether the guest has already reviewed this booking.
func CheckReviewEligibility(c *gin.Context) {
	publicUserID := c.GetUint("public_user_id")
	code := c.Param("booking_code")

	var booking models.Booking
	if err := config.DB.Where("booking_code = ?", code).First(&booking).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}

	status := strings.ToLower(strings.ReplaceAll(booking.Status, "-", "_"))
	canReview := status == "completed" || status == "checked_out"

	var existing models.HotelReview
	alreadyReviewed := config.DB.Where("booking_id = ? AND public_user_id = ?", booking.ID, publicUserID).First(&existing).Error == nil

	c.JSON(http.StatusOK, gin.H{
		"can_review":       canReview && !alreadyReviewed,
		"already_reviewed": alreadyReviewed,
		"booking_status":   booking.Status,
		"review":           func() interface{} {
			if alreadyReviewed {
				return existing
			}
			return nil
		}(),
	})
}

// GET /api/public/auth/my-reviews  (guest JWT required)
func MyReviews(c *gin.Context) {
	publicUserID := c.GetUint("public_user_id")
	var reviews []models.HotelReview
	config.DB.Where("public_user_id = ? AND deleted_at IS NULL", publicUserID).
		Order("created_at DESC").Find(&reviews)

	// Enrich with hotel names
	type reviewRow struct {
		models.HotelReview
		HotelName string `json:"hotel_name"`
	}
	result := make([]reviewRow, 0, len(reviews))
	for _, r := range reviews {
		var hotel models.Hotel
		config.DB.Select("name").First(&hotel, r.HotelID)
		result = append(result, reviewRow{HotelReview: r, HotelName: hotel.Name})
	}
	c.JSON(http.StatusOK, gin.H{"reviews": result})
}

// DELETE /api/public/reviews/:id  (guest JWT required — own review only)
func DeleteReview(c *gin.Context) {
	publicUserID := c.GetUint("public_user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid review ID"})
		return
	}
	var review models.HotelReview
	if err := config.DB.Where("id = ? AND public_user_id = ?", id, publicUserID).First(&review).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Review not found"})
		return
	}
	config.DB.Delete(&review)
	c.JSON(http.StatusOK, gin.H{"message": "Review deleted"})
}

// Admin: GET /api/reviews  (admin JWT required)
func AdminListReviews(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	var reviews []models.HotelReview
	config.DB.Where("hotel_id = ? AND deleted_at IS NULL", hotelID).
		Order("created_at DESC").Find(&reviews)
	c.JSON(http.StatusOK, gin.H{"reviews": reviews, "total": len(reviews)})
}

// updateHotelRating is a helper function to asynchronously update hotel ratings
func updateHotelRating(hotelID uint) {
	var avgRating float64
	err := config.DB.Model(&models.HotelReview{}).
		Where("hotel_id = ? AND status = ? AND deleted_at IS NULL", hotelID, "published").
		Select("COALESCE(AVG(rating), 0)").
		Scan(&avgRating).Error
	if err != nil {
		return
	}
	config.DB.Model(&models.Hotel{}).Where("id = ?", hotelID).Update("avg_rating", avgRating)
}

// Admin: PATCH /api/reviews/:id/status  (admin JWT required)
func AdminUpdateReviewStatus(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid review ID"})
		return
	}
	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status != "published" && req.Status != "hidden" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status must be 'published' or 'hidden'"})
		return
	}
	var review models.HotelReview
	if err := config.DB.Where("id = ? AND hotel_id = ?", id, hotelID).First(&review).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Review not found"})
		return
	}
	config.DB.Model(&review).Update("status", req.Status)
	
	// Update hotel rating if status changed to published
	go updateHotelRating(hotelID)

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Review %s", req.Status)})
}
