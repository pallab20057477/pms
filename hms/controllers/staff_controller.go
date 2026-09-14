package controllers

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"
	"hms/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const maxStaffPhotoBytes = 5 * 1024 * 1024
const maxStaffDocumentBytes = 10 * 1024 * 1024

var allowedStaffRoles = map[string]string{
	"housekeeping": "Housekeeping",
	"receptionist": "Receptionist",
	"manager":      "Manager",
	"accountant":   "Accountant",
	"maintenance":  "Maintenance",
	"security":     "Security",
}

var roleLoginEnabled = map[string]bool{
	"Receptionist": true,
	"Manager":      true,
	"Accountant":   true,
}

var allowedStaffDocumentTypes = map[string]string{
	"aadhaar":             "Aadhaar",
	"pan":                 "PAN",
	"passport":            "Passport",
	"driving_license":     "Driving License",
	"employment_contract": "Employment Contract",
	"police_verification": "Police Verification",
	"other":               "Other",
}

func staffRoleAllowsLogin(role string) bool {
	return roleLoginEnabled[strings.TrimSpace(role)]
}

func normalizeStaffDocumentType(raw string) (string, bool) {
	v := strings.ToLower(strings.TrimSpace(raw))
	v = strings.ReplaceAll(v, "-", "_")
	v = strings.ReplaceAll(v, " ", "_")
	if v == "" {
		return "", true
	}
	t, ok := allowedStaffDocumentTypes[v]
	return t, ok
}

type staffPayload struct {
	Name              string  `json:"name"`
	Email             string  `json:"email"`
	Phone             string  `json:"phone"`
	Role              string  `json:"role"`
	JoinDate          string  `json:"join_date"`
	Notes             string  `json:"notes"`
	Status            *bool   `json:"status"`
	CountryCode       string  `json:"country_code"`
	AltPhone          string  `json:"alt_phone"`
	AltEmail          string  `json:"alt_email"`
	FamilyContactName string  `json:"family_contact_name"`
	FamilyPhone       string  `json:"family_phone"`
	HouseStreet       string  `json:"house_street"`
	City              string  `json:"city"`
	District          string  `json:"district"`
	State             string  `json:"state"`
	Pincode           string  `json:"pincode"`
	Country           string  `json:"country"`
	BasicSalary       float64 `json:"basic_salary"`
	Allowances        float64 `json:"allowances"`
	GrossSalary       float64 `json:"gross_salary"`
	EmploymentStatus  string  `json:"employment_status"`
	PortalAccess      *bool   `json:"portal_access"`
	CRMPassword       string  `json:"crm_password"`
	StaffDocumentType string  `json:"staff_document_type"`
}

type staffCurrentAssignmentRow struct {
	ID         uint   `json:"id"`
	RoomID     uint   `json:"room_id"`
	RoomNumber string `json:"room_number"`
	Status     string `json:"status"`
	AssignedTo string `json:"assigned_to"`
	StartTime  string `json:"start_time"`
	Notes      string `json:"notes"`
}

func parseStatusInput(raw string) (bool, bool) {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case "", "active", "1", "true", "yes":
		return true, true
	case "inactive", "0", "false", "no":
		return false, true
	default:
		return true, false
	}
}

func parseBoolInput(raw string) (bool, bool) {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case "1", "true", "yes", "on", "active", "enabled":
		return true, true
	case "0", "false", "no", "off", "inactive", "disabled":
		return false, true
	default:
		return false, false
	}
}

