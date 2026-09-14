package utils

import (
	"fmt"
	"strings"
	"time"

	"hms/config"
	"hms/models"
)

const businessDateLayout = "2006-01-02"

func parseBusinessDate(date string) (time.Time, error) {
	return time.Parse(businessDateLayout, strings.TrimSpace(date))
}

func lastClosedDate(hotelID uint) (time.Time, bool, error) {
	var setting models.SystemSetting
	if err := config.DB.Where("hotel_id = ?", hotelID).First(&setting).Error; err != nil {
		return time.Time{}, false, nil
	}
	if strings.TrimSpace(setting.LastClosedDate) == "" {
		return time.Time{}, false, nil
	}
	d, err := parseBusinessDate(setting.LastClosedDate)
	if err != nil {
		return time.Time{}, false, nil
	}
	return d, true, nil
}

func EnsureBusinessDateOpen(hotelID uint, businessDate time.Time) error {
	closedAt, ok, err := lastClosedDate(hotelID)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	if !businessDate.After(closedAt) {
		return fmt.Errorf("transactions for %s are locked (last closed date: %s)", businessDate.Format(businessDateLayout), closedAt.Format(businessDateLayout))
	}
	return nil
}

func EnsureBusinessDateOpenString(hotelID uint, businessDate string) error {
	d, err := parseBusinessDate(businessDate)
	if err != nil {
		return fmt.Errorf("invalid business date")
	}
	return EnsureBusinessDateOpen(hotelID, d)
}

func EnsureTodayOpen(hotelID uint) error {
	today, _ := parseBusinessDate(time.Now().Format(businessDateLayout))
	return EnsureBusinessDateOpen(hotelID, today)
}
