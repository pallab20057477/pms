# Super Admin API Documentation

## Base URL
```
http://localhost:8080/api/super-admin
```

## Authentication

All endpoints (except login) require a Bearer token in the Authorization header:

```
Authorization: Bearer {token}
```

## Endpoints

### 1. Authentication

#### Super Admin Login
```
POST /api/super-admin/login
Content-Type: application/json

Request:
{
  "username": "superadmin",
  "password": "SuperAdmin@2026"
}

Response (200):
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "super_admin",
  "username": "superadmin"
}

Error (401):
{
  "error": "Invalid super admin credentials"
}
```

---

### 2. Dashboard

#### Get Dashboard Statistics
```
GET /api/super-admin/dashboard
Authorization: Bearer {token}

Response (200):
{
  "total_admins": 50,
  "total_hotels": 120,
  "active_hotels": 95,
  "suspended_hotels": 5,
  "premium_hotels": 40,
  "free_hotels": 80,
  "total_bookings_today": 250,
  "total_revenue_today": 45000.50
}
```

---

### 3. Admin Management

#### List All Admins
```
GET /api/super-admin/admins?page=1&page_size=10
Authorization: Bearer {token}

Query Parameters:
- page (optional): Page number (default: 1)
- page_size (optional): Items per page (default: 10, max: 100)

Response (200):
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
    },
    {
      "id": 2,
      "username": "sarah_resort",
      "name": "Sarah Smith",
      "email": "sarah@resort.com",
      "phone": "9876543211",
      "is_super_admin": false,
      "status": "active",
      "hotel_count": 2,
      "created_at": "2026-04-13T15:45:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "page_size": 10,
  "total_pages": 5
}
```

#### Create New Admin
```
POST /api/super-admin/admins
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "username": "new_owner",
  "email": "owner@hotel.com",
  "name": "New Hotel Owner",
  "phone": "9876543212",
  "password": "SecurePassword123"
}

Response (201):
{
  "message": "Admin created successfully",
  "admin": {
    "id": 51,
    "username": "new_owner",
    "email": "owner@hotel.com",
    "name": "New Hotel Owner"
  }
}

Error (400):
{
  "error": "Username already exists"
}
```

#### Suspend Admin
```
PUT /api/super-admin/admins/:admin_id/suspend
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "reason": "Non-payment for 3 months"
}

Response (200):
{
  "message": "Admin suspended successfully"
}

Error (400):
{
  "error": "cannot suspend super admin"
}
```

#### Activate Admin
```
PUT /api/super-admin/admins/:admin_id/activate
Authorization: Bearer {token}

Response (200):
{
  "message": "Admin activated successfully"
}
```

#### Get Admin's Hotels
```
GET /api/super-admin/admins/:admin_id/hotels
Authorization: Bearer {token}

Response (200):
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
      "name": "Budget Inn",
      "subscription_tier": "free",
      "status": "active",
      "created_at": "2026-04-13T15:45:00Z"
    }
  ]
}
```

---

### 4. Hotel Management

#### List All Hotels
```
GET /api/super-admin/hotels?page=1&page_size=10
Authorization: Bearer {token}

Query Parameters:
- page (optional): Page number (default: 1)
- page_size (optional): Items per page (default: 10, max: 100)

Response (200):
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

#### Create Hotel for Admin
```
POST /api/super-admin/hotels
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "admin_id": 1,
  "hotel_name": "New Luxury Hotel",
  "city": "Mumbai",
  "state": "Maharashtra",
  "phone": "9876543213",
  "email": "hotel@example.com",
  "address": "123 Main Street, Mumbai"
}

Response (201):
{
  "message": "Hotel created successfully",
  "hotel": {
    "id": 121,
    "name": "New Luxury Hotel",
    "subscription_tier": "free",
    "booking_limit_per_day": 5
  }
}
```

#### Get Hotel Usage
```
GET /api/super-admin/hotels/:hotel_id/usage
Authorization: Bearer {token}

Response (200):
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

---

### 5. Subscription Management

#### Update Hotel Subscription
```
PUT /api/super-admin/hotels/subscription
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "hotel_id": 5,
  "tier": "premium",
  "reason": "Customer paid for upgrade"
}

Response (200):
{
  "message": "Subscription updated successfully"
}

Valid tiers: "free", "premium"
```

#### Suspend Hotel
```
PUT /api/super-admin/hotels/:hotel_id/suspend
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "reason": "Payment failed - card declined"
}

Response (200):
{
  "message": "Hotel suspended successfully"
}
```

#### Activate Hotel
```
PUT /api/super-admin/hotels/:hotel_id/activate
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "reason": "Payment received"
}

Response (200):
{
  "message": "Hotel activated successfully"
}
```

