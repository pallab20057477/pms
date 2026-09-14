package config

import (
	"database/sql"
	"fmt"
	"hms/models"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

func gormConfig() *gorm.Config {
	slowSQLMs := 1000
	if v := strings.TrimSpace(os.Getenv("DB_SLOW_SQL_MS")); v != "" {
		if ms, err := strconv.Atoi(v); err == nil && ms > 0 {
			slowSQLMs = ms
		}
	}

	logLevel := gormlogger.Warn
	switch strings.ToLower(strings.TrimSpace(os.Getenv("DB_LOG_LEVEL"))) {
	case "silent":
		logLevel = gormlogger.Silent
	case "error":
		logLevel = gormlogger.Error
	case "info":
		logLevel = gormlogger.Info
	}

	return &gorm.Config{
		Logger: gormlogger.New(
			log.New(os.Stdout, "", log.LstdFlags),
			gormlogger.Config{
				SlowThreshold:             time.Duration(slowSQLMs) * time.Millisecond,
				LogLevel:                  logLevel,
				IgnoreRecordNotFoundError: true,
				Colorful:                  false,
			},
		),
	}
}

func ConnectDB() {
	// Load .env
	if err := godotenv.Load(); err != nil {
		log.Printf("No .env file found; relying on environment variables")
	}

	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	dbname := os.Getenv("DB_DATABASE")
	user := os.Getenv("DB_USERNAME")
	password := os.Getenv("DB_PASSWORD")
	tz := strings.TrimSpace(os.Getenv("DB_TIMEZONE"))
	if tz == "" {
		tz = "Asia/Kolkata"
	}
	if strings.TrimSpace(host) == "" || strings.TrimSpace(port) == "" || strings.TrimSpace(dbname) == "" || strings.TrimSpace(user) == "" {
		log.Fatal("Database configuration missing (set DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD)")
	}

	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=%s",
		host, user, password, dbname, port, tz,
	)

	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true,
	}), gormConfig())
	if err != nil {
		log.Fatal("Failed to connect to database: ", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatal("Failed to extract sql.DB from gorm: ", err)
	}
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)

	DB = db

	// Ensure legacy epoch bigints are converted to timestamptz for timestamp columns
	ensureTimestampColumns(db)

	if err := db.AutoMigrate(
		&models.Admin{},
		&models.Hotel{},
		&models.PublicUser{},
		&models.Subscription{},
		&models.SubscriptionLog{},
		&models.RatePlan{},
		&models.RoomType{},
		&models.Room{},
		&models.RoomImage{},
		&models.RoomAmenity{},
		&models.RoomAmenityMap{},
		&models.Guest{},
		&models.Staff{},
		&models.StaffShift{},
		&models.StaffSalary{},
		&models.StaffIncrement{},
		&models.Booking{},
		&models.BookingOTP{},
		&models.Payment{},
		&models.HmsExpense{},
		&models.Task{},
		&models.TaxRate{},
		&models.Recurring{},
		&models.Quote{},
		&models.FolioItem{},
		&models.Housekeeping{},
		&models.HousekeepingHistory{},
		&models.ActivityLog{},
		&models.SystemSetting{},
		&models.PlanSetting{},
		&models.IntegrationConfig{},
		&models.IntegrationSyncJob{},
		&models.IntegrationWebhookEvent{},
		&models.SeasonalPricingRule{},
		&models.Invoice{},
		&models.HotelReview{},
		&models.ChannelBooking{},
		&models.HotelTheme{},
		&models.PartnerIntegration{},
		&models.ChannelHotelMapping{},
		&models.ChannelRoomMapping{},
		&models.ChannelRateMapping{},
	); err != nil {
		// If AutoMigrate fails due to bigint->timestamptz cast issues, try running
		// the safe conversion and retry once. If it still fails, log the error
		// but don't exit the process so the server can start for manual intervention.
		log.Printf("AutoMigrate attempt failed: %v", err)
		// try ensureTimestampColumns again and retry migrate
		ensureTimestampColumns(db)
		if err2 := db.AutoMigrate(
			&models.Admin{},
			&models.Hotel{},
			&models.PublicUser{},
			&models.Subscription{},
			&models.SubscriptionLog{},
			&models.RatePlan{},
			&models.RoomType{},
			&models.Room{},
			&models.RoomImage{},
			&models.RoomAmenity{},
			&models.RoomAmenityMap{},
			&models.Guest{},
			&models.Staff{},
			&models.StaffShift{},
			&models.StaffSalary{},
			&models.StaffIncrement{},
			&models.Booking{},
			&models.BookingOTP{},
			&models.Payment{},
			&models.HmsExpense{},
			&models.Task{},
			&models.TaxRate{},
			&models.Recurring{},
			&models.Quote{},
			&models.FolioItem{},
			&models.Housekeeping{},
			&models.HousekeepingHistory{},
			&models.ActivityLog{},
			&models.SystemSetting{},
			&models.PlanSetting{},
			&models.IntegrationConfig{},
			&models.IntegrationSyncJob{},
			&models.IntegrationWebhookEvent{},
			&models.SeasonalPricingRule{},
			&models.Invoice{},
			&models.HotelReview{},
			&models.ChannelBooking{},
			&models.HotelTheme{},
			&models.PartnerIntegration{},
			&models.ChannelHotelMapping{},
			&models.ChannelRoomMapping{},
			&models.ChannelRateMapping{},
		); err2 != nil {
			log.Printf("AutoMigrate retry failed: %v", err2)
			log.Println("Continuing without completing AutoMigrate. Please run migrations manually after backing up the database.")
		}
	}

	// Ensure room_images has the `is_primary` column (added in newer model)
	// This handles cases where AutoMigrate previously failed and the table exists
	// without the new column.
	if !db.Migrator().HasColumn(&models.RoomImage{}, "is_primary") && !db.Migrator().HasColumn(&models.RoomImage{}, "IsPrimary") {
		log.Println("room_images.is_primary column missing — adding column now")
		if err := db.Exec("ALTER TABLE room_images ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;").Error; err != nil {
			log.Println("Warning: failed to add is_primary column to room_images:", err)
		} else {
			log.Println("Added room_images.is_primary column successfully")
		}
	}

	// Ensure room_id is not required, since images now belong to RoomType
	if err := db.Exec("ALTER TABLE room_images ALTER COLUMN room_id DROP NOT NULL;").Error; err != nil {
		log.Println("Warning: failed to drop NOT NULL from room_images.room_id:", err)
	}


	// ensure invoice sequence exists for sequential invoice numbers
	if err := db.Exec("CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1000;").Error; err != nil {
		log.Println("Warning: failed to ensure invoice sequence:", err)
	}

	// Ensure bookings has actual_check_in_at / actual_check_out_at columns (added after initial schema)
	if err := db.Exec("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actual_check_in_at timestamptz;").Error; err != nil {
		log.Println("Warning: failed to ensure bookings.actual_check_in_at:", err)
	}
	if err := db.Exec("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actual_check_out_at timestamptz;").Error; err != nil {
		log.Println("Warning: failed to ensure bookings.actual_check_out_at:", err)
	}
	// Ensure system_settings has checkin_time column (added in newer model)
	if err := db.Exec("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS checkin_time varchar(5) DEFAULT '14:00';").Error; err != nil {
		log.Println("Warning: failed to ensure system_settings.checkin_time:", err)
	} else {
		log.Println("Ensured system_settings.checkin_time column exists")
	}

	// Ensure hotels has admin_id column (added for multi-hotel support)
	if !db.Migrator().HasColumn(&models.Hotel{}, "admin_id") {
		log.Println("hotels.admin_id column missing — adding column now")
		if err := db.Exec("ALTER TABLE hotels ADD COLUMN IF NOT EXISTS admin_id bigint;").Error; err != nil {
			log.Println("Warning: failed to add admin_id column to hotels:", err)
		} else {
			log.Println("Added hotels.admin_id column successfully")
		}
	}

	// Auto-assign hotels with NULL admin_id to the first admin in the system
	if err := db.Exec(`
		UPDATE hotels SET admin_id = (SELECT id FROM admins ORDER BY id LIMIT 1)
		WHERE admin_id IS NULL AND EXISTS (SELECT 1 FROM admins LIMIT 1)
	`).Error; err != nil {
		log.Println("Warning: failed to auto-assign hotels to admin:", err)
	}

	// Ensure feature flag columns exist on hotels table
	featureFlags := map[string]string{
		"feature_online_payment":   "boolean DEFAULT false",
		"feature_reports":          "boolean DEFAULT true",
		"feature_staff_payroll":    "boolean DEFAULT false",
		"feature_housekeeping":     "boolean DEFAULT true",
		"feature_email_notify":     "boolean DEFAULT false",
		"feature_seasonal_pricing": "boolean DEFAULT false",
		"feature_channel_manager":  "boolean DEFAULT true",
	}
	for col, def := range featureFlags {
		if err := db.Exec("ALTER TABLE hotels ADD COLUMN IF NOT EXISTS " + col + " " + def + ";").Error; err != nil {
			log.Printf("Warning: failed to add %s column to hotels: %v", col, err)
		}
	}

	// Ensure hotels has subscription columns
	if !db.Migrator().HasColumn(&models.Hotel{}, "subscription_tier") {
		if err := db.Exec("ALTER TABLE hotels ADD COLUMN IF NOT EXISTS subscription_tier varchar(20) DEFAULT 'free';").Error; err != nil {
			log.Println("Warning: failed to add subscription_tier column:", err)
		}
	}
	if !db.Migrator().HasColumn(&models.Hotel{}, "booking_limit_per_day") {
		if err := db.Exec("ALTER TABLE hotels ADD COLUMN IF NOT EXISTS booking_limit_per_day integer DEFAULT 5;").Error; err != nil {
			log.Println("Warning: failed to add booking_limit_per_day column:", err)
		}
	}
	if !db.Migrator().HasColumn(&models.Hotel{}, "subscription_status") {
		if err := db.Exec("ALTER TABLE hotels ADD COLUMN IF NOT EXISTS subscription_status varchar(20) DEFAULT 'active';").Error; err != nil {
			log.Println("Warning: failed to add subscription_status column:", err)
		}
	}
	if !db.Migrator().HasColumn(&models.Hotel{}, "subscription_end_date") {
		if err := db.Exec("ALTER TABLE hotels ADD COLUMN IF NOT EXISTS subscription_end_date timestamptz;").Error; err != nil {
			log.Println("Warning: failed to add subscription_end_date column:", err)
		}
	}
	if !db.Migrator().HasColumn(&models.Hotel{}, "last_payment_date") {
		if err := db.Exec("ALTER TABLE hotels ADD COLUMN IF NOT EXISTS last_payment_date timestamptz;").Error; err != nil {
			log.Println("Warning: failed to add last_payment_date column:", err)
		}
	}

	// Ensure admins has new columns for super admin support
	if !db.Migrator().HasColumn(&models.Admin{}, "is_super_admin") {
		if err := db.Exec("ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;").Error; err != nil {
			log.Println("Warning: failed to add is_super_admin column:", err)
		}
	}
	if !db.Migrator().HasColumn(&models.Admin{}, "status") {
		if err := db.Exec("ALTER TABLE admins ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'active';").Error; err != nil {
			log.Println("Warning: failed to add status column to admins:", err)
		}
	}
	if !db.Migrator().HasColumn(&models.Admin{}, "deleted_at") {
		if err := db.Exec("ALTER TABLE admins ADD COLUMN IF NOT EXISTS deleted_at timestamptz;").Error; err != nil {
			log.Println("Warning: failed to add deleted_at column to admins:", err)
		}
	}
	if !db.Migrator().HasColumn(&models.Admin{}, "updated_at") {
		if err := db.Exec("ALTER TABLE admins ADD COLUMN IF NOT EXISTS updated_at bigint DEFAULT 0;").Error; err != nil {
			log.Println("Warning: failed to add updated_at column to admins:", err)
		}
	}

	// Seed default Plan Settings if empty
	var planCount int64
	if err := db.Model(&models.PlanSetting{}).Count(&planCount).Error; err == nil && planCount == 0 {
		db.Create([]models.PlanSetting{
			{TierName: "free", Price: 0, BookingLimitPerDay: 5, FeatureOnlinePayment: false, FeatureReports: false, FeatureStaffPayroll: false, FeatureHousekeeping: false, FeatureEmailNotify: false, FeatureSeasonalPricing: false, FeatureChannelManager: false},
			{TierName: "pro", Price: 999, BookingLimitPerDay: 50, FeatureOnlinePayment: true, FeatureReports: true, FeatureStaffPayroll: false, FeatureHousekeeping: true, FeatureEmailNotify: true, FeatureSeasonalPricing: true, FeatureChannelManager: true},
			{TierName: "premium", Price: 2499, BookingLimitPerDay: 999999, FeatureOnlinePayment: true, FeatureReports: true, FeatureStaffPayroll: true, FeatureHousekeeping: true, FeatureEmailNotify: true, FeatureSeasonalPricing: true, FeatureChannelManager: true},
		})
		log.Println("Seeded default subscription plan settings (Free, Pro, Premium)")
	}

	// Ensure system_settings has an index on hotel_id for fast settings lookups.
	if err := db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_system_settings_hotel_id ON system_settings(hotel_id);").Error; err != nil {
		log.Println("Warning: failed to ensure index on system_settings.hotel_id:", err)
	}

	// Availability query performance indexes.
	// These match the booking availability filter pattern used in booking_controller.
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_bookings_availability_lookup ON bookings(hotel_id, room_id, check_in_date, check_out_date) WHERE deleted_at IS NULL;").Error; err != nil {
		log.Println("Warning: failed to ensure index on bookings availability columns:", err)
	}
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_bookings_status_lower ON bookings((LOWER(status))) WHERE deleted_at IS NULL;").Error; err != nil {
		log.Println("Warning: failed to ensure functional index on bookings status:", err)
	}
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_rooms_availability_lookup ON rooms(hotel_id, room_number) WHERE deleted_at IS NULL;").Error; err != nil {
		log.Println("Warning: failed to ensure index on rooms availability columns:", err)
	}
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_rooms_status_lower ON rooms((LOWER(status))) WHERE deleted_at IS NULL;").Error; err != nil {
		log.Println("Warning: failed to ensure functional index on rooms status:", err)
	}
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_rooms_hotel_room_type ON rooms(hotel_id, room_type) WHERE deleted_at IS NULL;").Error; err != nil {
		log.Println("Warning: failed to ensure index on rooms room_type filter:", err)
	}
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_room_images_primary_lookup ON room_images(room_id, is_primary DESC, \"order\" ASC, id ASC) WHERE deleted_at IS NULL;").Error; err != nil {
		log.Println("Warning: failed to ensure index on room_images primary lookup:", err)
	}
	if err := db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_sync_jobs_dedupe_key ON integration_sync_jobs(dedupe_key) WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';").Error; err != nil {
		log.Println("Warning: failed to ensure unique index on integration_sync_jobs.dedupe_key:", err)
	}
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_retry ON integration_sync_jobs(status, next_retry_at);").Error; err != nil {
		log.Println("Warning: failed to ensure retry index on integration_sync_jobs:", err)
	}
	if err := db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_webhook_events_provider_event ON integration_webhook_events(provider, event_type, hotel_id, provider_event_id) WHERE provider_event_id IS NOT NULL AND provider_event_id <> '';").Error; err != nil {
		log.Println("Warning: failed to ensure unique provider event index on integration_webhook_events:", err)
	}

	// Ensure invoices has the `status` column for legacy invoice edit flows.
	// Some existing DBs were created before this field existed.
	if !db.Migrator().HasColumn(&models.Invoice{}, "status") && !db.Migrator().HasColumn(&models.Invoice{}, "Status") {
		log.Println("invoices.status column missing — adding column now")
		if err := db.Exec("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'unpaid';").Error; err != nil {
			log.Println("Warning: failed to add status column to invoices:", err)
		} else {
			if err := db.Exec("UPDATE invoices SET status = 'unpaid' WHERE status IS NULL OR status = '';").Error; err != nil {
				log.Println("Warning: failed to backfill invoices.status:", err)
			}
			log.Println("Added invoices.status column successfully")
		}
	}

	// Clean up old tax_cgst/tax_sgst columns if they still exist after rename migration.
	if db.Migrator().HasColumn(&models.Invoice{}, "tax_cgst") {
		log.Println("invoices: dropping legacy tax_cgst column")
		if err := db.Exec("ALTER TABLE invoices DROP COLUMN IF EXISTS tax_cgst;").Error; err != nil {
			log.Println("Warning: failed to drop tax_cgst:", err)
		}
	}
	if db.Migrator().HasColumn(&models.Invoice{}, "tax_sgst") {
		log.Println("invoices: dropping legacy tax_sgst column")
		if err := db.Exec("ALTER TABLE invoices DROP COLUMN IF EXISTS tax_sgst;").Error; err != nil {
			log.Println("Warning: failed to drop tax_sgst:", err)
		}
	}
	// Add tax_part1/tax_part2 if they don't exist yet (fresh installs)
	if err := db.Exec("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_part1 numeric DEFAULT 0;").Error; err != nil {
		log.Println("Warning: failed to ensure tax_part1 column:", err)
	}
	if err := db.Exec("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_part2 numeric DEFAULT 0;").Error; err != nil {
		log.Println("Warning: failed to ensure tax_part2 column:", err)
	}

	// If AutoMigrate didn't create room_images table (migration skipped earlier), ensure it exists now.
	if !db.Migrator().HasTable(&models.RoomImage{}) {
		log.Println("room_images table missing — creating table now")
		createSQL := `CREATE TABLE IF NOT EXISTS room_images (
		    id serial PRIMARY KEY,
		    room_type_id integer NOT NULL DEFAULT 0,
		    room_id integer,
		    url text,
		    cloudinary_public_id text,
		    "order" integer,
		    is_primary boolean DEFAULT false,
		    created_at timestamptz DEFAULT now(),
		    deleted_at timestamptz
		);`
		if err := db.Exec(createSQL).Error; err != nil {
			log.Println("Warning: failed to create room_images table:", err)
		} else {
			if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_room_images_room_type_id ON room_images(room_type_id);").Error; err != nil {
				log.Println("Warning: failed to create index on room_images.room_type_id:", err)
			}
		}
	}
}

