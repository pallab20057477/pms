-- Migration: Add avg_rating column to hotels table
-- Description: Added aggregated rating field for enterprise-level booking portal trust indicators
-- Created: 2026-09-10

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS avg_rating FLOAT DEFAULT 0;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_hotels_avg_rating ON hotels(avg_rating);

-- Update existing hotels with average rating from reviews (if any)
UPDATE hotels h
SET avg_rating = COALESCE(
    (SELECT AVG(rating) FROM hotel_reviews hr 
     WHERE hr.hotel_id = h.id 
     AND hr.status = 'published' 
     AND hr.deleted_at IS NULL),
    0
);
