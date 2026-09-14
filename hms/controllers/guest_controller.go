package controllers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/repositories"
	"hms/services"
	"hms/utils"

	"github.com/gin-gonic/gin"
)

const (
	guestListCacheTTL   = 30 * time.Second
	guestDetailCacheTTL = 60 * time.Second
)

func guestListCacheKey(hotelID uint) string {
	return fmt.Sprintf("hms:guests:list:%d", hotelID)
}

func guestDetailCacheKey(hotelID uint, guestID string) string {
	return fmt.Sprintf("hms:guests:detail:%d:%s", hotelID, guestID)
}

func invalidateGuestCache(hotelID uint, guestID ...string) {
	ctx := context.Background()
	keys := []string{guestListCacheKey(hotelID)}
	for _, id := range guestID {
		keys = append(keys, guestDetailCacheKey(hotelID, id))
	}
	config.CacheDelete(ctx, keys...)
	// Also invalidate dashboard since guest data affects counts
	InvalidateDashboardCache(hotelID)
}

var guestService = services.NewGuestService(repositories.NewGuestRepository())

type guestPayload struct {
	Name        string `json:"name"`
	FullName    string `json:"full_name"`
	Phone       string `json:"phone"`
	Email       string `json:"email"`
	Gender      string `json:"gender"`
	Nationality string `json:"nationality"`
	DateOfBirth string `json:"date_of_birth"`
	LoyaltyTier string `json:"loyalty_tier"`
	IDType      string `json:"id_type"`
	IDNumber    string `json:"id_number"`
	IDVerified  bool   `json:"id_verified"`
	Preferences string `json:"preferences"`
	// Address fields — stored as JSON in the address column
	Country       string `json:"country"`
	State         string `json:"state"`
	City          string `json:"city"`
	District      string `json:"district"`
	Pincode       string `json:"pincode"`
	ProofDocument string `json:"proof_document"`
}

// addressJSON is the structured address stored in guests.address column
type addressJSON struct {
	City     string `json:"city"`
	State    string `json:"state"`
	District string `json:"district"`
	Pincode  string `json:"pincode"`
	Country  string `json:"country"`
}

func buildAddressJSON(p guestPayload) string {
	a := addressJSON{
		City:     strings.TrimSpace(p.City),
		State:    strings.TrimSpace(p.State),
		District: strings.TrimSpace(p.District),
		Pincode:  strings.TrimSpace(p.Pincode),
		Country:  strings.TrimSpace(p.Country),
	}
	b, err := json.Marshal(a)
	if err != nil {
		return ""
	}
	return string(b)
}

func parseAddressJSON(raw string) addressJSON {
	var a addressJSON
	if strings.TrimSpace(raw) == "" {
		return a
	}
	if err := json.Unmarshal([]byte(raw), &a); err == nil {
		return a
	}
	// Legacy plain text — ignore, return empty struct
	return a
}

type guestListRow struct {
	models.Guest
	TotalPreviousStays int64      `json:"total_previous_stays"`
	LastVisitDate      *time.Time `json:"last_visit_date"`
}

type guestBookingHistoryRow struct {
	ID             uint      `gorm:"column:id" json:"id"`
	BookingCode    string    `gorm:"column:booking_code" json:"booking_code"`
	RoomID         uint      `gorm:"column:room_id" json:"room_id"`
	RoomNumber     string    `gorm:"column:room_number" json:"room_number"`
	CheckInDate    time.Time `gorm:"column:check_in_date" json:"check_in_date"`
	CheckOutDate   time.Time `gorm:"column:check_out_date" json:"check_out_date"`
	Status         string    `gorm:"column:status" json:"status"`
	BaseRate       float64   `gorm:"column:base_rate" json:"base_rate"`
	Discount       float64   `gorm:"column:discount" json:"discount"`
	TaxRate        float64   `gorm:"column:tax_rate" json:"tax_rate"`
	Tax            float64   `gorm:"column:tax" json:"tax"`
	TotalAmount    float64   `gorm:"column:total_amount" json:"total_amount"`
	AdvancePayment float64   `gorm:"column:advance_payment" json:"advance_payment"`
	TotalGuests    int       `gorm:"column:total_guests" json:"total_guests"`
	GrandTotal     float64   `gorm:"-" json:"grand_total"` // computed: total_amount + folio + tax
}