// ConnectDBNoAutoMigrate connects to the DB without running GORM AutoMigrate.
func ConnectDBNoAutoMigrate() {
	// Load .env
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
		return
	}

	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	dbname := os.Getenv("DB_DATABASE")
	user := os.Getenv("DB_USERNAME")
	password := os.Getenv("DB_PASSWORD")
	tz := strings.TrimSpace(os.Getenv("DB_TIMEZONE"))
	if tz == "" {
		tz = "Asia/Kolkata"
	}

	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=%s",
		host, user, password, dbname, port, tz,
	)

	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true,
	}), gormConfig())
	if err != nil {
		log.Fatal("Failed to connect to database: ", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatal("Failed to extract sql.DB from gorm: ", err)
	}
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)

	DB = db
}

// ensureTimestampColumns inspects known tables for bigint epoch timestamp columns
// and converts them to timestamptz using to_timestamp(...). This prevents
// GORM AutoMigrate from attempting an invalid cast.
func ensureTimestampColumns(db *gorm.DB) {
	// handle known tables/columns that may store epoch bigints
	targets := map[string][]string{
		"rooms": {"created_at", "updated_at"},
	}
	for tbl, cols := range targets {
		for _, col := range cols {
			var dataType, udtName string
			// check both data_type and udt_name for robust detection (int8 / bigint)
			row := db.Raw("SELECT data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = ?", tbl, col).Row()
			if err := row.Scan(&dataType, &udtName); err != nil {
				// table/column may not exist yet
				continue
			}
			ldt := strings.ToLower(dataType)
			ludt := strings.ToLower(udtName)
			if !(strings.Contains(ldt, "bigint") || ludt == "int8") {
				// not a bigint/int8 column — skip
				continue
			}
			// determine whether values are seconds or milliseconds
			var maxVal sql.NullInt64
			q := fmt.Sprintf("SELECT max(%s) FROM %s", col, tbl)
			if err := db.Raw(q).Row().Scan(&maxVal); err != nil {
				log.Printf("ensureTimestampColumns: failed to get max for %s.%s: %v", tbl, col, err)
				continue
			}
			// If there are no non-NULL values, maxVal will be NULL. We should still
			// perform the safe temp-column conversion (preserving NULLs) rather than
			// letting GORM attempt a direct cast which will fail. Default to seconds
			// when max is NULL.
			isMillis := false
			if maxVal.Valid {
				if maxVal.Int64 > 1000000000000 {
					isMillis = true
				}
			}

			// Use a safe conversion: create a temporary timestamptz column, populate it using to_timestamp(...),
			// drop the old bigint column and rename the temp column. Do this inside a transaction.
			tempCol := fmt.Sprintf("%s_tmp_ts", col)
			convertErr := db.Transaction(func(tx *gorm.DB) error {
				// add temp column
				addSQL := fmt.Sprintf("ALTER TABLE public.%s ADD COLUMN %s timestamptz;", tbl, tempCol)
				if err := tx.Exec(addSQL).Error; err != nil {
					return err
				}
				// populate temp column
				if isMillis {
					if err := tx.Exec(fmt.Sprintf("UPDATE public.%s SET %s = to_timestamp(%s / 1000.0) WHERE %s IS NOT NULL;", tbl, tempCol, col, col)).Error; err != nil {
						return err
					}
				} else {
					if err := tx.Exec(fmt.Sprintf("UPDATE public.%s SET %s = to_timestamp(%s) WHERE %s IS NOT NULL;", tbl, tempCol, col, col)).Error; err != nil {
						return err
					}
				}
				// drop old column
				if err := tx.Exec(fmt.Sprintf("ALTER TABLE public.%s DROP COLUMN %s;", tbl, col)).Error; err != nil {
					return err
				}
				// rename temp to original
				if err := tx.Exec(fmt.Sprintf("ALTER TABLE public.%s RENAME COLUMN %s TO %s;", tbl, tempCol, col)).Error; err != nil {
					return err
				}
				return nil
			})
			if convertErr != nil {
				log.Printf("ensureTimestampColumns: failed to convert %s.%s using temp-column method: %v", tbl, col, convertErr)
			} else {
				log.Printf("ensureTimestampColumns: converted %s.%s from bigint epoch to timestamptz (temp-column swap)", tbl, col)
			}
		}
	}
}

// EnsureTimestampColumns is an exported wrapper to run the safe bigint->timestamptz
// conversion from external tools or CLI helpers.
func EnsureTimestampColumns(db *gorm.DB) {
	ensureTimestampColumns(db)
}