func parseFloatInput(raw string) float64 {
	v := strings.TrimSpace(raw)
	if v == "" {
		return 0
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil || n < 0 {
		return 0
	}
	return n
}

func validateAndCompressStaffPhoto(file *multipart.FileHeader) ([]byte, string, error) {
	if file == nil {
		return nil, "", fmt.Errorf("photo file missing")
	}
	if file.Size <= 0 {
		return nil, "", fmt.Errorf("empty photo file")
	}
	if file.Size > maxStaffPhotoBytes {
		return nil, "", fmt.Errorf("photo size must be <= 5MB")
	}

	f, err := file.Open()
	if err != nil {
		return nil, "", fmt.Errorf("failed to open photo")
	}
	defer f.Close()

	raw, err := io.ReadAll(io.LimitReader(f, maxStaffPhotoBytes+1))
	if err != nil {
		return nil, "", fmt.Errorf("failed to read photo")
	}
	if len(raw) == 0 {
		return nil, "", fmt.Errorf("empty photo file")
	}
	if len(raw) > maxStaffPhotoBytes {
		return nil, "", fmt.Errorf("photo size must be <= 5MB")
	}

	contentType := http.DetectContentType(raw)
	if contentType != "image/jpeg" && contentType != "image/png" {
		return nil, "", fmt.Errorf("only jpg and png images are allowed")
	}

	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", fmt.Errorf("invalid image file")
	}

	out := &bytes.Buffer{}
	ext := "jpg"
	if contentType == "image/png" {
		ext = "png"
		enc := png.Encoder{CompressionLevel: png.BestCompression}
		err = enc.Encode(out, img)
	} else {
		err = jpeg.Encode(out, img, &jpeg.Options{Quality: 82})
	}
	if err != nil {
		return nil, "", fmt.Errorf("failed to process image")
	}

	return out.Bytes(), ext, nil
}

func uploadStaffPhoto(file *multipart.FileHeader) (string, error) {
	data, ext, err := validateAndCompressStaffPhoto(file)
	if err != nil {
		return "", err
	}

	uploads := utils.UploadDir("staff")
	if err := os.MkdirAll(uploads, 0755); err != nil {
		return "", fmt.Errorf("failed to prepare upload directory")
	}

	fname := fmt.Sprintf("staff_%d.%s", time.Now().UnixNano(), ext)
	dst := uploads + "/" + fname
	if err := os.WriteFile(dst, data, 0644); err != nil {
		return "", fmt.Errorf("failed to store photo")
	}
	return "/uploads/staff/" + fname, nil
}

func removeLocalUpload(raw string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return
	}
	if i := strings.Index(raw, "/uploads/"); i >= 0 {
		_ = os.Remove("." + raw[i:])
		return
	}
	if strings.HasPrefix(raw, "./uploads/") {
		_ = os.Remove(raw)
		return
	}
	if strings.HasPrefix(raw, "uploads/") {
		_ = os.Remove("./" + raw)
	}
}

func uploadStaffDocument(file *multipart.FileHeader) (string, error) {
	if file == nil {
		return "", nil
	}
	if file.Size <= 0 {
		return "", fmt.Errorf("empty document file")
	}
	if file.Size > maxStaffDocumentBytes {
		return "", fmt.Errorf("document size must be <= 10MB")
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowed := map[string]bool{".pdf": true, ".jpg": true, ".jpeg": true, ".png": true, ".doc": true, ".docx": true}
	if !allowed[ext] {
		return "", fmt.Errorf("invalid document type")
	}

	uploads := utils.UploadDir("staff_docs")
	if err := os.MkdirAll(uploads, 0755); err != nil {
		return "", fmt.Errorf("failed to prepare document directory")
	}

	fname := fmt.Sprintf("staff_doc_%d%s", time.Now().UnixNano(), ext)
	dst := filepath.Join(uploads, fname)
	if err := saveUploadedFileSafe(file, dst); err != nil {
		return "", fmt.Errorf("failed to store document")
	}
	return "/uploads/staff_docs/" + fname, nil
}

func saveUploadedFileSafe(file *multipart.FileHeader, dst string) error {
	f, err := file.Open()
	if err != nil {
		return err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, maxStaffDocumentBytes+1))
	if err != nil {
		return err
	}
	if len(b) > maxStaffDocumentBytes {
		return fmt.Errorf("document too large")
	}
	return os.WriteFile(dst, b, 0644)
}

