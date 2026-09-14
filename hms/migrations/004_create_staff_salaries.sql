-- 004_create_staff_salaries.sql
-- Migration for staff_salaries table (hotel-specific)

CREATE TABLE IF NOT EXISTS staff_salaries (
    id SERIAL PRIMARY KEY,
    hotel_id INTEGER NOT NULL,
    staff_id INTEGER NOT NULL,
    month VARCHAR(10) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(10) NOT NULL,
    paid_on DATE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_salaries_hotel_staff ON staff_salaries(hotel_id, staff_id);
