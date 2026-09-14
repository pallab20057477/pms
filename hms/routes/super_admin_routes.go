package routes

import (
	"hms/controllers"
	"hms/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterSuperAdminRoutes(r *gin.Engine) {
	r.POST("/api/super-admin/login", controllers.SuperAdminLogin)

	sa := r.Group("/api/super-admin")
	sa.Use(middleware.SuperAdminAuth())
	{
		sa.GET("/dashboard", controllers.GetDashboard)

		// Admin management
		sa.GET("/admins", controllers.GetAllAdmins)
		sa.POST("/admins", controllers.CreateAdmin)
		sa.PUT("/admins/:admin_id/suspend", controllers.SuspendAdmin)
		sa.PUT("/admins/:admin_id/activate", controllers.ActivateAdmin)
		sa.GET("/admins/:admin_id/hotels", controllers.GetAdminHotels)

		// Hotel management
		sa.GET("/hotels", controllers.GetAllHotels)
		sa.POST("/hotels", controllers.CreateHotel)
		sa.GET("/hotels/:hotel_id/usage", controllers.GetHotelUsage)
		sa.POST("/hotels/:hotel_id/impersonate", controllers.ImpersonateHotel)
		sa.GET("/hotels/:hotel_id/features", controllers.GetHotelFeatures)
		sa.PUT("/hotels/:hotel_id/features", controllers.UpdateHotelFeatures)
		sa.PATCH("/hotels/:hotel_id/payment-config", controllers.UpdateHotelPaymentConfig)
		sa.GET("/payments/razorpay/health", controllers.RazorpayHealth)
		sa.GET("/payments/phonepe/health", controllers.PhonePeHealth)
		sa.PUT("/hotels/:hotel_id/subscription", controllers.UpdateHotelSubscription)
		sa.PUT("/hotels/:hotel_id/suspend", controllers.SuspendHotel)
		sa.PUT("/hotels/:hotel_id/activate", controllers.ActivateHotel)

		// Logs
		sa.GET("/subscription-logs", controllers.GetSubscriptionLogs)
		sa.PUT("/subscription-logs/:id/status", controllers.UpdateSubscriptionLogPaymentStatus)
		
		// Plans management
		sa.GET("/plans", controllers.GetAllPlans)
		sa.PUT("/plans/:tier", controllers.UpdatePlan)

		// Platform Analytics — Billing, Health, Audit
		sa.GET("/billing", controllers.GetPlatformBilling)
		sa.GET("/system-health", controllers.GetSystemHealth)
		sa.GET("/audit-logs", controllers.GetPlatformAuditLogs)
		sa.GET("/audit-logs/modules", controllers.GetAuditModules)

		// Hotel Public Theme management (per-hotel)
		sa.GET("/hotels/:hotel_id/themes", controllers.ListHotelThemes)
		sa.POST("/hotels/:hotel_id/themes", controllers.CreateHotelTheme)
		sa.PUT("/hotels/:hotel_id/themes/:theme_id", controllers.UpdateHotelTheme)
		sa.DELETE("/hotels/:hotel_id/themes/:theme_id", controllers.DeleteHotelTheme)
		sa.GET("/hotels/:hotel_id/themes/active", controllers.GetActiveHotelTheme)
		sa.POST("/hotels/:hotel_id/themes/upload-banner", controllers.UploadThemeBanner)
		sa.POST("/hotels/:hotel_id/themes/upload-panel", controllers.UploadThemePanelImage)
		sa.POST("/hotels/:hotel_id/themes/upload-logo", controllers.UploadThemeLogo)

		// Global Themes — apply to ALL hotels (fallback when no hotel-specific theme)
		sa.GET("/global-themes", controllers.ListGlobalThemes)
		sa.POST("/global-themes", controllers.CreateGlobalTheme)
		sa.PUT("/global-themes/:theme_id", controllers.UpdateGlobalTheme)

		// Integrations
		sa.GET("/integrations/partners", controllers.GetPartners)
		sa.POST("/integrations/partners", controllers.CreatePartner)
		sa.PUT("/integrations/partners/:id", controllers.UpdatePartner)
		sa.DELETE("/integrations/partners/:id", controllers.DeletePartner)

		sa.GET("/integrations/channel-mappings/:hotel_id", controllers.GetChannelMappings)
		sa.POST("/integrations/channel-mappings/:hotel_id", controllers.SaveChannelMappings)
		sa.GET("/integrations/mapping-resources/:hotel_id", controllers.GetMappingResources)
		sa.DELETE("/global-themes/:theme_id", controllers.DeleteGlobalTheme)
		sa.POST("/global-themes/upload-banner", controllers.UploadThemeBanner)
		sa.POST("/global-themes/upload-panel", controllers.UploadThemePanelImage)
		sa.POST("/global-themes/upload-logo", controllers.UploadThemeLogo)
	}
}
