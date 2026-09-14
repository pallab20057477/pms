package controllers

import (
	"fmt"
	"math/rand"
	"strings"
	"time"
)

// MockRazorpayClient provides a mock implementation for local development
type MockRazorpayClient struct {
	keyID     string
	keySecret string
}

// MockOrder represents a mock Razorpay order
type MockOrder struct {
	ID       string
	Amount   int
	Currency string
	Receipt  string
	Notes    map[string]interface{}
}

// NewMockRazorpayClient creates a mock Razorpay client
func NewMockRazorpayClient(keyID, keySecret string) *MockRazorpayClient {
	return &MockRazorpayClient{
		keyID:     keyID,
		keySecret: keySecret,
	}
}

// CreateOrder creates a mock Razorpay order
func (m *MockRazorpayClient) CreateOrder(amount int, currency, receipt string, notes map[string]interface{}) (map[string]interface{}, error) {
	// Generate a mock order ID
	orderID := fmt.Sprintf("order_%d_%d", time.Now().Unix(), rand.Intn(10000))

	return map[string]interface{}{
		"id":       orderID,
		"amount":   amount,
		"currency": currency,
		"receipt":  receipt,
		"notes":    notes,
		"status":   "created",
		"created_at": time.Now().Unix(),
	}, nil
}

// GetAccount returns mock account details
func (m *MockRazorpayClient) GetAccount() (map[string]interface{}, error) {
	return map[string]interface{}{
		"id":    "acc_" + strings.ToLower(m.keyID[8:]),
		"email": "test@example.com",
		"type":  "route",
		"status": "active",
	}, nil
}