func parseStaffPayload(c *gin.Context) (staffPayload, *multipart.FileHeader, *multipart.FileHeader, error) {
	var p staffPayload
	if strings.HasPrefix(strings.ToLower(c.ContentType()), "multipart/form-data") {
		p.Name = c.PostForm("name")
		p.Email = c.PostForm("email")
		p.Phone = c.PostForm("phone")
		p.Role = c.PostForm("role")
		p.JoinDate = c.PostForm("join_date")
		p.Notes = c.PostForm("notes")
		p.CountryCode = c.PostForm("country_code")
		p.AltPhone = c.PostForm("alt_phone")
		p.AltEmail = c.PostForm("alt_email")
		p.FamilyContactName = c.PostForm("family_contact_name")
		p.FamilyPhone = c.PostForm("family_phone")
		p.HouseStreet = c.PostForm("house_street")
		p.City = c.PostForm("city")
		p.District = c.PostForm("district")
		p.State = c.PostForm("state")
		p.Pincode = c.PostForm("pincode")
		p.Country = c.PostForm("country")
		p.BasicSalary = parseFloatInput(c.PostForm("basic_salary"))
		p.Allowances = parseFloatInput(c.PostForm("allowances"))
		p.GrossSalary = parseFloatInput(c.PostForm("gross_salary"))
		p.EmploymentStatus = c.PostForm("employment_status")
		p.CRMPassword = c.PostForm("crm_password")
		p.StaffDocumentType = c.PostForm("staff_document_type")
		if sv := c.PostForm("status"); sv != "" {
			b, ok := parseStatusInput(sv)
			if !ok {
				return p, nil, nil, fmt.Errorf("invalid status value")
			}
			p.Status = &b
		}
		if pv := c.PostForm("portal_access"); pv != "" {
			if b, ok := parseBoolInput(pv); ok {
				p.PortalAccess = &b
			}
		}
		file, _ := c.FormFile("photo")
		docFile, _ := c.FormFile("document")
		return p, file, docFile, nil
	}

	if err := c.ShouldBindJSON(&p); err != nil {
		return p, nil, nil, err
	}
	return p, nil, nil, nil
}

func normalizeStaffPayload(p *staffPayload) {
	p.Name = strings.TrimSpace(p.Name)
	p.Email = strings.TrimSpace(p.Email)
	p.Phone = strings.TrimSpace(p.Phone)
	p.Role = strings.TrimSpace(p.Role)
	p.JoinDate = strings.TrimSpace(p.JoinDate)
	p.Notes = strings.TrimSpace(p.Notes)
	p.CountryCode = strings.TrimSpace(p.CountryCode)
	p.AltPhone = strings.TrimSpace(p.AltPhone)
	p.AltEmail = strings.TrimSpace(p.AltEmail)
	p.FamilyContactName = strings.TrimSpace(p.FamilyContactName)
	p.FamilyPhone = strings.TrimSpace(p.FamilyPhone)
	p.HouseStreet = strings.TrimSpace(p.HouseStreet)
	p.City = strings.TrimSpace(p.City)
	p.District = strings.TrimSpace(p.District)
	p.State = strings.TrimSpace(p.State)
	p.Pincode = strings.TrimSpace(p.Pincode)
	p.Country = strings.TrimSpace(p.Country)
	p.EmploymentStatus = strings.TrimSpace(p.EmploymentStatus)
	p.CRMPassword = strings.TrimSpace(p.CRMPassword)
	p.StaffDocumentType = strings.TrimSpace(p.StaffDocumentType)
}

func normalizeStaffRole(raw string) (string, bool) {
	v := strings.ToLower(strings.TrimSpace(raw))
	role, ok := allowedStaffRoles[v]
	return role, ok
}

