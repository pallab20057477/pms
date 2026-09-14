package utils

import (
	"fmt"
	"net/http"
	"os"
	"strings"
)

func requestScheme(r *http.Request) string {
	if r != nil {
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			return "https"
		}
	}
	return "http"
}

// PublicBaseURL returns the configured backend base URL used for uploaded assets.
// It accepts either a full URL such as http://localhost:8080 or a bare host.
func PublicBaseURL(r *http.Request) string {
	configured := strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL"))
	if configured == "" {
		configured = strings.TrimSpace(os.Getenv("LOGO_URL_HOST"))
	}
	if configured != "" {
		if strings.HasPrefix(configured, "http://") || strings.HasPrefix(configured, "https://") {
			return strings.TrimRight(configured, "/")
		}
		return fmt.Sprintf("%s://%s", requestScheme(r), strings.TrimRight(configured, "/"))
	}

	host := "localhost:8080"
	if r != nil && strings.TrimSpace(r.Host) != "" {
		host = strings.TrimSpace(r.Host)
	}
	return fmt.Sprintf("%s://%s", requestScheme(r), host)
}

func AbsoluteAssetURL(r *http.Request, raw string) string {
	if raw == "" || strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return raw
	}
	path := raw
	if strings.HasPrefix(path, "./") {
		path = path[1:]
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return PublicBaseURL(r) + path
}