func uploadGuestPhoto(c *gin.Context, file *multipart.FileHeader) string {
	f, ferr := file.Open()
	if ferr != nil {
		return ""
	}
	defer f.Close()

	if u, _, upErr := utils.UploadToServer(c.Request.Context(), f, filepath.Base(file.Filename), "guests"); upErr == nil && u != "" {
		return u
	}

	uploads := utils.UploadDir("guests")
	_ = os.MkdirAll(uploads, 0755)
	fname := fmt.Sprintf("guest_%d_%s", utils.RandomInt(), filepath.Base(file.Filename))
	dst := filepath.Join(uploads, fname)
	if err := c.SaveUploadedFile(file, dst); err == nil {
		return "/uploads/guests/" + fname
	}
	return ""
}

func uploadGuestDocument(c *gin.Context, file *multipart.FileHeader) string {
	f, ferr := file.Open()
	if ferr != nil {
		return ""
	}
	defer f.Close()

	if u, _, upErr := utils.UploadToServer(c.Request.Context(), f, filepath.Base(file.Filename), "guests"); upErr == nil && u != "" {
		return u
	}

	uploads := utils.UploadDir("guests")
	_ = os.MkdirAll(uploads, 0755)
	fname := fmt.Sprintf("guest_doc_%d_%s", utils.RandomInt(), filepath.Base(file.Filename))
	dst := filepath.Join(uploads, fname)
	if err := c.SaveUploadedFile(file, dst); err == nil {
		return "/uploads/guests/" + fname
	}
	return ""
}

func normalizeGuestInput(payload guestPayload) (models.Guest, string) {
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		name = strings.TrimSpace(payload.FullName)
	}

	addressStr := buildAddressJSON(payload)

	g := models.Guest{
		Name:          name,
		Phone:         strings.TrimSpace(payload.Phone),
		Email:         strings.TrimSpace(payload.Email),
		Gender:        strings.TrimSpace(payload.Gender),
		Nationality:   strings.TrimSpace(payload.Nationality),
		DateOfBirth:   strings.TrimSpace(payload.DateOfBirth),
		LoyaltyTier:   strings.TrimSpace(payload.LoyaltyTier),
		IDVerified:    payload.IDVerified,
		Preferences:   strings.TrimSpace(payload.Preferences),
		Address:       addressStr,
		City:          strings.TrimSpace(payload.City),
		State:         strings.TrimSpace(payload.State),
		Pincode:       strings.TrimSpace(payload.Pincode),
		Country:       strings.TrimSpace(payload.Country),
		ProofDocument: strings.TrimSpace(payload.ProofDocument),
	}

	if g.Name == "" {
		return g, "name is required"
	}
	if g.Phone == "" {
		return g, "phone is required"
	}
	if g.Gender != "" {
		gender := strings.ToLower(g.Gender)
		switch gender {
		case "male", "m":
			g.Gender = "Male"
		case "female", "f":
			g.Gender = "Female"
		case "other", "o", "non-binary", "nonbinary", "transgender", "trans":
			g.Gender = "Other"
		default:
			g.Gender = ""
		}
	}
	return g, ""
}

