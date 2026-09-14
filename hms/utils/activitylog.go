package utils

import (
	"hms/config"
	"hms/models"
	"strings"
	"unicode"
)

func LogActivity(hotelID uint, module string, refID uint, desc string) {
	action := "Updated"
	d := strings.TrimSpace(desc)
	if d != "" {
		parts := strings.Fields(d)
		if len(parts) > 0 {
			w := strings.ToLower(parts[0])
			r := []rune(w)
			if len(r) > 0 {
				r[0] = unicode.ToUpper(r[0])
				action = string(r)
			}
		}
	}
	log := models.ActivityLog{
		HotelID:     hotelID,
		Module:      module,
		Action:      action,
		AdminID:     refID,
		ReferenceID: refID,
		Description: desc,
	}
	config.DB.Create(&log)
}

func LogActivityWithContext(hotelID uint, module string, adminID uint, action string, reference string, desc string) {
	if strings.TrimSpace(action) == "" {
		action = "Updated"
	}
	log := models.ActivityLog{
		HotelID:     hotelID,
		Module:      module,
		Action:      strings.TrimSpace(action),
		Reference:   strings.TrimSpace(reference),
		AdminID:     adminID,
		ReferenceID: adminID,
		Description: strings.TrimSpace(desc),
	}
	config.DB.Create(&log)
}
