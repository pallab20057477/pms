package controllers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"

	"github.com/gin-gonic/gin"
)

type activityLogItem struct {
	ID          uint   `json:"id"`
	Timestamp   int64  `json:"timestamp"`
	Module      string `json:"module"`
	Action      string `json:"action"`
	Reference   string `json:"reference"`
	ReferenceID uint   `json:"reference_id"`
	Description string `json:"description"`
	AdminID     uint   `json:"admin_id"`
	AdminName   string `json:"admin_name"`
}

func ListLogs(c *gin.Context) {
	hotelID := c.GetUint("active_hotel_id")
	page := 1
	pageSize := 50
	if p := strings.TrimSpace(c.DefaultQuery("page", "1")); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if pz := strings.TrimSpace(c.DefaultQuery("page_size", "50")); pz != "" {
		if parsed, err := strconv.Atoi(pz); err == nil && parsed > 0 {
			if parsed > 200 {
				parsed = 200
			}
			pageSize = parsed
		}
	}

	module := strings.TrimSpace(c.Query("module"))
	action := strings.TrimSpace(c.Query("action"))
	reference := strings.TrimSpace(c.Query("reference"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	from := strings.TrimSpace(c.Query("from"))
	to := strings.TrimSpace(c.Query("to"))

	db := config.DB.Model(&models.ActivityLog{}).
		Where("hotel_id = ?", hotelID)

	if module != "" {
		db = db.Where("LOWER(module) = LOWER(?)", module)
	}
	if action != "" {
		db = db.Where("LOWER(action) = LOWER(?)", action)
	}
	if reference != "" {
		db = db.Where("reference ILIKE ?", "%"+reference+"%")
	}
	if keyword != "" {
		db = db.Where("description ILIKE ?", "%"+keyword+"%")
	}
	if from != "" {
		if fromDate, err := time.Parse("2006-01-02", from); err == nil {
			db = db.Where("created_at >= ?", fromDate.Unix())
		}
	}
	if to != "" {
		if toDate, err := time.Parse("2006-01-02", to); err == nil {
			end := toDate.Add(24 * time.Hour)
			db = db.Where("created_at < ?", end.Unix())
		}
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count logs"})
		return
	}

	var logs []models.ActivityLog
	if err := db.Order("created_at desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch logs"})
		return
	}

	adminIDs := make([]uint, 0)
	seen := map[uint]bool{}
	for _, l := range logs {
		if l.AdminID > 0 && !seen[l.AdminID] {
			adminIDs = append(adminIDs, l.AdminID)
			seen[l.AdminID] = true
		}
	}

	adminMap := map[uint]string{}
	if len(adminIDs) > 0 {
		var admins []models.Admin
		_ = config.DB.Where("id IN ?", adminIDs).Find(&admins).Error
		for _, a := range admins {
			name := strings.TrimSpace(a.Name)
			if name == "" {
				name = a.Username
			}
			adminMap[a.ID] = name
		}
	}

	items := make([]activityLogItem, 0, len(logs))
	for _, l := range logs {
		items = append(items, activityLogItem{
			ID:          l.ID,
			Timestamp:   l.CreatedAt,
			Module:      l.Module,
			Action:      l.Action,
			Reference:   l.Reference,
			ReferenceID: l.ReferenceID,
			Description: l.Description,
			AdminID:     l.AdminID,
			AdminName:   adminMap[l.AdminID],
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"items":     items,
		"page":      page,
		"page_size": pageSize,
		"total":     total,
	})
}

func FilterLogs(c *gin.Context) {
	ListLogs(c)
}
