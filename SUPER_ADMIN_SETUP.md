# Super Admin System - Setup & Implementation Guide

## Overview

This is a production-ready Super Admin system that allows you to manage multiple hotel owners, their subscriptions, and usage limits. The system supports:

- **Two-tier authentication**: Super Admin (you) and Regular Admins (hotel owners)
- **Subscription management**: Free (5 bookings/day) and Premium (unlimited)
- **Multi-hotel support**: Each admin can manage multiple hotels
- **Usage tracking**: Monitor bookings, revenue, and activity
- **Admin controls**: Suspend/activate hotels and admins

## Architecture

```
Super Admin (You)
├── Manages all admins
├── Manages all hotels
├── Controls subscriptions
└── Views analytics

Admin 1 (Hotel Owner)
├── Hotel A (Free tier - 5 bookings/day)
├── Hotel B (Premium tier - unlimited)
└── Hotel C (Free tier - 5 bookings/day)

Admin 2 (Hotel Owner)
├── Hotel D (Premium tier)
└── Hotel E (Free tier)
```

## Setup Instructions

### 1. Environment Configuration

Update your `.env` file with Super Admin credentials:

```env
# Super Admin credentials (change these in production!)
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_PASSWORD=SuperAdmin@2026
```

**Important**: Change these credentials in production to something secure.

### 2. Database Migration

The system automatically creates new tables on startup:
- `subscriptions` - Tracks subscription tier and status
- `subscription_logs` - Audit trail of subscription changes

No manual migration needed. Just restart your application.

### 3. Verify Installation

Check that all files are created:
```
hms/models/subscription.go
hms/services/super_admin_service.go
hms/controllers/super_admin_controller.go
hms/middleware/super_admin_auth.go
hms/middleware/booking_limit.go
hms/routes/super_admin_routes.go
```

## API Endpoints

### Super Admin Authentication

**Login as Super Admin**
```
POST /api/super-admin/login
Content-Type: application/json

{
  "username": "superadmin",
  "password": "SuperAdmin@2026"
}

Response:
{
  "token": "eyJhbGc...",
  "role": "super_admin",
  "username": "superadmin"
}
```

### Dashboard & Analytics

**Get Dashboard Statistics**
```
GET /api/super-admin/dashboard
Authorization: Bearer {token}

Response:
{
  "total_admins": 50,
  "total_hotels": 120,
  "active_hotels": 95,
  "suspended_hotels": 5,
  "premium_hotels": 40,
  "free_hotels": 80,
  "total_bookings_today": 250,
  "total_revenue_today": 45000
}
```

### Admin Management

**List All Admins**
```
GET /api/super-admin/admins?page=1&page_size=10
Authorization: Bearer {token}

Response:
{
  "data": [
    {
      "id": 1,
      "username": "john_hotel",
      "name": "John Doe",
      "email": "john@hotel.com",
      "phone": "9876543210",
      "is_super_admin": false,
      "status": "active",
      "hotel_count": 3,
      "created_at": "2026-04-14T10:30:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "page_size": 10,
  "total_pages": 5
}
```

**Create New Admin**
```
POST /api/super-admin/admins
Authorization: Bearer {token}
Content-Type: application/json

{
  "username": "new_hotel_owner",
  "email": "owner@hotel.com",
  "name": "Hotel Owner Name",
  "phone": "9876543210",
  "password": "SecurePassword123"
}

Response:
{
  "message": "Admin created successfully",
  "admin": {
    "id": 51,
    "username": "new_hotel_owner",
    "email": "owner@hotel.com",
    "name": "Hotel Owner Name"
  }
}
```

**Suspend Admin**
```
PUT /api/super-admin/admins/:admin_id/suspend
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Non-payment"
}

Response:
{
  "message": "Admin suspended successfully"
}
```

**Activate Admin**
```
PUT /api/super-admin/admins/:admin_id/activate
Authorization: Bearer {token}

Response:
{
  "message": "Admin activated successfully"
}
```

### Hotel Management

**List All Hotels**
```
GET /api/super-admin/hotels?page=1&page_size=10
Authorization: Bearer {token}

Response:
{
  "data": [
    {
      "id": 1,
      "name": "Grand Hotel",
      "admin_id": 1,
      "admin_name": "John Doe",
      "admin_email": "john@hotel.com",
      "subscription_tier": "premium",
      "subscription_status": "active",
      "booking_limit_per_day": 999999,
      "bookings_today": 45,
      "status": "active",
      "created_at": "2026-04-14T10:30:00Z"
    }
  ],
  "total": 120,
  "page": 1,
  "page_size": 10,
  "total_pages": 12
}
```

**Create Hotel for Admin**
```
POST /api/super-admin/hotels
Authorization: Bearer {token}
Content-Type: application/json

{
  "admin_id": 1,
  "hotel_name": "New Hotel",
  "city": "Mumbai",
  "state": "Maharashtra",
  "phone": "9876543210",
  "email": "hotel@example.com",
  "address": "123 Main Street"
}

Response:
{
  "message": "Hotel created successfully",
  "hotel": {
    "id": 121,
    "name": "New Hotel",
    "subscription_tier": "free",
    "booking_limit_per_day": 5
  }
}
```

