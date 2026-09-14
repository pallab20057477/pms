-- 003_add_multinational_tax_fields.sql
-- Add country and generic tax fields to hotels for multinational support

ALTER TABLE IF EXISTS hotels
  ADD COLUMN IF NOT EXISTS country text DEFAULT '';

ALTER TABLE IF EXISTS hotels
  ADD COLUMN IF NOT EXISTS tax_type text DEFAULT '';

ALTER TABLE IF EXISTS hotels
  ADD COLUMN IF NOT EXISTS tax_percent numeric DEFAULT 0;