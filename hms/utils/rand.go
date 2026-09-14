package utils

import "math/rand"

// RandomInt returns a random int64 for use in filename generation.
// Uses the global rand source (Go 1.20+ auto-seeded).
func RandomInt() int64 {
	return rand.Int63n(99999999)
}
