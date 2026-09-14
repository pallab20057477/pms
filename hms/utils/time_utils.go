package utils

import "time"

// GetFormattedTime returns a human-friendly timestamp for emails
func GetFormattedTime() string {
	return time.Now().Format("02 Jan 2006 15:04 MST")
}