func AddGuest(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	var g models.Guest

	if strings.HasPrefix(strings.ToLower(c.ContentType()), "multipart/form-data") {
		verifiedForm := strings.TrimSpace(c.PostForm("id_verified"))
		verified := verifiedForm == "1" || strings.EqualFold(verifiedForm, "true") || strings.EqualFold(verifiedForm, "yes") || strings.EqualFold(verifiedForm, "on")
		payload := guestPayload{
			Name:          c.PostForm("name"),
			FullName:      c.PostForm("full_name"),
			Phone:         c.PostForm("phone"),
			Email:         c.PostForm("email"),
			Gender:        c.PostForm("gender"),
			Nationality:   c.PostForm("nationality"),
			DateOfBirth:   c.PostForm("date_of_birth"),
			LoyaltyTier:   c.PostForm("loyalty_tier"),
			IDVerified:    verified,
			Preferences:   c.PostForm("preferences"),
			Country:       c.PostForm("country"),
			State:         c.PostForm("state"),
			City:          c.PostForm("city"),
			District:      c.PostForm("district"),
			Pincode:       c.PostForm("pincode"),
			ProofDocument: c.PostForm("proof_document"),
		}
		normalized, errMsg := normalizeGuestInput(payload)
		if errMsg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": errMsg})
			return
		}
		g = normalized
		if file, err := c.FormFile("photo"); err == nil {
			if photo := uploadGuestPhoto(c, file); photo != "" {
				g.Photo = photo
			}
		}

		proofTypes := c.PostFormArray("proof_document_types")
		proofDocs := []map[string]string{}
		if mf, err := c.MultipartForm(); err == nil && mf != nil {
			if files, ok := mf.File["proof_documents"]; ok {
				for i, file := range files {
					docType := "other"
					if i < len(proofTypes) && strings.TrimSpace(proofTypes[i]) != "" {
						docType = strings.TrimSpace(proofTypes[i])
					}
					if proof := uploadGuestDocument(c, file); proof != "" {
						if g.ProofDocument == "" {
							g.ProofDocument = proof
						}
						proofDocs = append(proofDocs, map[string]string{"type": docType, "url": proof})
					}
				}
			}
		}
		if len(proofDocs) > 0 {
			if encoded, err := json.Marshal(proofDocs); err == nil {
				g.ProofDocuments = string(encoded)
			}
		}
		// Do NOT append proof document info to Preferences. Preferences is for notes only.

		if g.ProofDocument == "" {
			if file, err := c.FormFile("document"); err == nil {
				if proof := uploadGuestDocument(c, file); proof != "" {
					g.ProofDocument = proof
				}
			}
		}
	} else {
		var payload guestPayload
		if err := c.ShouldBindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		normalized, errMsg := normalizeGuestInput(payload)
		if errMsg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": errMsg})
			return
		}
		g = normalized
	}

	g.HotelID = hotelID

	var duplicate models.Guest
	if err := config.DB.Where("hotel_id = ? AND phone = ? AND deleted_at IS NULL", hotelID, g.Phone).First(&duplicate).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "phone already exists for this hotel"})
		return
	}

	if err := guestService.CreateGuest(&g); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add guest"})
		return
	}
	invalidateGuestCache(g.HotelID)
	utils.LogActivity(g.HotelID, "Guest", c.GetUint("admin_id"), fmt.Sprintf("New Guest '%s' created", g.Name))
	c.JSON(http.StatusCreated, g)
}

