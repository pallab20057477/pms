@echo off
REM Super Admin Migration Script for Windows
REM This script helps migrate your database to support Super Admin features

setlocal enabledelayedexpansion

echo.
echo ===== HMS Super Admin Migration =====
echo.

REM Check if .env exists
if not exist ".env" (
    echo Error: .env file not found
    echo Please create .env file with database credentials
    exit /b 1
)

REM Read .env file (simple parsing)
for /f "tokens=1,2 delims==" %%a in (.env) do (
    if "%%a"=="DB_HOST" set DB_HOST=%%b
    if "%%a"=="DB_PORT" set DB_PORT=%%b
    if "%%a"=="DB_USERNAME" set DB_USERNAME=%%b
    if "%%a"=="DB_PASSWORD" set DB_PASSWORD=%%b
    if "%%a"=="DB_DATABASE" set DB_DATABASE=%%b
)

REM Check if database credentials are set
if "!DB_HOST!"=="" (
    echo Error: Database credentials not found in .env
    exit /b 1
)

echo Database Configuration:
echo Host: !DB_HOST!
echo Port: !DB_PORT!
echo Database: !DB_DATABASE!
echo User: !DB_USERNAME!
echo.

REM Ask for confirmation
set /p confirm="Do you want to proceed with the migration? (yes/no): "
if /i not "!confirm!"=="yes" (
    echo Migration cancelled
    exit /b 0
)

REM Create backup
echo Creating database backup...
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)
set BACKUP_FILE=hmscrm_backup_!mydate!_!mytime!.sql

echo Backup file: !BACKUP_FILE!

REM Run pg_dump
set PGPASSWORD=!DB_PASSWORD!
pg_dump -h !DB_HOST! -p !DB_PORT! -U !DB_USERNAME! -d !DB_DATABASE! > !BACKUP_FILE!

if errorlevel 1 (
    echo Error: Failed to create backup
    exit /b 1
)

echo Backup created successfully
echo.

REM Run migration
echo Running migration...
set PGPASSWORD=!DB_PASSWORD!
psql -h !DB_HOST! -p !DB_PORT! -U !DB_USERNAME! -d !DB_DATABASE! -f migrations\add_super_admin_support.sql

if errorlevel 1 (
    echo Error: Migration failed
    echo Backup file: !BACKUP_FILE!
    exit /b 1
)

echo.
echo Migration completed successfully!
echo.
echo Next steps:
echo 1. Update .env with Super Admin credentials:
echo    SUPER_ADMIN_USERNAME=superadmin
echo    SUPER_ADMIN_PASSWORD=YourSecurePassword
echo.
echo 2. Restart the HMS application
echo.
echo 3. Test Super Admin login:
echo    curl -X POST http://localhost:8080/api/super-admin/login ^
echo      -H "Content-Type: application/json" ^
echo      -d "{\"username\":\"superadmin\",\"password\":\"YourSecurePassword\"}"
echo.

endlocal
