-- Migration: Add Super Admin Support
-- This migration adds the necessary columns for multi-hotel and subscription support

-- 1. Add columns to admins table
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'active';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS updated_at bigint;

-- 2. Add admin_id to hotels table (if it doesn't exist)
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS admin_id bigint;

-- 3. Add subscription columns to hotels table
ALTER TABLE hotels ADD COLUMN IF NOT E
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS subscription_status varchar(20) DEFAULT 'active';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS subscription_end_date timestamptz;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS last_payment_date timestamptz;

-- 4. Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id serial PRIMARY KEY,
    hotel_id bigint NOT NULL,
    tier varchar(20) DEFAULT 'free',
    status varchar(20) DEFAULT 'active',
    booking_limit_daily integer DEFAULT 5,
    start_date timestamptz DEFAULT now(),
    end_date timestamptz,
    auto_renew boolean DEFAULT true,
    payment_status varchar(20) DEFAULT 'unpaid',
    last_payment_date timestamptz,
    renewal_date timestamptz,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz,
    FOREIGN KEY (hotel_id) REFERENCES hotels(id)
);

-- 5. Create subscription_logs table
CREATE TABLE IF NOT EXISTS subscription_logs (
    id serial PRIMARY KEY,
    hotel_id bigint NOT NULL,
    admin_id bigint,
    action varchar(50),
    old_tier varchar(20),
    new_tier varchar(20),
    reason text,
    created_at timestamptz DEFAULT now(),
    deleted_at timestamptz,
    FOREIGN KEY (hotel_id) REFERENCES hotels(id)
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_hotel_id ON subscriptions(hotel_id);
CREATE INDEX IF NOT EXISTS idx_subscription_logs_hotel_id ON subscription_logs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_subscription_logs_admin_id ON subscription_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_hotels_admin_id ON hotels(admin_id);

-- 7. Update existing hotels to have a default aXISTS subscription_tier varchar(20) DEFAULT 'free';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS booking_limit_per_day integer DEFAULT 5;dmin_id (first admin in system)
-- This assumes you have at least one admin. Adjust as needed.
UPDATE hotels SET admin_id = (SELECT id FROM admins LIMIT 1) WHERE admin_id IS NULL;

-- 8. Make admin_id NOT NULL after populating existing records
ALTER TABLE hotels ALTER COLUMN admin_id SET NOT NULL;

-- Done!
-- The system is now ready for multi-hotel and subscription support.