func phoneInUse(hotelID uint, phone string, exceptID uint) (bool, error) {
	if strings.TrimSpace(phone) == "" {
		return false, nil
	}
	q := config.DB.Model(&models.Staff{}).Where("hotel_id = ? AND deleted_at IS NULL AND phone = ?", hotelID, phone)
	if exceptID > 0 {
		q = q.Where("id <> ?", exceptID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func activeAssignmentsForStaff(hotelID uint, staffID uint) (int64, error) {
	if staffID == 0 {
		return 0, nil
	}
	var count int64
	err := config.DB.Model(&models.Housekeeping{}).
		Joins("JOIN rooms r ON r.id = housekeepings.room_id").
		Where("r.hotel_id = ? AND r.deleted_at IS NULL AND housekeepings.status = ? AND housekeepings.staff_id = ?", hotelID, "in_progress", staffID).
		Count(&count).Error
	return count, err
}

func AddStaff(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")

	payload, photo, document, err := parseStaffPayload(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "Invalid payload"})
		return
	}
	normalizeStaffPayload(&payload)
	if payload.CountryCode == "" {
		payload.CountryCode = "+91"
	}
	if payload.Country == "" {
		payload.Country = "India"
	}
	if payload.EmploymentStatus == "" {
		payload.EmploymentStatus = "Working"
	}
	if normalizedType, ok := normalizeStaffDocumentType(payload.StaffDocumentType); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "invalid staff document type"})
		return
	} else {
		payload.StaffDocumentType = normalizedType
	}

	if payload.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "name is required"})
		return
	}
	if payload.Role == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "role is required"})
		return
	}
	if normalizedRole, ok := normalizeStaffRole(payload.Role); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "invalid role"})
		return
	} else {
		payload.Role = normalizedRole
	}
	if payload.Phone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "phone is required"})
		return
	}
	if inUse, e := phoneInUse(hotelID, payload.Phone, 0); e != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to validate phone"})
		return
	} else if inUse {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "phone already exists for this hotel"})
		return
	}

	status := true
	if payload.Status != nil {
		status = *payload.Status
	}
	portalAccess := status
	if payload.PortalAccess != nil {
		portalAccess = *payload.PortalAccess
	}
	if !staffRoleAllowsLogin(payload.Role) {
		portalAccess = false
		payload.CRMPassword = ""
	}
	grossSalary := payload.GrossSalary
	if grossSalary <= 0 {
		grossSalary = payload.BasicSalary + payload.Allowances
	}
	passwordHash := ""
	if payload.CRMPassword != "" {
		h, hashErr := bcrypt.GenerateFromPassword([]byte(payload.CRMPassword), bcrypt.DefaultCost)
		if hashErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to process password"})
			return
		}
		passwordHash = string(h)
	}

	s := models.Staff{
		HotelID:           hotelID,
		Name:              payload.Name,
		CountryCode:       payload.CountryCode,
		Email:             payload.Email,
		Phone:             payload.Phone,
		AltPhone:          payload.AltPhone,
		AltEmail:          payload.AltEmail,
		FamilyContactName: payload.FamilyContactName,
		FamilyPhone:       payload.FamilyPhone,
		HouseStreet:       payload.HouseStreet,
		City:              payload.City,
		District:          payload.District,
		State:             payload.State,
		Pincode:           payload.Pincode,
		Country:           payload.Country,
		Role:              payload.Role,
		JoinDate:          payload.JoinDate,
		StaffDocumentType: payload.StaffDocumentType,
		Notes:             payload.Notes,
		BasicSalary:       payload.BasicSalary,
		Allowances:        payload.Allowances,
		GrossSalary:       grossSalary,
		EmploymentStatus:  payload.EmploymentStatus,
		PortalAccess:      portalAccess,
		CRMPasswordHash:   passwordHash,
		Status:            status,
	}

	if photo != nil {
		photoURL, photoErr := uploadStaffPhoto(photo)
		if photoErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": photoErr.Error()})
			return
		}
		s.Photo = photoURL
	}
	if document != nil {
		if payload.StaffDocumentType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "staff document type is required"})
			return
		}
		docURL, docErr := uploadStaffDocument(document)
		if docErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": docErr.Error()})
			return
		}
		s.StaffDocument = docURL
	}

	if err := config.DB.Create(&s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to create staff"})
		return
	}
	utils.LogActivity(hotelID, "Staff", adminID, fmt.Sprintf("Staff created: %s", s.Name))
	c.JSON(http.StatusOK, gin.H{"status": true, "message": "Staff created", "data": s})
}