func ListGuests(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	page := 1
	pageSize := 20
	if v := c.Query("page"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			page = p
		}
	}
	if v := c.Query("page_size"); v != "" {
		if s, err := strconv.Atoi(v); err == nil && s > 0 && s <= 100 {
			pageSize = s
		}
	}

	q := strings.TrimSpace(c.Query("q"))
	idVerified := strings.TrimSpace(c.Query("id_verified"))

	// Cache only unfiltered first-page requests (most common pattern)
	ctx := c.Request.Context()
	type guestListResult struct {
		Items    []guestListRow `json:"items"`
		Total    int64          `json:"total"`
		Page     int            `json:"page"`
		PageSize int            `json:"page_size"`
	}
	if q == "" && idVerified == "" && page == 1 && pageSize == 20 {
		var cached guestListResult
		if config.CacheGet(ctx, guestListCacheKey(hotelID), &cached) {
			c.JSON(http.StatusOK, cached)
			return
		}
	}

	query := config.DB.Model(&models.Guest{}).
		Where("guests.hotel_id = ? AND guests.deleted_at IS NULL", hotelID)

	if q != "" {
		like := "%" + q + "%"
		query = query.Where("guests.name ILIKE ? OR guests.phone ILIKE ?", like, like)
	}
	if idVerified != "" {
		verified := idVerified == "1" || strings.EqualFold(idVerified, "true")
		query = query.Where("guests.id_verified = ?", verified)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count guests"})
		return
	}

	var guests []guestListRow
	err := query.
		Select(`
			guests.*,
			COALESCE(COUNT(bookings.id), 0) AS total_previous_stays,
			MAX(bookings.check_out_date) AS last_visit_date
		`).
		Joins("LEFT JOIN bookings ON bookings.guest_id = guests.id AND bookings.hotel_id = guests.hotel_id AND bookings.deleted_at IS NULL").
		Group("guests.id").
		Order("guests.id desc").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Scan(&guests).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch guests"})
		return
	}

	result := gin.H{
		"items":     guests,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	}

	// Cache unfiltered first-page results
	if q == "" && idVerified == "" && page == 1 && pageSize == 20 {
		config.CacheSet(ctx, guestListCacheKey(hotelID), result, guestListCacheTTL)
	}

	c.JSON(http.StatusOK, result)
}

func SearchGuests(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	hotelID := c.GetUint("active_hotel_id")
	if q == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q query required"})
		return
	}
	var guests []models.Guest
	like := "%" + q + "%"
	if err := config.DB.Where("hotel_id = ? AND deleted_at IS NULL AND (name ILIKE ? OR phone ILIKE ?)", hotelID, like, like).Order("id desc").Limit(15).Find(&guests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}
	c.JSON(http.StatusOK, guests)
}

func GetGuest(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	guestID := c.Param("id")
	ctx := c.Request.Context()

	// Try cache first
	type guestDetailResult struct {
		Guest              models.Guest             `json:"guest"`
		Address            addressJSON              `json:"address"`
		BookingHistory     []guestBookingHistoryRow `json:"booking_history"`
		TotalPreviousStays int64                    `json:"total_previous_stays"`
		LastVisitDate      interface{}              `json:"last_visit_date"`
	}
	var cachedDetail guestDetailResult
	if config.CacheGet(ctx, guestDetailCacheKey(hotelID, guestID), &cachedDetail) {
		c.JSON(http.StatusOK, cachedDetail)
		return
	}

	var guest models.Guest
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", guestID, hotelID).First(&guest).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Guest not found"})
		return
	}

	var bookings []guestBookingHistoryRow
	_ = config.DB.Model(&models.Booking{}).
		Select("bookings.id, bookings.booking_code, bookings.room_id, bookings.check_in_date, bookings.check_out_date, bookings.status, bookings.base_rate, bookings.discount, bookings.tax_rate, bookings.tax, bookings.total_amount, bookings.advance_payment, bookings.total_guests, COALESCE(rooms.room_number, '') AS room_number").
		Joins("LEFT JOIN rooms ON rooms.id = bookings.room_id AND rooms.deleted_at IS NULL").
		Where("bookings.guest_id = ? AND bookings.hotel_id = ? AND bookings.deleted_at IS NULL", guest.ID, hotelID).
		Order("bookings.id desc").
		Scan(&bookings).Error

	// Compute authoritative grand total for each booking (folio + tax)
	for i := range bookings {
		var folioSum float64
		config.DB.Model(&models.FolioItem{}).Where("booking_id = ?", bookings[i].ID).Select("COALESCE(SUM(amount),0)").Scan(&folioSum)
		taxRate := bookings[i].TaxRate
		if taxRate < 0 {
			taxRate = 0
		}
		taxable := bookings[i].TotalAmount + folioSum - bookings[i].Discount
		if taxable < 0 {
			taxable = 0
		}
		tax := bookings[i].Tax
		if tax == 0 && taxRate > 0 {
			tax = taxable * taxRate / 100
		}
		bookings[i].GrandTotal = taxable + tax
	}

	var totalPreviousStays int64
	_ = config.DB.Model(&models.Booking{}).Where("guest_id = ? AND hotel_id = ? AND deleted_at IS NULL", guest.ID, hotelID).Count(&totalPreviousStays).Error

	var lastVisit sql.NullTime
	_ = config.DB.Model(&models.Booking{}).Where("guest_id = ? AND hotel_id = ? AND deleted_at IS NULL", guest.ID, hotelID).Select("MAX(check_out_date)").Scan(&lastVisit).Error

	var lastVisitDate any = nil
	if lastVisit.Valid {
		lastVisitDate = lastVisit.Time
	}

	detailResult := guestDetailResult{
		Guest:              guest,
		Address:            parseAddressJSON(guest.Address),
		BookingHistory:     bookings,
		TotalPreviousStays: totalPreviousStays,
		LastVisitDate:      lastVisitDate,
	}
	config.CacheSet(ctx, guestDetailCacheKey(hotelID, guestID), detailResult, guestDetailCacheTTL)
	c.JSON(http.StatusOK, detailResult)
}

