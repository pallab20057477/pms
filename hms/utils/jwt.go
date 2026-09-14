package utils

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// HotelFeatures holds feature flags embedded directly in the JWT token
type HotelFeatures struct {
	OnlinePayment   bool `json:"online_payment"`
	Reports         bool `json:"reports"`
	StaffPayroll    bool `json:"staff_payroll"`
	Housekeeping    bool `json:"housekeeping"`
	EmailNotify     bool `json:"email_notify"`
	SeasonalPricing bool `json:"seasonal_pricing"`
}

type Claims struct {
	AdminID          uint          `json:"admin_id"`
	ActiveHotelID    uint          `json:"active_hotel_id"`
	SubscriptionTier string        `json:"subscription_tier"`
	Features         HotelFeatures `json:"features"`
	Role             string        `json:"role"` // "admin" | "super_admin" | "guest"
	jwt.RegisteredClaims
}

// GuestClaims is the JWT payload for PublicUser portal tokens
type GuestClaims struct {
	PublicUserID uint   `json:"public_user_id"`
	Email        string `json:"email"`
	Role         string `json:"role"` // always "guest"
	jwt.RegisteredClaims
}

// GenerateGuestJWT creates a signed JWT for a portal PublicUser with jti for blacklisting
func GenerateGuestJWT(userID uint, email string) (string, string, error) {
	jti := RandomString(32)
	claims := &GuestClaims{
		PublicUserID: userID,
		Email:        email,
		Role:         "guest",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(72 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(jwtSecret())
	return signed, jti, err
}

// ParseGuestJWT parses and validates a guest portal JWT
func ParseGuestJWT(tokenStr string) (*GuestClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &GuestClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret(), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*GuestClaims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	if claims.Role != "guest" {
		return nil, errors.New("not a guest token")
	}
	return claims, nil
}

func jwtSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		panic("JWT_SECRET environment variable is not set")
	}
	return []byte(secret)
}

// GenerateJWT creates a token with default features (backward compat)
func GenerateJWT(adminID, hotelID uint) (string, error) {
	return GenerateJWTWithFeatures(adminID, hotelID, HotelFeatures{
		Reports:      true,
		Housekeeping: true,
	})
}

// GenerateJWTWithFeatures creates a token with hotel feature flags embedded
func GenerateJWTWithFeatures(adminID, hotelID uint, features HotelFeatures) (string, error) {
	return GenerateJWTWithPlan(adminID, hotelID, "", features)
}

func GenerateJWTWithPlan(adminID, hotelID uint, tier string, features HotelFeatures) (string, error) {
	claims := &Claims{
		AdminID:          adminID,
		ActiveHotelID:    hotelID,
		SubscriptionTier: tier,
		Features:         features,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(12 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret())
}

func ParseJWT(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret(), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	if claims.AdminID == 0 {
		return nil, errors.New("invalid token: missing admin_id")
	}
	return claims, nil
}

// ParseJWTRaw parses without checking admin_id (used for super admin tokens)
func ParseJWTRaw(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret(), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}
