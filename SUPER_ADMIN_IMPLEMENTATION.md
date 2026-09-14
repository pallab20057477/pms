# Super Admin System - Complete Implementation Guide

## 🎯 Overview

A production-ready Super Admin system for managing multiple hotel owners, their subscriptions, and usage limits. This system enables you to sell your HMS to multiple customers with different subscription tiers.

## 📋 What's Included

### Backend Components
- ✅ Super Admin authentication (from .env credentials)
- ✅ Admin management (create, suspend, activate)
- ✅ Hotel management (create, manage, track usage)
- ✅ Subscription management (Free/Premium tiers)
- ✅ Booking limit enforcement
- ✅ Usage tracking and analytics
- ✅ Audit logs for all changes
- ✅ Multi-hotel support per admin

### Frontend Components
- ✅ Super Admin login page
- ✅ Super Admin dashboard with statistics
- ✅ Admin management interface
- ✅ Hotel management interface
- ✅ Subscription controls

### Documentation
- ✅ Setup guide (SUPER_ADMIN_SETUP.md)
- ✅ API documentation (SUPER_ADMIN_API.md)
- ✅ Migration guide (MIGRATION_GUIDE.md)
- ✅ This implementation guide

## 🚀 Quick Start

### 1. Database Migration

Run the migration to add new tables and columns:

**On Windows:**
```bash
cd hms/scripts
migrate_super_admin.bat
```

**On Linux/Mac:**
```bash
cd hms/scripts
chmod +x migrate_super_admin.sh
./migrate_super_admin.sh
```

**Manual Migration:**
```bash
psql -U postgres -h localhost -d hmscrm -f hms/migrations/add_super_admin_support.sql
```

### 2. Configure Super Admin Credentials

Update `.env` file:
```env
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_PASSWORD=SuperAdmin@2026
```

**Important:** Change these in production!

### 3. Restart Application

```bash
# Stop current process
# Then restart:
go run main.go
```

### 4. Test Super Admin Login

```bash
curl -X POST http://localhost:8080/api/super-admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "superadmin",
    "password": "SuperAdmin@2026"
  }'
```

## 📁 File Structure

```
hms/
├── models/
│   ├── admin.go (updated with is_super_admin, status)
│   ├── hotel.go (updated with subscription fields)
│   └── subscription.go (new)
├── services/
│   └── super_admin_service.go (new)
├── controllers/
│   └── super_admin_controller.go (new)
├── middleware/
│   ├── super_admin_auth.go (new)
│   └── booking_limit.go (new)
├── routes/
│   └── super_admin_routes.go (new)
├── migrations/
│   └── add_super_admin_support.sql (new)
└── scripts/
    ├── migrate_super_admin.sh (new)
    └── migrate_super_admin.bat (new)

hms_rect/src/SuperAdmin/
├── SuperAdminLogin.jsx (new)
├── SuperAdminLogin.css (new)
├── SuperAdminDashboard.jsx (new)
└── SuperAdminDashboard.css (new)
```

## 🔐 Authentication Flow

```
User Login Request
    ↓
Check if credentials match SUPER_ADMIN_USERNAME/PASSWORD in .env
    ↓
If YES → Generate token with admin_id=0 (super admin marker)
If NO → Check database for regular admin
    ↓
Return token with role (super_admin or admin)
    ↓
Frontend routes to appropriate dashboard
```

## 💼 Subscription Tiers

### Free Tier
- **Booking Limit:** 5 per day
- **Features:** Basic booking, check-in/check-out
- **Payment:** Manual (cash only)
- **Reports:** Basic
- **Price:** Free

### Premium Tier
- **Booking Limit:** Unlimited
- **Features:** All features enabled
- **Payment:** Razorpay integration
- **Reports:** Advanced analytics
- **Staff Payroll:** Enabled
- **Seasonal Pricing:** Enabled
- **Price:** ₹2,000-5,000/month (configurable)

## 📊 API Endpoints

### Authentication
```
POST /api/super-admin/login
```

### Dashboard
```
GET /api/super-admin/dashboard
```

### Admin Management
```
GET    /api/super-admin/admins
POST   /api/super-admin/admins
PUT    /api/super-admin/admins/:admin_id/suspend
PUT    /api/super-admin/admins/:admin_id/activate
GET    /api/super-admin/admins/:admin_id/hotels
```

### Hotel Management
```
GET    /api/super-admin/hotels
POST   /api/super-admin/hotels
GET    /api/super-admin/hotels/:hotel_id/usage
PUT    /api/super-admin/hotels/subscription
PUT    /api/super-admin/hotels/:hotel_id/suspend
PUT    /api/super-admin/hotels/:hotel_id/activate
```

### Subscription Logs
```
GET    /api/super-admin/subscription-logs
```

See `SUPER_ADMIN_API.md` for complete API documentation.

## 🎨 Frontend Integration

### Add Routes to Your Router

