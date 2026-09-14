package utils

import (
	"crypto/rand"
	"math/big"
)

var letters = []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

// RandomString returns a securely generated random string of length n.
func RandomString(n int) string {
	if n <= 0 {
		return ""
	}
	b := make([]rune, n)
	max := big.NewInt(int64(len(letters)))
	for i := 0; i < n; i++ {
		num, err := rand.Int(rand.Reader, max)
		if err != nil {
			// fallback to 'a' on error
			b[i] = 'a'
			continue
		}
		b[i] = letters[num.Int64()]
	}
	return string(b)
}
