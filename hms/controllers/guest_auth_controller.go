package controllers

import (
	"encoding/json"
	"fmt"
	"hms/config"
	"hms/models"
	"hms/utils"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// ── helpers ──────────────────────────────────────────────────────────────────

func validatePassword(p string) error {
	if len(p) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	var hasNum, hasSpecial bool
	for _, c := range p {
		if unicode.IsDigit(c) {
			hasNum = true
		}
		if !unicode.IsLetter(c) && !unicode.IsDigit(c) {
			hasSpecial = true
		}
	}
	if !hasNum {
		return fmt.Errorf("password must contain at least one number")
	}
	if !hasSpecial {
		return fmt.Errorf("password must contain at least one special character")
	}
	return nil
}

var emailRe = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

func normalizePhoneDigits(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func guestTokenResponse(user *models.PublicUser) (gin.H, error) {
	token, _, err := utils.GenerateGuestJWT(user.ID, user.Email)
	if err != nil {
		return nil, err
	}
	return gin.H{
		"token": token,
		"user": gin.H{
			"id":             user.ID,
			"name":           user.Name,
			"email":          user.Email,
			"phone":          user.Phone,
			"email_verified": user.EmailVerified,
			"provider":       user.Provider,
		},
	}, nil
}

// ── POST /api/public/auth/register ───────────────────────────────────────────

func GuestRegister(c *gin.Context) {
	// Rate limit: 5 registrations per IP per hour
	ip := c.ClientIP()
	if allowed, _ := utils.RateLimit("ratelimit:register:"+ip, 5, time.Hour); !allowed {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many registration attempts. Try again later."})
		return
	}

	var req struct {
		Name            string `json:"name" binding:"required"`
		Email           string `json:"email" binding:"required"`
		Phone           string `json:"phone"`
		Password        string `json:"password" binding:"required"`
		ConfirmPassword string `json:"confirm_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Name = strings.TrimSpace(req.Name)

	if !emailRe.MatchString(req.Email) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email address"})
		return
	}
	if req.Password != req.ConfirmPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Passwords do not match"})
		return
	}
	if err := validatePassword(req.Password); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check existing
	var existing models.PublicUser
	if err := config.DB.Where("email = ?", req.Email).First(&existing).Error; err == nil {
		if existing.Provider == "google" {
			c.JSON(http.StatusConflict, gin.H{"error": "This email is registered via Google. Please login with Google."})
		} else {
			c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		}
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process password"})
		return
	}

	user := models.PublicUser{
		Name:          req.Name,
		Email:         req.Email,
		Phone:         strings.TrimSpace(req.Phone),
		PasswordHash:  string(hash),
		Provider:      "local",
		EmailVerified: true,
	}
	if err := config.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
		return
	}

	resp, err := guestTokenResponse(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	c.JSON(http.StatusCreated, resp)
}

// ── POST /api/public/auth/verify-email ───────────────────────────────────────

func GuestVerifyEmail(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
		OTP   string `json:"otp" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	var user models.PublicUser
	if err := config.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	_ = req.OTP
	config.DB.Model(&user).Update("email_verified", true)
	user.EmailVerified = true

	resp, err := guestTokenResponse(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ── POST /api/public/auth/resend-otp ─────────────────────────────────────────

func GuestResendOTP(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	var user models.PublicUser
	if err := config.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "If that email exists, it can sign in without OTP."})
		return
	}
	config.DB.Model(&user).Update("email_verified", true)
	c.JSON(http.StatusOK, gin.H{"message": "OTP is no longer required for guest accounts."})
}

// ── POST /api/public/auth/login ───────────────────────────────────────────────

func GuestLogin(c *gin.Context) {
	ip := c.ClientIP()
	if allowed, _ := utils.RateLimit("ratelimit:login:"+ip, 10, 15*time.Minute); !allowed {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many login attempts. Try again in 15 minutes."})
		return
	}

	var req struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	var user models.PublicUser
	if err := config.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	if user.Provider == "google" && user.PasswordHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This account uses Google login. Please sign in with Google."})
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	if !user.EmailVerified {
		config.DB.Model(&user).Update("email_verified", true)
		user.EmailVerified = true
	}

	resp, err := guestTokenResponse(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ── POST /api/public/auth/google ─────────────────────────────────────────────

func GuestGoogleLogin(c *gin.Context) {
	var req struct {
		Token     string `json:"token" binding:"required"` // Google credential (id_token) from frontend
		TokenType string `json:"token_type"`               // "id_token" (default) or "access_token"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var gInfo *googleTokenInfo
	var err error

	// Support both id_token (credential flow) and access_token (implicit flow)
	if req.TokenType == "access_token" {
		gInfo, err = verifyGoogleAccessToken(req.Token)
	} else {
		gInfo, err = verifyGoogleToken(req.Token)
	}
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid Google token"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(gInfo.Email))
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Could not retrieve email from Google"})
		return
	}

	var user models.PublicUser
	err = config.DB.Where("email = ?", email).First(&user).Error

	if err != nil {
		// New user — create
		user = models.PublicUser{
			Name:          gInfo.Name,
			Email:         email,
			Provider:      "google",
			ProviderID:    gInfo.Sub,
			EmailVerified: true,
		}
		if err := config.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
			return
		}
	} else {
		// Existing user — link google if local account
		updates := map[string]interface{}{"email_verified": true}
		if user.Provider == "local" {
			updates["provider_id"] = gInfo.Sub
		}
		config.DB.Model(&user).Updates(updates)
		user.EmailVerified = true
	}

	resp, err := guestTokenResponse(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ── POST /api/public/auth/logout (protected) ─────────────────────────────────

func GuestLogout(c *gin.Context) {
	jti := c.GetString("guest_jti")
	if jti != "" {
		// Blacklist for 72h (token lifetime)
		utils.JWTBlacklist(jti, 72*time.Hour)
	}
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// ── GET /api/public/auth/me (protected) ──────────────────────────────────────

func GuestMe(c *gin.Context) {
	userID := c.GetUint("public_user_id")
	var user models.PublicUser
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":             user.ID,
		"name":           user.Name,
		"email":          user.Email,
		"phone":          user.Phone,
		"email_verified": user.EmailVerified,
		"provider":       user.Provider,
	})
}

// ── PUT /api/public/auth/profile (protected) ─────────────────────────────────

func GuestUpdateProfile(c *gin.Context) {
	userID := c.GetUint("public_user_id")
	var req struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.PublicUser
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	updates := map[string]interface{}{}
	if name := strings.TrimSpace(req.Name); name != "" {
		updates["name"] = name
		user.Name = name
	}
	if phone := strings.TrimSpace(req.Phone); phone != "" {
		if digits := normalizePhoneDigits(phone); len(digits) < 8 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Enter a valid mobile number"})
			return
		}
		updates["phone"] = phone
		user.Phone = phone
	}
	if len(updates) > 0 {
		if err := config.DB.Model(&user).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":             user.ID,
		"name":           user.Name,
		"email":          user.Email,
		"phone":          user.Phone,
		"email_verified": user.EmailVerified,
		"provider":       user.Provider,
	})
}

// ── GET /api/public/auth/hotel-guest-profile (protected) ─────────────────────

func GuestHotelProfile(c *gin.Context) {
	userID := c.GetUint("public_user_id")
	hotelID64, err := strconv.ParseUint(strings.TrimSpace(c.Query("hotel_id")), 10, 32)
	if err != nil || hotelID64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hotel_id is required"})
		return
	}
	hotelID := uint(hotelID64)

	var user models.PublicUser
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	response := gin.H{
		"name":          user.Name,
		"email":         user.Email,
		"phone":         user.Phone,
		"matched_guest": false,
	}

	conditions := []string{}
	args := []interface{}{}
	if email := strings.ToLower(strings.TrimSpace(user.Email)); email != "" {
		conditions = append(conditions, "LOWER(email) = ?")
		args = append(args, email)
	}
	if digits := normalizePhoneDigits(user.Phone); digits != "" {
		conditions = append(conditions, "regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = ?")
		args = append(args, digits)
	}
	if len(conditions) == 0 {
		c.JSON(http.StatusOK, response)
		return
	}

	var guest models.Guest
	err = config.DB.
		Where("hotel_id = ? AND deleted_at IS NULL", hotelID).
		Where("("+strings.Join(conditions, " OR ")+")", args...).
		Order("updated_at DESC, id DESC").
		First(&guest).Error
	if err == nil {
		response["name"] = guest.Name
		response["email"] = guest.Email
		response["phone"] = guest.Phone
		response["city"] = guest.City
		response["state"] = guest.State
		response["pincode"] = guest.Pincode
		response["matched_guest"] = true
	}

	c.JSON(http.StatusOK, response)
}

// ── GET /api/public/auth/my-bookings (protected) ─────────────────────────────

func GuestMyBookings(c *gin.Context) {
	userID := c.GetUint("public_user_id")

	var user models.PublicUser
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Keep backward compatibility with older bookings that were linked only
	// through the hotel-scoped Guest record.
	guestConditions := []string{}
	guestArgs := []interface{}{}
	if email := strings.ToLower(strings.TrimSpace(user.Email)); email != "" {
		guestConditions = append(guestConditions, "LOWER(email) = ?")
		guestArgs = append(guestArgs, email)
	}
	if digits := normalizePhoneDigits(user.Phone); digits != "" {
		guestConditions = append(guestConditions, "regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = ?")
		guestArgs = append(guestArgs, digits)
	}

	var guestIDs []uint
	if len(guestConditions) > 0 {
		config.DB.Model(&models.Guest{}).
			Where("deleted_at IS NULL").
			Where("("+strings.Join(guestConditions, " OR ")+")", guestArgs...).
			Pluck("id", &guestIDs)
	}

	type bookingRow struct {
		ID           uint    `json:"id"`
		BookingCode  string  `json:"booking_code"`
		HotelName    string  `json:"hotel_name"`
		HotelID      uint    `json:"hotel_id"`
		RoomNumber   string  `json:"room_number"`
		RoomType     string  `json:"room_type"`
		CheckInDate  string  `json:"check_in_date"`
		CheckOutDate string  `json:"check_out_date"`
		Status       string  `json:"status"`
		TotalAmount  float64 `json:"total_amount"`
		CreatedAt    int64   `json:"created_at"`
	}

	bookingWhere := "b.public_user_id = ?"
	bookingArgs := []interface{}{user.ID}
	if len(guestIDs) > 0 {
		bookingWhere = "(" + bookingWhere + " OR b.guest_id IN ?)"
		bookingArgs = append(bookingArgs, guestIDs)
	}

	rows, err := config.DB.Raw(fmt.Sprintf(`
		SELECT b.id, b.booking_code, h.name as hotel_name, h.id as hotel_id,
		       COALESCE(r.room_number, '') as room_number,
		       COALESCE(rt.name, '') as room_type,
		       b.check_in_date, b.check_out_date,
		       b.status, (b.total_amount + b.tax) as total_amount,
		       b.created_at
		FROM bookings b
		JOIN hotels h ON h.id = b.hotel_id
		LEFT JOIN rooms r ON r.id = b.room_id
		LEFT JOIN room_types rt ON rt.id = b.room_type_id
		WHERE %s AND b.deleted_at IS NULL
		ORDER BY b.created_at DESC
	`, bookingWhere), bookingArgs...).Rows()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bookings"})
		return
	}
	defer rows.Close()

	var bookings []bookingRow
	for rows.Next() {
		var row bookingRow
		var checkIn, checkOut time.Time
		if err := rows.Scan(&row.ID, &row.BookingCode, &row.HotelName,
			&row.HotelID, &row.RoomNumber, &row.RoomType,
			&checkIn, &checkOut, &row.Status, &row.TotalAmount, &row.CreatedAt); err != nil {
			continue
		}
		row.CheckInDate = checkIn.Format("2006-01-02")
		row.CheckOutDate = checkOut.Format("2006-01-02")
		bookings = append(bookings, row)
	}
	if bookings == nil {
		bookings = []bookingRow{}
	}
	c.JSON(http.StatusOK, gin.H{"bookings": bookings})
}