```javascript
// In your routing configuration
import SuperAdminLogin from './SuperAdmin/SuperAdminLogin';
import SuperAdminDashboard from './SuperAdmin/SuperAdminDashboard';

const routes = [
  {
    path: '/super-admin/login',
    element: <SuperAdminLogin />
  },
  {
    path: '/super-admin/dashboard',
    element: <SuperAdminDashboard />,
    protected: true
  }
];
```

### Login Flow

```javascript
// After super admin login
const response = await fetch('/api/super-admin/login', {
  method: 'POST',
  body: JSON.stringify({ username, password })
});

const data = await response.json();
localStorage.setItem('token', data.token);
localStorage.setItem('role', data.role);

// Route based on role
if (data.role === 'super_admin') {
  navigate('/super-admin/dashboard');
} else if (data.role === 'admin') {
  navigate('/admin-dashboard');
}
```

## 🔧 Configuration

### Environment Variables

```env
# Super Admin Credentials
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_PASSWORD=SuperAdmin@2026

# JWT Configuration
JWT_SECRET=your_long_random_secret_here

# Database
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=hmscrm
DB_USERNAME=postgres
DB_PASSWORD=your_password
```

### Subscription Pricing (Configure in Code)

Edit `hms/services/super_admin_service.go` to customize:
- Booking limits per tier
- Feature availability per tier
- Pricing tiers

## 📈 Usage Tracking

The system automatically tracks:
- Daily bookings per hotel
- Monthly bookings per hotel
- Revenue per hotel
- Subscription changes
- Admin activities

Access via:
```
GET /api/super-admin/hotels/:hotel_id/usage
GET /api/super-admin/subscription-logs
```

## 🛡️ Security Features

1. **Role-Based Access Control**
   - Super admin (admin_id=0)
   - Regular admin (admin_id>0)

2. **Booking Limit Enforcement**
   - Automatic limit checking before booking creation
   - Prevents free tier abuse

3. **Admin Status Control**
   - Suspended admins cannot login
   - Suspended hotels cannot create bookings

4. **Audit Logging**
   - All subscription changes logged
   - Admin actions tracked
   - Timestamps recorded

5. **JWT Authentication**
   - Secure token-based auth
   - 12-hour token expiration
   - HMAC-SHA256 signing

## 🧪 Testing

### Test Super Admin Login
```bash
curl -X POST http://localhost:8080/api/super-admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "superadmin",
    "password": "SuperAdmin@2026"
  }'
```

### Test Dashboard
```bash
curl -X GET http://localhost:8080/api/super-admin/dashboard \
  -H "Authorization: Bearer {token}"
```

### Test Create Admin
```bash
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
```

## 🐛 Troubleshooting

### Build Errors
```
Error: undefined utils.ValidateJWT
Solution: Use utils.ParseJWT instead
```

### Database Migration Errors
```
Error: column admin_id contains null values
Solution: Run migration script which handles NULL values
```

### Login Fails
```
Error: Invalid credentials
Solution: Check .env has SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD
```

### Booking Limit Not Working
```
Error: Bookings created beyond limit
Solution: Verify hotel has correct subscription_tier in database
```

See `MIGRATION_GUIDE.md` for more troubleshooting.

## 📚 Documentation

- **SUPER_ADMIN_SETUP.md** - Complete setup and architecture
- **SUPER_ADMIN_API.md** - Full API reference with examples
- **MIGRATION_GUIDE.md** - Database migration instructions
- **This file** - Implementation overview

## 🎯 Next Steps

1. **Run Database Migration**
   - Execute migration script
   - Verify all tables created

2. **Configure Super Admin**
   - Update .env credentials
   - Restart application

3. **Test System**
   - Login as super admin
   - Create test admin
   - Create test hotel
   - Test subscription changes

4. **Build Frontend**
   - Integrate login component
   - Integrate dashboard component
   - Add navigation

5. **Deploy to Production**
   - Change super admin credentials
   - Use strong JWT secret
   - Enable HTTPS
   - Set up backups
   - Configure monitoring

## 💡 Best Practices

1. **Security**
   - Change default super admin credentials
   - Use strong passwords (minimum 12 characters)
   - Enable HTTPS in production
   - Rotate JWT secret regularly

2. **Operations**
   - Regular database backups
   - Monitor subscription expirations
   - Track revenue and usage
   - Send payment reminders

3. **Support**
   - Document your pricing model
   - Create admin onboarding guide
   - Set up support email
   - Monitor error logs

## 📞 Support

For issues:
1. Check application logs
2. Review database logs
3. Verify .env configuration
4. Check JWT token validity
5. Review subscription status

## 🎉 You're Ready!

Your HMS is now production-ready for selling to multiple hotel owners. The system handles:
- ✅ Multiple admins with separate hotels
- ✅ Subscription tiers with feature limits
- ✅ Booking limit enforcement
- ✅ Usage tracking and analytics
- ✅ Admin and hotel management
- ✅ Audit logging

Start selling and scale your hotel management business!
