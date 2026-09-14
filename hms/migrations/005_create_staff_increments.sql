-- +migrate Up
CREATE TABLE IF NOT EXISTS staff_increments (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    new_salary NUMERIC(12,2) NOT NULL,
    reason TEXT,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- +migrate Down
DROP TABLE IF EXISTS staff_increments;
