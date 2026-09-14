-- Migration 008: Add payment gateway columns to hotels table
-- Adds PhonePe credentials + payment_gateway selector

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS payment_gateway      VARCHAR(50)  DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS phonepe_merchant_id  VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS phonepe_salt_key     VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS phonepe_salt_index   VARCHAR(20)  DEFAULT '1',
  ADD COLUMN IF NOT EXISTS phonepe_env          VARCHAR(20)  DEFAULT 'UAT';
