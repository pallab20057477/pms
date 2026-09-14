package models

import (
	"time"

	"gorm.io/gorm"
)

// HotelTheme stores seasonal/festival branding themes for the public booking portal.
//
// Two modes:
//   - IsGlobal = false (default): theme applies only to HotelID
//   - IsGlobal = true:            theme applies to ALL hotels as a fallback.
//     Per-hotel theme always wins; global is the fallback.
//     HotelID is set to 0 for global themes.
type HotelTheme struct {
	ID      uint `gorm:"primaryKey" json:"id"`
	HotelID uint `gorm:"index" json:"hotel_id"` // 0 for global themes

	// Global flag — when true, applies to all hotels that have no hotel-specific active theme
	IsGlobal bool `gorm:"default:false;index" json:"is_global"`

	// Identity
	Name        string `gorm:"not null;size:100" json:"name"`
	Description string `gorm:"size:500" json:"description"`

	// Top ribbon banner visuals
	BannerImageURL string `gorm:"type:text" json:"banner_image_url"`
	BannerHeadline string `gorm:"size:200" json:"banner_headline"`
	BannerSubtext  string `gorm:"size:400" json:"banner_subtext"`

	// Left side panel (flanks the main booking content)
	LeftPanelImageURL  string `gorm:"type:text"  json:"left_panel_image_url"`
	LeftPanelTitle     string `gorm:"size:200"   json:"left_panel_title"`
	LeftPanelSubtext   string `gorm:"size:400"   json:"left_panel_subtext"`
	LeftPanelBtnText   string `gorm:"size:100"   json:"left_panel_btn_text"`
	LeftPanelBtnURL    string `gorm:"type:text"  json:"left_panel_btn_url"`
	LeftPanelBgFrom    string `gorm:"size:20"    json:"left_panel_bg_from"`
	LeftPanelBgTo      string `gorm:"size:20"    json:"left_panel_bg_to"`
	LeftPanelTextColor string `gorm:"size:20;default:'#ffffff'" json:"left_panel_text_color"`

	// Right side panel
	RightPanelImageURL  string `gorm:"type:text"  json:"right_panel_image_url"`
	RightPanelTitle     string `gorm:"size:200"   json:"right_panel_title"`
	RightPanelSubtext   string `gorm:"size:400"   json:"right_panel_subtext"`
	RightPanelBtnText   string `gorm:"size:100"   json:"right_panel_btn_text"`
	RightPanelBtnURL    string `gorm:"type:text"  json:"right_panel_btn_url"`
	RightPanelBgFrom    string `gorm:"size:20"    json:"right_panel_bg_from"`
	RightPanelBgTo      string `gorm:"size:20"    json:"right_panel_bg_to"`
	RightPanelTextColor string `gorm:"size:20;default:'#ffffff'" json:"right_panel_text_color"`

	// Color palette (hex strings, e.g. "#FF6B35")
	PrimaryColor   string `gorm:"size:20;default:'#6366f1'" json:"primary_color"`
	AccentColor    string `gorm:"size:20;default:'#f59e0b'" json:"accent_color"`
	BgGradientFrom string `gorm:"size:20;default:'#1e1b4b'" json:"bg_gradient_from"`
	BgGradientTo   string `gorm:"size:20;default:'#312e81'" json:"bg_gradient_to"`
	TextOnBanner   string `gorm:"size:20;default:'#ffffff'" json:"text_on_banner"`

	// Psychological Trust & Enterprise Branding Extensions
	PresetName     string `gorm:"size:50" json:"preset_name"`
	FontFamily     string `gorm:"size:50;default:'Inter'" json:"font_family"`
	TrustBadgeText string `gorm:"size:400" json:"trust_badge_text"`
	HeaderLogoURL  string `gorm:"type:text" json:"header_logo_url"`

	// Activation
	ActiveFrom  *time.Time `json:"active_from"`
	ActiveUntil *time.Time `json:"active_until"`
	IsActive    bool       `gorm:"default:false;index" json:"is_active"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