**Get Hotel Usage**
```
GET /api/super-admin/hotels/:hotel_id/usage
Authorization: Bearer {token}

Response:
{
  "hotel_id": 1,
  "hotel_name": "Grand Hotel",
  "subscription_tier": "premium",
  "booking_limit_per_day": 999999,
  "bookings_today": 45,
  "bookings_this_month": 1250,
  "usage_percent": 0.0045,
  "limit_reached": false
}
```

### Subscription Management

**Update Hotel Subscription**
```
PUT /api/super-admin/hotels/subscription
Authorization: Bearer {token}
Content-Type: application/json

{
  "hotel_id": 5,
  "tier": "premium",
  "reason": "Customer paid for upgrade"
}

Response:
{
  "message": "Subscription updated successfully"
}
```

**Suspend Hotel**
```
PUT /api/super-admin/hotels/:hotel_id/suspend
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Payment failed"
}

Response:
{
  "message": "Hotel suspended successfully"
}
```

**Activate Hotel**
```
PUT /api/super-admin/hotels/:hotel_id/activate
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Payment received"
}

Response:
{
  "message": "Hotel activated successfully"
}
```

**Get Subscription Logs**
```
GET /api/super-admin/subscription-logs?page=1&page_size=20&hotel_id=5
Authorization: Bearer {token}

Response:
{
  "data": [
    {
      "id": 1,
      "hotel_id": 5,
      "admin_id": 1,
      "action": "upgraded",
      "old_tier": "free",
      "new_tier": "premium",
      "reason": "Customer paid for upgrade",
      "created_at": "2026-04-14T10:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "page_size": 20,
  "total_pages": 8
}
```

### Admin Hotels

**Get All Hotels for Admin**
```
GET /api/super-admin/admins/:admin_id/hotels
Authorization: Bearer {token}

Response:
{
  "admin_id": 1,
  "hotels": [
    {
      "id": 1,
      "name": "Grand Hotel",
      "subscription_tier": "premium",
      "status": "active",
      "created_at": "2026-04-14T10:30:00Z"
    },
    {
      "id": 2,
      "name": "Budget Hotel",
      "subscription_tier": "free",
      "status": "active",
      "created_at": "2026-04-14T10:30:00Z"
    }
  ]
}
```

## Regular Admin Login

Regular admins (hotel owners) login normally:

```
POST /api/login
Content-Type: application/json

{
  "username": "john_hotel",
  "password": "password123"
}

Response:
{
  "token": "eyJhbGc...",
  "active_hotel_id": 1,
  "last_active_hotel_id": 1,
  "role": "admin"
}
```

## Subscription Tiers

### Free Tier
- 5 bookings per day limit
- Basic features only
- No Razorpay integration
- No advanced reports
- No staff payroll

### Premium Tier
- Unlimited bookings
- All features enabled
- Razorpay integration
- Advanced reports
- Staff payroll
- Seasonal pricing

## Booking Limit Enforcement

When a hotel reaches its booking limit:

```
POST /api/bookings
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "guest_id": 1,
  "room_id": 5,
  "check_in_date": "2026-04-20",
  "check_out_date": "2026-04-22"
}

Response (if limit reached):
{
  "error": "Booking limit reached for today",
  "message": "You have reached the daily booking limit for your Free tier. Please upgrade to Premium for unlimited bookings.",
  "tier": "free",
  "limit": 5
}
```

## Production Deployment Checklist

- [ ] Change `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` in `.env`
- [ ] Set `GIN_MODE=release` in `.env`
- [ ] Use strong `JWT_SECRET` (minimum 32 characters)
- [ ] Enable HTTPS/SSL
- [ ] Set up database backups
- [ ] Configure email notifications
- [ ] Test all subscription tier features
- [ ] Set up monitoring and alerts
- [ ] Document your pricing model
- [ ] Create admin onboarding guide

## Security Best Practices

1. **Super Admin Credentials**: Store in secure environment variables, never in code
2. **JWT Secret**: Use a strong, random secret (minimum 32 characters)
3. **HTTPS**: Always use HTTPS in production
4. **Rate Limiting**: Implement rate limiting on login endpoints
5. **Audit Logs**: All subscription changes are logged
6. **Admin Status**: Suspended admins cannot login
7. **Hotel Status**: Suspended hotels cannot create bookings

## Troubleshooting

### Super Admin Login Fails
- Check `.env` file has `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD`
- Verify credentials are correct
- Check database connection

### Booking Limit Not Working
- Verify hotel has correct `subscription_tier` in database
- Check `booking_limit_per_day` is set correctly
- Ensure middleware is applied to booking creation endpoint

### Subscription Changes Not Logged
- Check `subscription_logs` table exists
- Verify database permissions

## Support

For issues or questions, check:
1. Database logs
2. Application logs
3. Subscription logs table
4. Activity logs table

## Next Steps

1. Create a Super Admin Dashboard UI (React component)
2. Set up automated billing/payment collection
3. Create admin onboarding workflow
4. Set up email notifications for subscription changes
5. Implement usage analytics and reporting
