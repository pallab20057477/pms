package main

import (
	"fmt"
	"log"

	"hms/config"
	"hms/models"
	"hms/utils"
)

func main() {
	config.ConnectDBNoAutoMigrate()

	var hotels []models.Hotel
	if err := config.DB.Find(&hotels).Error; err != nil {
		log.Fatalf("failed to query hotels: %v", err)
	}

	updated := 0
	for _, h := range hotels {
		oldLogo := h.Logo
		newLogo := utils.AbsoluteAssetURL(nil, oldLogo)
		if newLogo != oldLogo {
			h.Logo = newLogo
			if err := config.DB.Model(&h).Update("logo", newLogo).Error; err != nil {
				log.Printf("Failed to update hotel ID=%d: %v", h.ID, err)
			} else {
				updated++
				fmt.Printf("Updated hotel ID=%d: %s -> %s\n", h.ID, oldLogo, newLogo)
			}
		}
	}
	fmt.Printf("Backfill complete. Updated %d hotel logo URLs.\n", updated)
}
