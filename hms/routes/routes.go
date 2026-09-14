package routes

import (
	"hms/controllers"
	"hms/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine) {
	// Super Admin routes (must be before auth middleware)
	RegisterSuperAdminRoutes(r)

	// Auth
	r.POST("/login", controllers.AdminLogin)
	r.POST("/api/login", controllers.AdminLogin) // frontend calls /api/login
	r.POST("/web/login", controllers.AdminLogin) // alias for legacy frontend
	r.POST("/staff/login", controllers.StaffCRMLogin)
	r.POST("/api/staff/login", controllers.StaffCRMLogin) // frontend alias
	r.POST("/web/staff/login", controllers.StaffCRMLogin) // alias for legacy frontend
	r.OPTIONS("/web/login", func(c *gin.Context) { c.Status(204) })
	r.GET("/me", controllers.Me)

	// Public guest self-scan QR check-in (no auth — guest scans from their phone/email)
	r.GET("/checkin/qr", controllers.GuestScanQR)

	// Public booking portal (no auth required)
	public := r.Group("/api/public")
	{
		public.GET("/config", controllers.GetPublicConfig)
		public.GET("/hotels", controllers.PublicListHotels)
		public.GET("/hotels/:hotel_id", controllers.PublicGetHotel)
		public.GET("/hotels/:hotel_id/reviews", controllers.GetHotelReviews)
		public.GET("/hotels/:hotel_id/theme", controllers.GetPublicActiveTheme)
		public.GET("/availability", controllers.PublicCheckAvailability)
		public.POST("/bookings/:code/invoice/generate", controllers.PublicGenerateBookingInvoice)
		public.GET("/bookings/:code/invoice/pdf", controllers.PublicDownloadBookingInvoicePDF)
	}

	// BookingHotel Channel Manager Push Booking Webhook
	r.POST("/api/channel-manager/push-booking", controllers.HandleBookingHotelPushBooking)
	r.POST("/api/channel-manager/bookinghotel/push", controllers.HandleBookingHotelPushBooking)
	r.POST("/api/public/channel-manager/push-booking", controllers.HandleBookingHotelPushBooking)
	r.POST("/api/public/channel-manager/bookinghotel/push", controllers.HandleBookingHotelPushBooking)

	// Public auth routes (no auth required)
	r.POST("/api/public/auth/register", controllers.GuestRegister)
	r.POST("/api/public/auth/verify-email", controllers.GuestVerifyEmail)
	r.POST("/api/public/auth/resend-otp", controllers.GuestResendOTP)
	r.POST("/api/public/auth/login", controllers.GuestLogin)
	r.POST("/api/public/auth/google", controllers.GuestGoogleLogin)

	// Public auth routes (guest JWT required)
	guestAuth := r.Group("/api/public/auth")
	guestAuth.Use(middleware.GuestAuthMiddleware())
	{
		guestAuth.GET("/me", controllers.GuestMe)
		guestAuth.PUT("/profile", controllers.GuestUpdateProfile)
		guestAuth.GET("/hotel-guest-profile", controllers.GuestHotelProfile)
		guestAuth.POST("/logout", controllers.GuestLogout)
		guestAuth.GET("/my-bookings", controllers.GuestMyBookings)
		guestAuth.GET("/my-reviews", controllers.MyReviews)
	}

	// Public booking — requires guest JWT
	publicBooking := r.Group("/api/public")
	publicBooking.Use(middleware.GuestAuthMiddleware())
	{
		publicBooking.POST("/bookings", controllers.PublicCreateBooking)
		publicBooking.GET("/bookings/:code", controllers.PublicGetBooking)
		publicBooking.PATCH("/bookings/:code", controllers.PublicUpdateBooking)
		publicBooking.POST("/payments/razorpay/create-order", controllers.PublicCreateRazorpayOrder)
		publicBooking.POST("/payments/razorpay/verify", controllers.PublicVerifyRazorpayPayment)
		publicBooking.POST("/payments/phonepe/initiate", controllers.PublicInitiatePhonePePayment)
		publicBooking.POST("/payments/phonepe/verify", controllers.PublicVerifyPhonePePayment)
	}

	// Integration webhooks (public, signed)
	r.POST("/webhook/booking", controllers.WebhookBooking)
	r.POST("/webhook/cancellation", controllers.WebhookCancellation)
	r.POST("/webhook/update", controllers.WebhookUpdate)

	// Public reviews — requires guest JWT
	r.POST("/api/public/reviews", middleware.GuestAuthMiddleware(), controllers.CreateReview)
	r.GET("/api/public/reviews/check/:booking_code", middleware.GuestAuthMiddleware(), controllers.CheckReviewEligibility)
	r.DELETE("/api/public/reviews/:id", middleware.GuestAuthMiddleware(), controllers.DeleteReview)

	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware())

	// Current User — /api/me (v1 alias handled by main.go wildcard /api/v1/*any)
	api.GET("/me", controllers.Me)

	// Hotel
	api.POST("/hotels", controllers.AddHotel)
	api.GET("/hotels", controllers.ListHotels)
	api.GET("/hotels/:id", controllers.GetHotel)
	api.PUT("/hotels/:id", controllers.UpdateHotel)
	api.DELETE("/hotels/:id", controllers.DeleteHotel)
	api.POST("/hotels/switch", controllers.SelectHotel)
	api.POST("/hotels/regenerate-public-token", controllers.RegeneratePublicToken)

	// Rate Plans
	api.GET("/rate-plans", controllers.GetRatePlans)
	api.POST("/rate-plans", controllers.CreateRatePlan)
	api.PUT("/rate-plans/:id", controllers.UpdateRatePlan)
	api.DELETE("/rate-plans/:id", controllers.DeleteRatePlan)

	// Room
	api.POST("/rooms", controllers.AddRoom)
	api.GET("/rooms", controllers.ListRooms)
	api.GET("/rooms/maintenance", controllers.ListMaintenanceRooms)
	api.GET("/rooms/status/:status", controllers.ListRoomsByStatus)
	api.GET("/rooms/:id", controllers.GetRoom)
	api.PUT("/rooms/:id", controllers.UpdateRoom)
	api.PATCH("/rooms/:id", controllers.UpdateRoom)
	api.PATCH("/rooms/:id/status", controllers.UpdateRoomStatus)
	api.DELETE("/rooms/:id", controllers.DeleteRoom)
	api.DELETE("/rooms/images/:id", controllers.DeleteRoomImage)

	// Amenity
	api.POST("/amenities", controllers.AddAmenity)
	api.GET("/amenities", controllers.ListAmenities)
	api.POST("/rooms/:id/amenities", controllers.AssignAmenitiesToRoom)
	api.GET("/rooms/:id/amenities", controllers.GetRoomAmenities)

	// Guest
	api.POST("/guests", controllers.AddGuest)
	api.GET("/guests", controllers.ListGuests)
	api.GET("/guests/search", controllers.SearchGuests)
	api.GET("/guests/:id", controllers.GetGuest)
	api.PUT("/guests/:id", controllers.UpdateGuest)
	api.DELETE("/guests/:id", controllers.DeleteGuest)
	api.GET("/guests/:id/history", controllers.GuestHistory)

	// Staff
	api.POST("/staff", controllers.AddStaff)
	api.GET("/staff", controllers.ListStaff)
	api.GET("/staff/attendance", controllers.ListAttendance)
	api.GET("/staff/performance/ranking", controllers.StaffPerformanceRanking)
	api.GET("/staff/:id", controllers.GetStaff)
	api.GET("/staff/:id/history", controllers.GetStaffHistory)
	api.GET("/staff/:id/shifts", controllers.ListStaffShifts)
	api.POST("/staff/:id/shifts/check-in", controllers.StaffCheckIn)
	api.POST("/staff/:id/shifts/check-out", controllers.StaffCheckOut)
	api.GET("/staff/:id/performance", controllers.StaffPerformance)
	api.PUT("/staff/:id", controllers.UpdateStaff)
	api.DELETE("/staff/:id", controllers.DeleteStaff)

	// Staff Salary/Payroll
	api.GET("/staff/:id/salaries", controllers.ListStaffSalaries)
	api.POST("/staff/:id/salaries", controllers.CreateStaffSalary)
	api.PATCH("/staff/salaries/:id/status", controllers.UpdateStaffSalaryStatus)

	// Staff Increment
	api.POST("/staff/:id/increment", controllers.AddStaffIncrement)
	api.GET("/staff/:id/increments", controllers.ListStaffIncrements)

	// Booking
	api.POST("/bookings", controllers.CreateBooking)
	api.GET("/bookings", controllers.ListBookings)
	api.GET("/bookings/:id", controllers.GetBooking)
	api.PATCH("/bookings/:id", controllers.UpdateBooking)
	api.POST("/bookings/:id/cancel", controllers.CancelBooking)
	api.GET("/availability", controllers.CheckAvailability)
	api.GET("/bookings/today", controllers.ListTodayBookings)

	// Check-in / Checkout
	api.POST("/bookings/:id/checkin", controllers.CheckIn)
	api.POST("/bookings/:id/checkout", controllers.Checkout)
	api.POST("/bookings/:id/checkin/send-otp", controllers.SendCheckinOTP)
	api.GET("/bookings/:id/checkin/credentials", controllers.GetCheckinCredentials)
	api.POST("/bookings/:id/checkin/verify-otp", controllers.VerifyCheckinOTP)
	api.POST("/bookings/checkin/verify-qr", controllers.VerifyCheckinQR)

	// Folio
	api.GET("/folio/:booking_id", controllers.GetFolio)
	api.GET("/folio/:booking_id/balance", controllers.GetBookingBalance) // Unified balance endpoint
	api.POST("/folio/add-item", controllers.AddFolioItem)
	api.PATCH("/folio/apply-discount", controllers.ApplyFolioDiscount)
	api.DELETE("/folio/item/:id", controllers.DeleteFolioItem)

	// Payment
	api.GET("/payments", controllers.ListPayments)
	api.POST("/payments", controllers.AddPayment)
	api.PUT("/payments/:id", controllers.UpdatePaymentLegacy)
	api.DELETE("/payments/:id", controllers.DeletePaymentLegacy)
	api.POST("/payments/:payment_id/delete", controllers.DeletePayment)
	api.GET("/payments/:booking_id", controllers.GetPaymentsForBooking)
	api.GET("/payments/history", controllers.PaymentHistory)

	// Razorpay
	api.GET("/payments/razorpay/health", controllers.RazorpayHealth)
	api.GET("/payments/razorpay/test", controllers.RazorpayTest)
	api.POST("/payments/razorpay/create-order", controllers.CreateRazorpayOrder)
	api.POST("/payments/razorpay/verify", controllers.VerifyRazorpayPayment)

	// PhonePe
	api.GET("/payments/phonepe/health", controllers.PhonePeHealth)
	api.POST("/payments/phonepe/initiate", controllers.InitiatePhonePePayment)
	api.POST("/payments/phonepe/verify", controllers.VerifyPhonePePayment)

	// Housekeeping
	api.GET("/housekeeping", controllers.ListHousekeeping)
	api.GET("/housekeeping/dirty", controllers.ListDirtyRooms)
	api.GET("/housekeeping/cleaning", controllers.ListCleaningRooms)
	api.GET("/housekeeping/history", controllers.ListCleaningHistory)
	api.POST("/housekeeping/start", controllers.StartCleaning)
	api.POST("/housekeeping/complete", controllers.CompleteCleaning)
	api.PATCH("/housekeeping/:id", controllers.UpdateHousekeeping)
	api.POST("/housekeeping/update", controllers.UpdateHousekeeping)
	api.GET("/housekeeping/rooms", controllers.HousekeepingRooms)

	// Reports
	api.GET("/reports/summary", controllers.ReportSummary)
	api.GET("/reports/overview", controllers.ReportOverview)
	api.GET("/reports/occupancy", controllers.ReportOccupancy)
	api.GET("/reports/revenue", controllers.ReportRevenue)
	api.GET("/reports/room-wise", controllers.ReportRoomWiseRevenue)
	api.GET("/reports/pending-payments", controllers.ReportPendingPayments)
	api.GET("/reports/cancellations", controllers.ReportCancellations)
	api.GET("/reports/guest-history", controllers.ReportGuestHistory)
	api.GET("/reports/housekeeping", controllers.ReportHousekeeping)
	api.GET("/reports/staff-performance", controllers.ReportStaffPerformance)

	// Workflow modules
	api.GET("/expenses", controllers.ListExpenses)
	api.POST("/expenses", controllers.AddExpense)
	api.PUT("/expenses/:id", controllers.UpdateExpense)
	api.DELETE("/expenses/:id", controllers.DeleteExpense)
	api.GET("/tasks", controllers.ListTasks)
	api.POST("/tasks", controllers.AddTask)
	api.PUT("/tasks/:id", controllers.UpdateTask)
	api.DELETE("/tasks/:id", controllers.DeleteTask)
	api.GET("/taxrates", controllers.ListTaxRates)
	api.POST("/taxrates", controllers.AddTaxRate)
	api.PUT("/taxrates/:id", controllers.UpdateTaxRate)
	api.DELETE("/taxrates/:id", controllers.DeleteTaxRate)
	api.GET("/recurring", controllers.ListRecurring)
	api.POST("/recurring", controllers.AddRecurring)
	api.PUT("/recurring/:id", controllers.UpdateRecurring)
	api.DELETE("/recurring/:id", controllers.DeleteRecurring)
	api.GET("/quotes", controllers.ListQuotes)
	api.POST("/quotes", controllers.AddQuote)
	api.PUT("/quotes/:id", controllers.UpdateQuote)
	api.DELETE("/quotes/:id", controllers.DeleteQuote)

	// Settings
	api.GET("/settings/profile", controllers.GetMyProfile)
	api.PUT("/settings/profile", controllers.UpdateMyProfile)
	api.PUT("/settings/profile/password", controllers.ChangeMyPassword)
	api.GET("/settings/system", controllers.GetSystemSettings)
	api.PUT("/settings/system", controllers.UpdateSystemSettings)
	api.GET("/settings/offer", controllers.GetOfferSettings)
	api.PUT("/settings/offer", controllers.UpdateOfferSettings)
	api.GET("/settings/pricing", controllers.GetRoomPricingOverview)
	api.POST("/settings/pricing/adjust", controllers.AdjustRoomPricing)
	api.POST("/settings/pricing/base-set", controllers.SetRoomTypeBasePricing)
	api.GET("/settings/room-occupancy", controllers.GetRoomOccupancyPricing)
	api.PUT("/settings/room-occupancy", controllers.UpdateRoomOccupancyPricing)
	api.GET("/settings/hotel", controllers.GetCurrentHotelSettings)
	api.PUT("/settings/hotel", controllers.UpdateCurrentHotelSettings)

	// Integrations (channel manager config)
	api.GET("/integrations/channel-config", controllers.GetIntegrationConfig)
	api.POST("/integrations/channel-config", controllers.UpdateIntegrationConfig)
	api.GET("/integrations/channels", controllers.ListIntegrationChannels)
	api.POST("/integrations/channels", controllers.CreateIntegrationChannel)
	api.PUT("/integrations/channels/:id", controllers.UpdateIntegrationChannel)
	api.DELETE("/integrations/channels/:id", controllers.DeleteIntegrationChannel)
	api.POST("/integrations/channels/:id/oauth/start", controllers.StartIntegrationChannelOAuth)
	api.POST("/integrations/channels/:id/import", controllers.ImportIntegrationChannelReservations)
	api.POST("/integrations/channels/:id/sync/toggle", controllers.ToggleIntegrationChannelSync)
	api.GET("/integrations/sync-jobs", controllers.ListIntegrationSyncJobs)
	api.POST("/integrations/bookinghotel/inventory", controllers.PushBookingHotelInventory)
	api.POST("/integrations/bookinghotel/push-test", controllers.HandleBookingHotelPushBooking)

	// Invoice
	api.GET("/invoices", controllers.ListInvoices)
	api.PUT("/invoices/:id", controllers.UpdateInvoiceLegacy)
	api.DELETE("/invoices/:id", controllers.DeleteInvoiceLegacy)
	api.POST("/invoices/:booking_id", controllers.GenerateInvoice)
	api.GET("/invoices/:booking_id", controllers.GetInvoice)
	api.GET("/invoices/:booking_id/pdf", controllers.DownloadInvoicePDF)

	// Legacy customer list compatibility
	api.GET("/customers", controllers.ListCustomers)

	// Dashboard
	api.GET("/dashboard/summary", controllers.DashboardSummary)

	// Admin utilities
	// api.POST("/admin/backfill-room-images", controllers.BackfillRoomImages)
	api.POST("/admin/drop-cloudinary-columns", controllers.DropCloudinaryColumns)
	api.POST("/admin/clean-guest-preferences", controllers.CleanGuestPreferences)

	// Activity Logs
	api.GET("/logs", controllers.ListLogs)
	api.GET("/logs/filter", controllers.FilterLogs)

	// Reviews (admin)
	api.GET("/reviews", controllers.AdminListReviews)
	api.PATCH("/reviews/:id/status", controllers.AdminUpdateReviewStatus)

	// Email Service
	// api.GET("/email/status", controllers.ValidateEmailConfig)
	// api.POST("/email/send", controllers.SendCustomEmail)
	// api.POST("/email/test", controllers.TestEmail)
	// api.POST("/email/booking-update", controllers.SendEmailUpdate)
	// api.POST("/email/promotional", controllers.SendPromotionalEmail)
	// api.GET("/email/guests", controllers.GetGuestEmails)
	// api.GET("/email/statistics", controllers.GetEmailStatistics)
	// api.GET("/email/validate", controllers.ValidateEmailConfig)

}