func ListStaff(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")

	page := 1
	if q := strings.TrimSpace(c.Query("page")); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 {
			page = n
		}
	}

	pageSize := 20
	if q := strings.TrimSpace(c.Query("page_size")); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 {
			if n > 200 {
				n = 200
			}
			pageSize = n
		}
	}
	if limitQ := strings.TrimSpace(c.Query("limit")); limitQ != "" {
		if n, err := strconv.Atoi(limitQ); err == nil && n > 0 {
			if n > 1000 {
				n = 1000
			}
			pageSize = n
			page = 1
		}
	}

	q := strings.TrimSpace(c.Query("q"))
	role := strings.TrimSpace(c.Query("role"))
	statusFilter := strings.ToLower(strings.TrimSpace(c.Query("status")))

	dbq := config.DB.Model(&models.Staff{}).Where("hotel_id = ? AND deleted_at IS NULL", hotelID)
	if q != "" {
		like := "%" + q + "%"
		dbq = dbq.Where("name ILIKE ? OR email ILIKE ? OR phone ILIKE ? OR role ILIKE ?", like, like, like, like)
	}
	if role != "" {
		dbq = dbq.Where("LOWER(role) = LOWER(?)", role)
	}
	if statusFilter != "" && statusFilter != "all" {
		active := statusFilter == "active" || statusFilter == "true" || statusFilter == "1"
		dbq = dbq.Where("status = ?", active)
	}

	var total int64
	if err := dbq.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to count staff"})
		return
	}

	var rows []models.Staff
	if err := dbq.Order("id desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to fetch staff"})
		return
	}

	countByID := map[uint]int64{}
	ids := make([]uint, 0, len(rows))
	for _, s := range rows {
		ids = append(ids, s.ID)
	}
	if len(ids) > 0 {
		type assignmentRow struct {
			StaffID uint
			Cnt     int64
		}
		var aggs []assignmentRow
		_ = config.DB.Model(&models.Housekeeping{}).
			Select("housekeepings.staff_id, COUNT(*) AS cnt").
			Joins("JOIN rooms r ON r.id = housekeepings.room_id").
			Where("r.hotel_id = ? AND r.deleted_at IS NULL AND housekeepings.status = ? AND housekeepings.staff_id IN ?", hotelID, "in_progress", ids).
			Group("housekeepings.staff_id").
			Scan(&aggs).Error
		for _, a := range aggs {
			countByID[a.StaffID] = a.Cnt
		}
	}

	items := make([]gin.H, 0, len(rows))
	for _, s := range rows {
		var openShift models.StaffShift
		openShiftQuery := config.DB.
			Where("hotel_id = ? AND staff_id = ? AND status = ? AND deleted_at IS NULL", hotelID, s.ID, "open").
			Order("id desc").
			Limit(1).
			Find(&openShift)
		hasOpenShift := openShiftQuery.Error == nil && openShiftQuery.RowsAffected > 0

		items = append(items, gin.H{
			"id":                  s.ID,
			"hotel_id":            s.HotelID,
			"name":                s.Name,
			"country_code":        s.CountryCode,
			"email":               s.Email,
			"phone":               s.Phone,
			"alt_phone":           s.AltPhone,
			"alt_email":           s.AltEmail,
			"family_contact_name": s.FamilyContactName,
			"family_phone":        s.FamilyPhone,
			"house_street":        s.HouseStreet,
			"city":                s.City,
			"district":            s.District,
			"state":               s.State,
			"pincode":             s.Pincode,
			"country":             s.Country,
			"role":                s.Role,
			"photo":               s.Photo,
			"staff_document":      s.StaffDocument,
			"staff_document_type": s.StaffDocumentType,
			"notes":               s.Notes,
			"basic_salary":        s.BasicSalary,
			"allowances":          s.Allowances,
			"gross_salary":        s.GrossSalary,
			"employment_status":   s.EmploymentStatus,
			"portal_access":       s.PortalAccess,
			"status":              s.Status,
			"join_date":           s.JoinDate,
			"created_at":          s.CreatedAt,
			"updated_at":          s.UpdatedAt,
			"active_assignments":  countByID[s.ID],
			"status_label":        map[bool]string{true: "active", false: "inactive"}[s.Status],
			"has_open_shift":      hasOpenShift,
			"shift_status":        map[bool]string{true: "checked_in", false: "checked_out"}[hasOpenShift],
			"last_check_in_at":    openShift.CheckInAt,
			"last_shift_date":     openShift.ShiftDate,
		})
	}

	c.JSON(http.StatusOK, gin.H{"status": true, "data": gin.H{"items": items, "total": total, "page": page, "page_size": pageSize}})
}

