package config

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client

func ConnectRedis() {
	addr := strings.TrimSpace(os.Getenv("REDIS_ADDR"))
	if addr == "" {
		addr = os.Getenv("REDIS_ADDR")
		if addr == "" {
			addr = "localhost:6379"
		}
	}
	password := os.Getenv("REDIS_PASSWORD")

	RDB = redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           0,
		PoolSize:     20,               // enterprise pool — 20 connections
		MinIdleConns: 5,               // keep 5 idle connections warm
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolTimeout:  4 * time.Second,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := RDB.Ping(ctx).Err(); err != nil {
		log.Printf("[redis] WARNING: could not connect to Redis at %s: %v — caching disabled", addr, err)
		RDB = nil
		return
	}
	log.Printf("[redis] connected to %s (pool=20, minIdle=5)", addr)
}

// RedisAvailable returns true if Redis is connected.
func RedisAvailable() bool {
	return RDB != nil
}

// CacheGet retrieves a cached value and unmarshals it into dest.
// Returns false if the key doesn't exist, Redis is unavailable, or unmarshaling fails.
func CacheGet(ctx context.Context, key string, dest interface{}) bool {
	if !RedisAvailable() {
		return false
	}
	val, err := RDB.Get(ctx, key).Result()
	if err != nil {
		return false
	}
	if err := json.Unmarshal([]byte(val), dest); err != nil {
		log.Printf("[redis] CacheGet unmarshal error for key=%s: %v", key, err)
		return false
	}
	return true
}

// CacheSet serializes value to JSON and stores it with the given TTL.
// Silently skips if Redis is unavailable or marshaling fails.
func CacheSet(ctx context.Context, key string, value interface{}, ttl time.Duration) {
	if !RedisAvailable() {
		return
	}
	b, err := json.Marshal(value)
	if err != nil {
		log.Printf("[redis] CacheSet marshal error for key=%s: %v", key, err)
		return
	}
	if err := RDB.Set(ctx, key, b, ttl).Err(); err != nil {
		log.Printf("[redis] CacheSet write error for key=%s: %v", key, err)
	}
}

// CacheDelete removes one or more keys from Redis.
// Silently skips if Redis is unavailable.
func CacheDelete(ctx context.Context, keys ...string) {
	if !RedisAvailable() || len(keys) == 0 {
		return
	}
	if err := RDB.Del(ctx, keys...).Err(); err != nil {
		log.Printf("[redis] CacheDelete error for keys=%v: %v", keys, err)
	}
}

// CacheDeletePattern removes all keys matching a glob pattern.
// Use cautiously — scans all keys. Prefer for low-frequency invalidation.
func CacheDeletePattern(ctx context.Context, pattern string) {
	if !RedisAvailable() {
		return
	}
	iter := RDB.Scan(ctx, 0, pattern, 0).Iterator()
	var keys []string
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if err := iter.Err(); err != nil {
		log.Printf("[redis] CacheDeletePattern scan error for pattern=%s: %v", pattern, err)
		return
	}
	if len(keys) > 0 {
		if err := RDB.Del(ctx, keys...).Err(); err != nil {
			log.Printf("[redis] CacheDeletePattern delete error: %v", err)
		}
	}
}
