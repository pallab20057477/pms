package utils

import (
	"fmt"
	"os"
	"strings"
)

// ValidateEmailConfig verifies required SMTP env vars are present.
func ValidateEmailConfig() error {
	host := strings.TrimSpace(os.Getenv("MAIL_HOST"))
	user := strings.TrimSpace(os.Getenv("MAIL_USERNAME"))
	from := strings.TrimSpace(os.Getenv("MAIL_FROM_ADDRESS"))
	if host == "" || user == "" || from == "" {
		return fmt.Errorf("incomplete email configuration: set MAIL_HOST, MAIL_USERNAME, MAIL_FROM_ADDRESS")
	}
	return nil
}

// GetEmailStatistics returns a small status map about email configuration.
func GetEmailStatistics() map[string]interface{} {
	host := strings.TrimSpace(os.Getenv("MAIL_HOST"))
	from := strings.TrimSpace(os.Getenv("MAIL_FROM_ADDRESS"))
	configured := host != "" && from != ""
	return map[string]interface{}{
		"configured": configured,
		"host":       host,
		"from":       from,
		"queued":     0,
		"sent_count": 0,
	}
}