#### Get Subscription Logs
```
GET /api/super-admin/subscription-logs?page=1&page_size=20&hotel_id=5
Authorization: Bearer {token}

Query Parameters:
- page (optional): Page number (default: 1)
- page_size (optional): Items per page (default: 20, max: 100)
- hotel_id (optional): Filter by hotel ID

Response (200):
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
    },
    {
      "id": 2,
      "hotel_id": 5,
      "admin_id": 1,
      "action": "suspended",
      "old_tier": "premium",
      "new_tier": "premium",
      "reason": "Payment failed",
      "created_at": "2026-04-13T15:45:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "page_size": 20,
  "total_pages": 8
}

Possible actions:
- "created": Subscription created
- "upgraded": Tier upgraded
- "downgraded": Tier downgraded
- "suspended": Subscription suspended
- "activated": Subscription activated
- "updated": Subscription updated
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid request parameters"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid token"
}
```

### 403 Forbidden
```json
{
  "error": "Super admin access required"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting

- Login endpoint: 5 requests per minute per IP
- Other endpoints: 100 requests per minute per token

---

## Pagination

All list endpoints support pagination:

```
GET /api/super-admin/admins?page=2&page_size=20
```

Response includes:
- `data`: Array of items
- `total`: Total number of items
- `page`: Current page
- `page_size`: Items per page
- `total_pages`: Total number of pages

---

## Subscription Tiers

### Free Tier
- Booking limit: 5 per day
- Features: Basic booking, check-in/check-out
- Payment: Manual (cash only)
- Reports: Basic

### Premium Tier
- Booking limit: Unlimited
- Features: All features enabled
- Payment: Razorpay integration
- Reports: Advanced analytics
- Staff payroll: Enabled
- Seasonal pricing: Enabled

---

## Status Values

### Admin Status
- `active`: Admin can login and manage hotels
- `suspended`: Admin cannot login
- `inactive`: Admin account disabled

### Hotel Status
- `active`: Hotel is operational
- `suspended`: Hotel cannot create bookings

### Subscription Status
- `active`: Subscription is valid
- `suspended`: Subscription suspended (payment issue)
- `expired`: Subscription expired

---

## Examples

### Example 1: Create Admin and Hotel

```bash
# 1. Login as super admin
curl -X POST http://localhost:8080/api/super-admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "superadmin",
    "password": "SuperAdmin@2026"
  }'

# Response: {"token": "...", "role": "super_admin"}

# 2. Create new admin
curl -X POST http://localhost:8080/api/super-admin/admins \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "new_owner",
    "email": "owner@hotel.com",
    "name": "New Owner",
    "phone": "9876543210",
    "password": "SecurePass123"
  }'

# Response: {"message": "Admin created successfully", "admin": {"id": 51, ...}}

# 3. Create hotel for admin
curl -X POST http://localhost:8080/api/super-admin/hotels \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "admin_id": 51,
    "hotel_name": "New Hotel",
    "city": "Mumbai",
    "state": "Maharashtra"
  }'

# Response: {"message": "Hotel created successfully", "hotel": {"id": 121, ...}}

# 4. Upgrade hotel to premium
curl -X PUT http://localhost:8080/api/super-admin/hotels/subscription \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "hotel_id": 121,
    "tier": "premium",
    "reason": "Customer paid for upgrade"
  }'

# Response: {"message": "Subscription updated successfully"}
```

### Example 2: Monitor Hotel Usage

```bash
# Get hotel usage
curl -X GET http://localhost:8080/api/super-admin/hotels/121/usage \
  -H "Authorization: Bearer {token}"

# Response:
# {
#   "hotel_id": 121,
#   "hotel_name": "New Hotel",
#   "subscription_tier": "premium",
#   "booking_limit_per_day": 999999,
#   "bookings_today": 12,
#   "bookings_this_month": 250,
#   "usage_percent": 0.0012,
#   "limit_reached": false
# }
```

---

## Integration Guide

### Frontend Integration

```javascript
// Login
const response = await fetch('http://localhost:8080/api/super-admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'superadmin',
    password: 'SuperAdmin@2026'
  })
});

const data = await response.json();
localStorage.setItem('token', data.token);

// Get dashboard stats
const statsResponse = await fetch('http://localhost:8080/api/super-admin/dashboard', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
});

const stats = await statsResponse.json();
console.log(stats);
```

---

## Support

For issues or questions:
1. Check the logs: `docker logs hms-backend`
2. Verify database connection
3. Check JWT token validity
4. Review subscription status in database
