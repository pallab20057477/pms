package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"hms/config"
	"hms/models"
)

func main() {
	// Connect without running AutoMigrate to avoid schema changes during diagnostics
	config.ConnectDBNoAutoMigrate()

	var hotels []models.Hotel
	if err := config.DB.Find(&hotels).Error; err != nil {
		log.Fatalf("failed to query hotels: %v", err)
	}

	missing := 0
	for _, h := range hotels {
		logo := h.Logo
		localPath := ""
		exists := "N/A"
		if logo != "" {
			// try to map to local file path
			if idx := strings.Index(logo, "/uploads/"); idx != -1 {
				localPath = "." + logo[idx:]
			} else if strings.HasPrefix(logo, "./uploads") {
				localPath = logo
			} else if strings.HasPrefix(logo, "uploads/") {
				localPath = "./" + logo
			}
			if localPath != "" {
				if _, err := os.Stat(localPath); err == nil {
					exists = "yes"
				} else {
					exists = fmt.Sprintf("no: %v", err)
					missing++
				}
			}
		}
		fmt.Printf("ID=%d Name=%s\nDB Logo=%s\nLocalPath=%s Exists=%s\n\n", h.ID, h.Name, logo, localPath, exists)
	}
	fmt.Printf("Checked %d hotels, missing files: %d\n", len(hotels), missing)
}