func GetStaff(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	idNum, convErr := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if convErr != nil || idNum == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "invalid staff id"})
		return
	}

	var s models.Staff
	if err := config.DB.First(&s, uint(idNum)).Error; err != nil || s.HotelID != hotelID {
		c.JSON(http.StatusNotFound, gin.H{"status": false, "error": "Staff not found"})
		return
	}

	name := strings.TrimSpace(s.Name)
	var currentAssignments []staffCurrentAssignmentRow
	if name != "" {
		_ = config.DB.Table("housekeepings h").
			Select("h.id, h.room_id, r.room_number, h.status, h.assigned_to, h.start_time, h.notes").
			Joins("JOIN rooms r ON r.id = h.room_id").
			Where("r.hotel_id = ? AND r.deleted_at IS NULL AND h.status = ? AND TRIM(h.assigned_to) = ?", hotelID, "in_progress", name).
			Order("h.id desc").
			Scan(&currentAssignments).Error
	}

	var history []models.HousekeepingHistory
	if name != "" {
		_ = config.DB.Where("hotel_id = ? AND TRIM(assigned_to) = ?", hotelID, name).Order("id desc").Limit(200).Find(&history).Error
	}

	c.JSON(http.StatusOK, gin.H{"status": true, "data": gin.H{"staff": s, "current_assignments": currentAssignments, "history": history}})
}

func GetStaffHistory(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	id := c.Param("id")
	limit := 100
	if q := strings.TrimSpace(c.Query("limit")); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 {
			if n > 1000 {
				n = 1000
			}
			limit = n
		}
	}

	var s models.Staff
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", id, hotelID).First(&s).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"status": false, "error": "Staff not found"})
		return
	}

	var rows []models.HousekeepingHistory
	if err := config.DB.Where("hotel_id = ? AND TRIM(assigned_to) = ?", hotelID, strings.TrimSpace(s.Name)).Order("id desc").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to fetch history"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": true, "data": gin.H{"items": rows, "total": len(rows)}})
}