// ── internal helpers ──────────────────────────────────────────────────────────

type googleTokenInfo struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Aud   string `json:"aud"` // must match GOOGLE_CLIENT_ID
}

func verifyGoogleToken(idToken string) (*googleTokenInfo, error) {
	resp, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(idToken))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("google token invalid: %s", string(body))
	}
	var info googleTokenInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, err
	}
	// Validate audience — token must be issued for our app
	clientID := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID"))
	if clientID != "" && info.Aud != clientID {
		return nil, fmt.Errorf("google token audience mismatch: got %s", info.Aud)
	}
	return &info, nil
}

// verifyGoogleAccessToken uses the userinfo endpoint for access_token flow
func verifyGoogleAccessToken(accessToken string) (*googleTokenInfo, error) {
	req, err := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("google userinfo invalid: %s", string(body))
	}
	var info googleTokenInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, err
	}
	// For access_token flow, we can't check aud from userinfo — that's fine,
	// the token was already validated by Google's OAuth server when issued.
	return &info, nil
}

func sendVerificationEmail(email, name, otp string) {
	html := fmt.Sprintf(`
<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:32px;">
<table width="520" style="background:#fff;border-radius:10px;padding:32px;margin:0 auto;">
<tr><td align="center" style="background:#0d8b79;padding:20px;border-radius:8px 8px 0 0;">
  <h2 style="color:#fff;margin:0;">Verify Your Email</h2>
</td></tr>
<tr><td style="padding:24px;">
  <p>Hi <strong>%s</strong>,</p>
  <p>Use the OTP below to verify your email address. It expires in <strong>10 minutes</strong>.</p>
  <div style="text-align:center;margin:24px 0;">
    <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#0d8b79;font-family:monospace;">%s</span>
  </div>
  <p style="color:#888;font-size:12px;">If you didn't request this, ignore this email.</p>
</td></tr>
</table>
</body></html>`, name, otp)

	if err := utils.SendEmailWithInlineImages(email, "Verify your email — OTP: "+otp, html, nil); err != nil {
		log.Printf("[guest_auth] failed to send verification email to %s: %v", email, err)
	}
}
