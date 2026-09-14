package tests

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"hms/config"
	"hms/routes"

	"github.com/gin-gonic/gin"
)

// NOTE: This test requires a running test DB configured in environment variables.
// It demonstrates concurrent booking attempts to the same room.
func TestConcurrentBookings(t *testing.T) {
	if strings.TrimSpace(os.Getenv("DB_HOST")) == "" {
		t.Skip("Skipping: DB_HOST not set for integration test")
	}
	config.ConnectDB()
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	routes.RegisterRoutes(r)

	server := httptest.NewServer(r)
	defer server.Close()

	var wg sync.WaitGroup
	success := 0
	attempts := 5
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			payload := `{"guest_id":1,"room_id":1,"check_in_date":"2026-04-01","check_out_date":"2026-04-02","base_rate":100}`
			req, _ := http.NewRequest("POST", server.URL+"/api/bookings", strings.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			// set auth header or cookie if required for tests
			res, err := http.DefaultClient.Do(req)
			if err == nil && res.StatusCode == 201 {
				success++
			}
		}()
	}
	wg.Wait()
	if success > 1 {
		t.Fatalf("Expected at most 1 success, got %d", success)
	}
}
