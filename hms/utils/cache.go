package utils

import (
	"context"
	"encoding/json"
	"hms/config"
	"log"
	"time"
)

// SetCache sets a generic interface to Redis as JSON
func SetCache(ctx context.Context, key string, value interface{}, expiration time.Duration) {
	if !config.RedisAvailable() {
		return
	}
	bytes, err := json.Marshal(value)
	if err != nil {
		log.Printf("Failed to marshal cache for key %s: %v", key, err)
		return
	}
	if err := config.RDB.Set(ctx, key, bytes, expiration).Err(); err != nil {
		log.Printf("Failed to set cache for key %s: %v", key, err)
	}
}

// GetCache retrieves a value from Redis and unmarshals it into dest.
// Returns true if found, false if not found or error.
func GetCache(ctx context.Context, key string, dest interface{}) bool {
	if !config.RedisAvailable() {
		return false
	}
	val, err := config.RDB.Get(ctx, key).Result()
	if err != nil {
		return false
	}
	if err := json.Unmarshal([]byte(val), dest); err != nil {
		log.Printf("Failed to unmarshal cache for key %s: %v", key, err)
		return false
	}
	return true
}

// InvalidateCache deletes one or more keys from Redis
func InvalidateCache(ctx context.Context, keys ...string) {
	if !config.RedisAvailable() || len(keys) == 0 {
		return
	}
	if err := config.RDB.Del(ctx, keys...).Err(); err != nil {
		log.Printf("Failed to invalidate cache keys %v: %v", keys, err)
	}
}
