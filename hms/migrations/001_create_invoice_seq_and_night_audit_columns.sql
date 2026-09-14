-- 001_create_invoice_seq_and_invoice_indexes.sql
-- Create invoice sequence and ensure invoice indexes exist

-- create sequence for invoice numbers (idempotent)
CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1000;

-- ensure invoices table has expected unique constraints
-- (GORM will also manage these, but ensure DB-level protection)
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices (invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_invoice_no ON invoices (invoice_no);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_booking_id ON invoices (booking_id);
