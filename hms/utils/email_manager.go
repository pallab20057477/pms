package utils

import (
    "fmt"
)

// EmailType constants for EmailManager
type EmailType string

const (
    EmailCustom EmailType = "custom"
)

// EmailData is a lightweight payload for sending templated/custom emails
type EmailData struct {
    ToEmail string
    Subject string
    Data    map[string]interface{}
}

// EmailManager provides a thin wrapper around existing Notify helpers.
type EmailManager struct{}

// NewEmailManager constructs an EmailManager
func NewEmailManager() *EmailManager {
    return &EmailManager{}
}

// SendEmail sends the provided EmailData using available utils functions.
func (e *EmailManager) SendEmail(t EmailType, data EmailData) error {
    // For now only custom emails are supported; use SendEmailWithInlineImages
    if t == EmailCustom {
        html, _ := data.Data["html"].(string)
        if html == "" {
            return fmt.Errorf("html content required for custom email")
        }
        return SendEmailWithInlineImages(data.ToEmail, data.Subject, html, nil)
    }
    return fmt.Errorf("unsupported email type: %s", t)
}
