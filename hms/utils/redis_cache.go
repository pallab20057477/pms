package utils

import (
	"context"
	"encoding/json"
	"hms/config"
	"time"
)

var ctx = context.Background()

// CacheSet stores a value as JSON in Redis with a TTL.
func CacheSet(key string, value interface{}, ttl time.Duration) {
	if !config.RedisAvailable() {
		return
	}
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	config.RDB.Set(ctx, key, data, ttl)
}

// CacheGet retrieves and unmarshals a cached value. Returns false if miss.
func CacheGet(key string, dest interface{}) bool {
	if !config.RedisAvailable() {
		return false
	}
	data, err := config.RDB.Get(ctx, key).Bytes()
	if err != nil {
		return false
	}
	return json.Unmarshal(data, dest) == nil
}

// CacheDel deletes one or more keys.
func CacheDel(keys ...string) {
	if !config.RedisAvailable() {
		return
	}
	config.RDB.Del(ctx, keys...)
}

// CacheDelPattern deletes all keys matching a pattern (e.g. "hotels:*").
func CacheDelPattern(pattern string) {
	if !config.RedisAvailable() {
		return
	}
	iter := config.RDB.Scan(ctx, 0, pattern, 0).Iterator()
	var keys []string
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if len(keys) > 0 {
		config.RDB.Del(ctx, keys...)
	}
}

// RateLimit checks and increments a counter key. Returns (allowed, current count).
// First call sets TTL; subsequent calls within window just increment.
func RateLimit(key string, limit int64, window time.Duration) (bool, int64) {
	if !config.RedisAvailable() {
		return true, 0 // if Redis down, allow through
	}
	count, err := config.RDB.Incr(ctx, key).Result()
	if err != nil {
		return true, 0
	}
	if count == 1 {
		config.RDB.Expire(ctx, key, window)
	}
	return count <= limit, count
}

// OTPSet stores an OTP in Redis with TTL.
func OTPSet(key string, otp string, ttl time.Duration) {
	if !config.RedisAvailable() {
		return
	}
	config.RDB.Set(ctx, key, otp, ttl)
}

// OTPGet retrieves an OTP from Redis.
func OTPGet(key string) (string, bool) {
	if !config.RedisAvailable() {
		return "", false
	}
	val, err := config.RDB.Get(ctx, key).Result()
	if err != nil {
		return "", false
	}
	return val, true
}

// OTPDel removes an OTP key after verification.
func OTPDel(key string) {
	if !config.RedisAvailable() {
		return
	}
	config.RDB.Del(ctx, key)
}

// JWTBlacklist adds a jti to the blacklist with remaining TTL.
func JWTBlacklist(jti string, ttl time.Duration) {
	if !config.RedisAvailable() {
		return
	}
	config.RDB.Set(ctx, "blacklist:jwt:"+jti, "1", ttl)
}

// JWTIsBlacklisted returns true if the jti is blacklisted.
func JWTIsBlacklisted(jti string) bool {
	if !config.RedisAvailable() {
		return false
	}
	exists, err := config.RDB.Exists(ctx, "blacklist:jwt:"+jti).Result()
	return err == nil && exists > 0
}
