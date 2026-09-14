package utils

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"time"
)

// GenerateOTP returns a 6-digit OTP string in range 100000-999999.
// It prefers crypto/rand and falls back to a time-based value if needed.
func GenerateOTP() string {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err == nil {
		return fmt.Sprintf("%06d", n.Int64()+100000)
	}
	x := time.Now().UnixNano() % 900000
	if x < 0 {
		x = -x
	}
	return fmt.Sprintf("%06d", x+100000)
}