func UpdateStaff(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	id := c.Param("id")
	var s models.Staff
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", id, hotelID).First(&s).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"status": false, "error": "Staff not found"})
		return
	}

	payload, photo, document, err := parseStaffPayload(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "Invalid payload"})
		return
	}
	normalizeStaffPayload(&payload)
	if payload.CountryCode == "" {
		payload.CountryCode = s.CountryCode
		if payload.CountryCode == "" {
			payload.CountryCode = "+91"
		}
	}
	if payload.Country == "" {
		payload.Country = s.Country
		if payload.Country == "" {
			payload.Country = "India"
		}
	}
	if payload.EmploymentStatus == "" {
		payload.EmploymentStatus = s.EmploymentStatus
		if payload.EmploymentStatus == "" {
			payload.EmploymentStatus = "Working"
		}
	}
	if normalizedType, ok := normalizeStaffDocumentType(payload.StaffDocumentType); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "invalid staff document type"})
		return
	} else {
		payload.StaffDocumentType = normalizedType
	}
	if payload.StaffDocumentType == "" {
		payload.StaffDocumentType = s.StaffDocumentType
	}

	if payload.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "name is required"})
		return
	}
	if payload.Role == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "role is required"})
		return
	}
	if normalizedRole, ok := normalizeStaffRole(payload.Role); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "invalid role"})
		return
	} else {
		payload.Role = normalizedRole
	}
	if payload.Phone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "phone is required"})
		return
	}
	if inUse, e := phoneInUse(hotelID, payload.Phone, s.ID); e != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to validate phone"})
		return
	} else if inUse {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "phone already exists for this hotel"})
		return
	}

	status := s.Status
	if payload.Status != nil {
		status = *payload.Status
	}
	portalAccess := s.PortalAccess
	if payload.PortalAccess != nil {
		portalAccess = *payload.PortalAccess
	}
	if !staffRoleAllowsLogin(payload.Role) {
		portalAccess = false
		payload.CRMPassword = ""
	}
	grossSalary := payload.GrossSalary
	if grossSalary <= 0 {
		grossSalary = payload.BasicSalary + payload.Allowances
	}

	updates := map[string]interface{}{
		"name":                payload.Name,
		"country_code":        payload.CountryCode,
		"email":               payload.Email,
		"phone":               payload.Phone,
		"alt_phone":           payload.AltPhone,
		"alt_email":           payload.AltEmail,
		"family_contact_name": payload.FamilyContactName,
		"family_phone":        payload.FamilyPhone,
		"house_street":        payload.HouseStreet,
		"city":                payload.City,
		"district":            payload.District,
		"state":               payload.State,
		"pincode":             payload.Pincode,
		"country":             payload.Country,
		"role":                payload.Role,
		"staff_document_type": payload.StaffDocumentType,
		"status":              status,
		"portal_access":       portalAccess,
		"employment_status":   payload.EmploymentStatus,
		"basic_salary":        payload.BasicSalary,
		"allowances":          payload.Allowances,
		"gross_salary":        grossSalary,
		"join_date":           payload.JoinDate,
		"notes":               payload.Notes,
	}
	if payload.CRMPassword != "" {
		h, hashErr := bcrypt.GenerateFromPassword([]byte(payload.CRMPassword), bcrypt.DefaultCost)
		if hashErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to process password"})
			return
		}
		updates["crm_password_hash"] = string(h)
	}
	if photo != nil {
		newPhoto, photoErr := uploadStaffPhoto(photo)
		if photoErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": photoErr.Error()})
			return
		}
		updates["photo"] = newPhoto
	}
	if document != nil {
		if payload.StaffDocumentType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "staff document type is required"})
			return
		}
		newDoc, docErr := uploadStaffDocument(document)
		if docErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": docErr.Error()})
			return
		}
		updates["staff_document"] = newDoc
	}
	oldPhoto := s.Photo
	oldDocument := s.StaffDocument
	oldName := strings.TrimSpace(s.Name)
	newName := payload.Name

	if err := config.DB.Model(&s).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to update staff"})
		return
	}

	if oldName != "" && newName != "" && oldName != newName {
		_ = config.DB.Model(&models.Housekeeping{}).Where("TRIM(assigned_to) = ?", oldName).Update("assigned_to", newName).Error
		_ = config.DB.Model(&models.HousekeepingHistory{}).Where("hotel_id = ? AND TRIM(assigned_to) = ?", hotelID, oldName).Update("assigned_to", newName).Error
	}

	if err := config.DB.First(&s, s.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to load updated staff"})
		return
	}

	if strings.TrimSpace(oldPhoto) != "" && oldPhoto != s.Photo {
		removeLocalUpload(oldPhoto)
	}
	if strings.TrimSpace(oldDocument) != "" && oldDocument != s.StaffDocument {
		removeLocalUpload(oldDocument)
	}

	utils.LogActivity(hotelID, "Staff", adminID, fmt.Sprintf("Staff updated: %s", s.Name))
	c.JSON(http.StatusOK, gin.H{"status": true, "message": "Staff updated", "data": s})
}

func DeleteStaff(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	adminID := c.GetUint("admin_id")
	id := c.Param("id")
	var s models.Staff
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", id, hotelID).First(&s).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"status": false, "error": "Staff not found"})
		return
	}
	if activeCount, err := activeAssignmentsForStaff(hotelID, s.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to check assignments"})
		return
	} else if activeCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "Cannot delete staff with active room assignments"})
		return
	}
	if err := config.DB.Delete(&s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to delete staff"})
		return
	}
	removeLocalUpload(s.Photo)
	removeLocalUpload(s.StaffDocument)
	utils.LogActivity(hotelID, "Staff", adminID, fmt.Sprintf("Staff deleted: %s", s.Name))
	c.JSON(http.StatusOK, gin.H{"status": true, "message": "Staff deleted"})
}
