#!/bin/bash

# Super Admin Migration Script
# This script helps migrate your database to support Super Admin features

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== HMS Super Admin Migration ===${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env file with database credentials"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '#' | xargs)

# Check if database credentials are set
if [ -z "$DB_HOST" ] || [ -z "$DB_USERNAME" ] || [ -z "$DB_DATABASE" ]; then
    echo -e "${RED}Error: Database credentials not found in .env${NC}"
    exit 1
fi

echo -e "${YELLOW}Database Configuration:${NC}"
echo "Host: $DB_HOST"
echo "Database: $DB_DATABASE"
echo "User: $DB_USERNAME"
echo ""

# Ask for confirmation
read -p "Do you want to proceed with the migration? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Migration cancelled"
    exit 0
fi

# Create backup
echo -e "${YELLOW}Creating database backup...${NC}"
BACKUP_FILE="hmscrm_backup_$(date +%Y%m%d_%H%M%S).sql"
PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE > $BACKUP_FILE
echo -e "${GREEN}Backup created: $BACKUP_FILE${NC}"
echo ""

# Run migration
echo -e "${YELLOW}Running migration...${NC}"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE -f migrations/add_super_admin_support.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Migration completed successfully!${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Update .env with Super Admin credentials:"
    echo "   SUPER_ADMIN_USERNAME=superadmin"
    echo "   SUPER_ADMIN_PASSWORD=YourSecurePassword"
    echo ""
    echo "2. Restart the HMS application"
    echo ""
    echo "3. Test Super Admin login:"
    echo "   curl -X POST http://localhost:8080/api/super-admin/login \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -d '{\"username\":\"superadmin\",\"password\":\"YourSecurePassword\"}'"
else
    echo -e "${RED}Migration failed!${NC}"
    echo "Backup file: $BACKUP_FILE"
    exit 1
fi
