# Database Migration Guide - Super Admin Support

## Overview

This guide helps you migrate your existing HMS database to support the new Super Admin system with multi-hotel and subscription management.

## Prerequisites

- PostgreSQL client or pgAdmin access
- Database backup (recommended)
- Admin access to your HMS database

## Migration Steps

### Step 1: Backup Your Database

Before running any migrations, backup your database:

```bash
# Using pg_dump
pg_dump -U postgres -h localhost hmscrm > hmscrm_backup_$(date +%Y%m%d_%H%M%S).sql

# Or using pgAdmin - right-click database → Backup
```

### Step 2: Run the Migration Script

You have two options:

#### Option A: Using psql (Command Line)

```bash
psql -U postgres -h localhost -d hmscrm -f hms/migrations/add_super_admin_support.sql
```

#### Option B: Using pgAdmin

1. Open pgAdmin
2. Connect to your database
3. Open Query Tool
4. Copy the contents of `hms/migrations/add_super_admin_support.sql`
5. Paste into Query Tool
6. Click Execute

#### Option C: Manual SQL Execution

If you prefer to run commands one by one, execute each section from the migration file.

### Step 3: Verify Migration

After running the migration, verify the changes:

```sql
-- Check admins table has new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'admins' 
ORDER BY ordinal_position;

-- Check hotels table has new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'hotels' 
ORDER BY ordinal_position;

-- Check new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('subscriptions', 'subscription_logs');
```

### Step 4: Restart HMS Application

After migration, restart your HMS application:

```bash
# Stop the current process
# Then restart:
go run main.go

# Or if using the compiled binary:
./hms.exe
```

## What the Migration Does

1. **Adds Super Admin Columns to `admins` table:**
   - `is_super_admin` - Boolean flag for super admin
   - `status` - Admin account status (active/suspended)
   - `deleted_at` - Soft delete timestamp
   - `updated_at` - Last update timestamp

2. **Adds Multi-Hotel Support to `hotels` table:**
   - `admin_id` - Links hotel to admin owner
   - `subscription_tier` - Free or Premium
   - `booking_limit_per_day` - Daily booking limit
   - `subscription_status` - Subscription status
   - `subscription_end_date` - When subscription expires
   - `last_payment_date` - Last payment received

3. **Creates `subscriptions` table:**
   - Tracks subscription details per hotel
   - Stores payment and renewal information

4. **Creates `subscription_logs` table:**
   - Audit trail of all subscription changes
   - Tracks who made changes and why

5. **Creates Indexes:**
   - Improves query performance for lookups

## Troubleshooting

### Error: "column already exists"

This is normal if you've already run the migration. The `IF NOT EXISTS` clause prevents errors.

### Error: "admin_id contains null values"

This happens if you have existing hotels without an admin assigned. The migration script handles this by assigning all hotels to the first admin in the system.

If you want to assign hotels to specific admins manually:

```sql
-- Assign specific hotels to specific admins
UPDATE hotels SET admin_id = 1 WHERE id IN (1, 2, 3);
UPDATE hotels SET admin_id = 2 WHERE id IN (4, 5, 6);
```

### Error: "foreign key constraint"

Make sure the admin exists before assigning hotels:

```sql
-- Check existing admins
SELECT id, username FROM admins;

-- Then assign hotels to valid admin IDs
UPDATE hotels SET admin_id = 1 WHERE admin_id IS NULL;
```

## Rollback (If Needed)

If you need to rollback the migration:

```bash
# Restore from backup
psql -U postgres -h localhost -d hmscrm < hmscrm_backup_YYYYMMDD_HHMMSS.sql
```

## Post-Migration Setup

### 1. Set Super Admin Credentials

Update your `.env` file:

```env
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_PASSWORD=YourSecurePassword123
```

### 2. Test Super Admin Login

```bash
curl -X POST http://localhost:8080/api/super-admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "superadmin",
    "password": "YourSecurePassword123"
  }'
```

### 3. Verify Admin Accounts

```sql
-- Check all admins
SELECT id, username, email, is_super_admin, status FROM admins;

-- Check hotels with admin assignments
SELECT id, name, admin_id, subscription_tier FROM hotels;
```

## Next Steps

1. Create a Super Admin Dashboard UI (React component provided)
2. Set up subscription billing
3. Configure email notifications
4. Test all features with sample data
5. Train staff on new system

## Support

If you encounter issues:

1. Check the application logs: `docker logs hms-backend`
2. Verify database connection
3. Review the migration script for any errors
4. Check PostgreSQL logs for detailed error messages

## Additional Resources

- See `SUPER_ADMIN_SETUP.md` for complete setup guide
- See `SUPER_ADMIN_API.md` for API documentation
- Check `hms/models/subscription.go` for data structure details