func UpdateGuest(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	guestID := c.Param("id")

	var existing models.Guest
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", guestID, hotelID).First(&existing).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Guest not found"})
		return
	}

	if strings.HasPrefix(strings.ToLower(c.ContentType()), "multipart/form-data") {
		verifiedForm := strings.TrimSpace(c.PostForm("id_verified"))
		verified := verifiedForm == "1" || strings.EqualFold(verifiedForm, "true") || strings.EqualFold(verifiedForm, "yes") || strings.EqualFold(verifiedForm, "on")
		payload := guestPayload{
			Name:          c.PostForm("name"),
			FullName:      c.PostForm("full_name"),
			Phone:         c.PostForm("phone"),
			Email:         c.PostForm("email"),
			Gender:        c.PostForm("gender"),
			Nationality:   c.PostForm("nationality"),
			DateOfBirth:   c.PostForm("date_of_birth"),
			LoyaltyTier:   c.PostForm("loyalty_tier"),
			IDVerified:    verified,
			Preferences:   c.PostForm("preferences"),
			Country:       c.PostForm("country"),
			State:         c.PostForm("state"),
			City:          c.PostForm("city"),
			District:      c.PostForm("district"),
			Pincode:       c.PostForm("pincode"),
			ProofDocument: c.PostForm("proof_document"),
		}
		normalized, errMsg := normalizeGuestInput(payload)
		if errMsg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": errMsg})
			return
		}

		if normalized.Phone != existing.Phone {
			var duplicate models.Guest
			if err := config.DB.Where("hotel_id = ? AND phone = ? AND id <> ? AND deleted_at IS NULL", hotelID, normalized.Phone, existing.ID).First(&duplicate).Error; err == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "phone already exists for this hotel"})
				return
			}
		}

		existing.Name = normalized.Name
		existing.Phone = normalized.Phone
		existing.Email = normalized.Email
		existing.Gender = normalized.Gender
		existing.Nationality = normalized.Nationality
		existing.DateOfBirth = normalized.DateOfBirth
		existing.LoyaltyTier = normalized.LoyaltyTier
		existing.IDVerified = normalized.IDVerified
		existing.Preferences = normalized.Preferences
		existing.Address = normalized.Address
		existing.Country = normalized.Country
		existing.ProofDocument = normalized.ProofDocument
		if file, err := c.FormFile("photo"); err == nil {
			if photo := uploadGuestPhoto(c, file); photo != "" {
				existing.Photo = photo
			}
		}

		proofTypes := c.PostFormArray("proof_document_types")
		proofDocs := []map[string]string{}

		// Merge retained existing documents first
		if retained := strings.TrimSpace(c.PostForm("retained_proof_documents")); retained != "" {
			var retainedDocs []map[string]string
			if err := json.Unmarshal([]byte(retained), &retainedDocs); err == nil {
				proofDocs = append(proofDocs, retainedDocs...)
			}
		}

		if mf, err := c.MultipartForm(); err == nil && mf != nil {
			if files, ok := mf.File["proof_documents"]; ok {
				for i, file := range files {
					docType := "other"
					if i < len(proofTypes) && strings.TrimSpace(proofTypes[i]) != "" {
						docType = strings.TrimSpace(proofTypes[i])
					}
					if proof := uploadGuestDocument(c, file); proof != "" {
						if existing.ProofDocument == "" {
							existing.ProofDocument = proof
						}
						proofDocs = append(proofDocs, map[string]string{"type": docType, "url": proof})
					}
				}
			}
		}
		if len(proofDocs) > 0 {
			if encoded, err := json.Marshal(proofDocs); err == nil {
				existing.ProofDocuments = string(encoded)
				// Keep ProofDocument pointing to the first entry
				if existing.ProofDocument == "" && len(proofDocs) > 0 {
					existing.ProofDocument = proofDocs[0]["url"]
				}
			}
		}

		if existing.ProofDocument == "" {
			if file, err := c.FormFile("document"); err == nil {
				if proof := uploadGuestDocument(c, file); proof != "" {
					existing.ProofDocument = proof
				}
			}
		}
	} else {
		var payload guestPayload
		if err := c.ShouldBindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		normalized, errMsg := normalizeGuestInput(payload)
		if errMsg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": errMsg})
			return
		}

		if normalized.Phone != existing.Phone {
			var duplicate models.Guest
			if err := config.DB.Where("hotel_id = ? AND phone = ? AND id <> ? AND deleted_at IS NULL", hotelID, normalized.Phone, existing.ID).First(&duplicate).Error; err == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "phone already exists for this hotel"})
				return
			}
		}

		existing.Name = normalized.Name
		existing.Phone = normalized.Phone
		existing.Email = normalized.Email
		existing.Gender = normalized.Gender
		existing.Nationality = normalized.Nationality
		existing.DateOfBirth = normalized.DateOfBirth
		existing.LoyaltyTier = normalized.LoyaltyTier
		existing.IDVerified = normalized.IDVerified
		existing.Preferences = normalized.Preferences
		existing.Address = normalized.Address
		existing.Country = normalized.Country
		existing.ProofDocument = normalized.ProofDocument
	}

	if err := guestService.UpdateGuest(&existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update guest"})
		return
	}
	invalidateGuestCache(existing.HotelID, guestID)
	utils.LogActivity(existing.HotelID, "Guest", c.GetUint("admin_id"), fmt.Sprintf("Guest '%s' updated", existing.Name))
	c.JSON(http.StatusOK, existing)
}

