-- Migration 002: convert integer epoch created_at/updated_at columns to timestamptz
-- This converts columns that were stored as Unix epoch seconds (bigint)
BEGIN;

-- Hotels: created_at and updated_at (only if column exists and is bigint)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hotels' AND column_name='created_at' AND data_type IN ('bigint','integer')) THEN
        EXECUTE 'ALTER TABLE hotels ALTER COLUMN created_at TYPE timestamptz USING to_timestamp(created_at)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hotels' AND column_name='updated_at' AND data_type IN ('bigint','integer')) THEN
        EXECUTE 'ALTER TABLE hotels ALTER COLUMN updated_at TYPE timestamptz USING to_timestamp(updated_at)';
    END IF;
END$$;

-- Payments: created_at (only if bigint)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='created_at' AND data_type IN ('bigint','integer')) THEN
        EXECUTE 'ALTER TABLE payments ALTER COLUMN created_at TYPE timestamptz USING to_timestamp(created_at)';
    END IF;
END$$;

COMMIT;