func GuestHistory(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	guestID := c.Param("id")
	var bookings []guestBookingHistoryRow
	if err := config.DB.Model(&models.Booking{}).
		Select("bookings.id, bookings.booking_code, bookings.room_id, bookings.check_in_date, bookings.check_out_date, bookings.status, bookings.base_rate, bookings.discount, bookings.tax_rate, bookings.tax, bookings.total_amount, bookings.advance_payment, bookings.total_guests, COALESCE(rooms.room_number, '') AS room_number").
		Joins("LEFT JOIN rooms ON rooms.id = bookings.room_id AND rooms.deleted_at IS NULL").
		Where("bookings.guest_id = ? AND bookings.hotel_id = ? AND bookings.deleted_at IS NULL", guestID, hotelID).
		Order("bookings.id desc").
		Scan(&bookings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch history"})
		return
	}
	c.JSON(http.StatusOK, bookings)
}

func DeleteGuest(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	guestIDParam, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || guestIDParam == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid guest id"})
		return
	}
	guestID := uint(guestIDParam)

	guest, err := guestService.GetGuest(guestID, hotelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Guest not found"})
		return
	}

	if err := guestService.DeleteGuest(guestID, hotelID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	invalidateGuestCache(hotelID, fmt.Sprintf("%d", guestID))
	utils.LogActivity(hotelID, "Guest", c.GetUint("admin_id"), fmt.Sprintf("Guest '%s' deleted", guest.Name))
	c.JSON(http.StatusOK, gin.H{"message": "Guest deleted"})
}
