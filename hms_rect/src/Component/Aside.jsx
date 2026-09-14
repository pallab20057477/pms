import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

function PremiumBadge() {
  return (
    <span className="sidebar-premium-badge">
      ★ Premium
    </span>
  );
}

function Aside() {
  const features      = useSelector(s => s.auth.hotelFeatures);
  const tier          = useSelector(s => s.auth.subscriptionTier);
  const activeHotelId = useSelector(s => s.auth.activeHotelId);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Derive the actual booking limit from the active hotel object kept in hotels list
  // (Header.jsx stores the hotel list; we read what setActiveHotel gave us)
  const bookingLimit  = useSelector(s => {
    // The active hotel's booking_limit_per_day was set into activeHotel by Header via setActiveHotel.
    // authSlice doesn't store it directly, so fall back to tier defaults.
    return null  // see planLabel below
  });

  const can    = (key) => features ? (features[key] ?? true) : true;
  const locked = () => setShowUpgrade(true);

  const isPremium = tier === 'premium';
  const isPro     = tier === 'pro';

  const planLabel = isPremium ? 'Premium Plan' : isPro ? 'Pro Plan' : 'Free Plan';
  const planIcon  = isPremium ? '★' : isPro ? '✦' : '○';
  const planBadge = isPremium ? 'sub-premium' : isPro ? 'sub-pro' : 'sub-free';
  const planDesc  = isPremium ? 'All features enabled'
                  : isPro     ? 'Pro features enabled'
                  : 'Limited features';

  const location = useLocation();
  const path = location.pathname;

  // React-driven smooth accordion state
  const [openSections, setOpenSections] = useState({
    hotels: path.startsWith('/hotels'),
    rooms: path.startsWith('/rooms') || path.startsWith('/rate-plans'),
    guests: path.startsWith('/guests'),
    booking: path !== '/booking/calendar' && path.startsWith('/booking'),
    folio: path.startsWith('/folio'),
    reports: path.startsWith('/reports'),
    activity: path.startsWith('/activity'),
    settings: path.startsWith('/settings'),
    staff: path.startsWith('/staff'),
  });

  // Auto-expand active group on route change
  useEffect(() => {
    setOpenSections(prev => ({
      ...prev,
      hotels: prev.hotels || path.startsWith('/hotels'),
      rooms: prev.rooms || path.startsWith('/rooms') || path.startsWith('/rate-plans'),
      guests: prev.guests || path.startsWith('/guests'),
      booking: prev.booking || (path !== '/booking/calendar' && path.startsWith('/booking')),
      folio: prev.folio || path.startsWith('/folio'),
      reports: prev.reports || path.startsWith('/reports'),
      activity: prev.activity || path.startsWith('/activity'),
      settings: prev.settings || path.startsWith('/settings'),
      staff: prev.staff || path.startsWith('/staff'),
    }));
  }, [path]);

  const toggleSection = (key) => {
    setOpenSections(prev => {
      // If the clicked section is already open, close it
      if (prev[key]) {
        return { ...prev, [key]: false };
      }
      // Otherwise, close all sections and open only the clicked one
      const newSections = {};
      Object.keys(prev).forEach(k => {
        newSections[k] = k === key;
      });
      return newSections;
    });
  };

  const isActive = (p) => path.startsWith(p) ? 'active' : '';

  return (
    <>
      <aside className="main-sidebar">
        <div className="sidebar">
          
          {/* Admin Role Status Card */}
          <div className="sidebar-admin-panel">
            <div className="sidebar-admin-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" focusable="false">
                <path fill="currentColor" d="M12 2l8 3v6c0 5.55-3.84 10.74-8 12-4.16-1.26-8-6.45-8-12V5l8-3zm0 2.12L6 6.37V11c0 4.42 2.94 8.88 6 10.22 3.06-1.34 6-5.8 6-10.22V6.37l-6-2.25z" />
              </svg>
            </div>
            <div className="sidebar-admin-text">
              <strong>Admin Console</strong>
              <small>Control Center</small>
            </div>
          </div>

          {/* Subscription badge */}
          <div className={`sidebar-subscription-badge ${planBadge}`}>
            <span className="sub-icon">{planIcon}</span>
            <div className="sub-info">
              <span className="sub-plan">{planLabel}</span>
              <span className="sub-desc">{planDesc}</span>
            </div>
          </div>

          <div className="sidebar-section-label">Navigation</div>

          <ul className="sidebar-menu">
            {/* Dashboard */}
            <li className={path === '/dashboard' || path === '/' ? 'active' : ''}>
              <Link to="/dashboard">
                <i className="fa-solid fa-gauge-high"></i>
                <span>Dashboard</span>
              </Link>
            </li>

            {/* Front Desk Calendar */}
            <li className={isActive('/booking/calendar')}>
              <Link to="/booking/calendar">
                <i className="fa-solid fa-calendar-days"></i>
                <span>Front Desk Calendar</span>
              </Link>
            </li>

            {/* Hotel Management */}
            <li className={`treeview ${openSections.hotels ? 'active is-expanded' : ''}`}>
              <a href="#!" onClick={(e) => { e.preventDefault(); toggleSection('hotels'); }}>
                <i className="fa-solid fa-hotel"></i>
                <span>Hotel Management</span>
                <i className={`fa-solid fa-angle-left pull-right ${openSections.hotels ? 'rotated' : ''}`}></i>
              </a>
              <div className={`sidebar-tree-wrapper ${openSections.hotels ? 'is-open' : ''}`}>
                <div className="sidebar-tree-inner">
                  <ul className="treeview-menu">
                    <li><Link to="/hotels/new">Add New Hotel</Link></li>
                    <li><Link to="/hotels">Hotel List</Link></li>
                  </ul>
                </div>
              </div>
            </li>

            {/* Room Management */}
            <li className={`treeview ${openSections.rooms ? 'active is-expanded' : ''}`}>
              <a href="#!" onClick={(e) => { e.preventDefault(); toggleSection('rooms'); }}>
                <i className="fa-solid fa-bed"></i>
                <span>Room Management</span>
                <i className={`fa-solid fa-angle-left pull-right ${openSections.rooms ? 'rotated' : ''}`}></i>
              </a>
              <div className={`sidebar-tree-wrapper ${openSections.rooms ? 'is-open' : ''}`}>
                <div className="sidebar-tree-inner">
                  <ul className="treeview-menu">
                    <li><Link to="/rooms/new">Add New Room</Link></li>
                    <li><Link to="/rooms">All Rooms</Link></li>
                    <li><Link to="/rate-plans">Rate Plans</Link></li>
                  </ul>
                </div>
              </div>
            </li>

            {/* Customer Management */}
            <li className={`treeview ${openSections.guests ? 'active is-expanded' : ''}`}>
              <a href="#!" onClick={(e) => { e.preventDefault(); toggleSection('guests'); }}>
                <i className="fa-solid fa-user"></i>
                <span>Customer Management</span>
                <i className={`fa-solid fa-angle-left pull-right ${openSections.guests ? 'rotated' : ''}`}></i>
              </a>
              <div className={`sidebar-tree-wrapper ${openSections.guests ? 'is-open' : ''}`}>
                <div className="sidebar-tree-inner">
                  <ul className="treeview-menu">
                    <li><Link to="/guests/new">Add New Customer</Link></li>
                    <li><Link to="/guests">Customer List</Link></li>
                  </ul>
                </div>
              </div>
            </li>

            {/* Staff Management */}
            <li className={`treeview ${openSections.staff ? 'active is-expanded' : ''}`}>
              <a href="#!" onClick={(e) => { e.preventDefault(); toggleSection('staff'); }}>
                <i className="fa-solid fa-users-gear"></i>
                <span>Staff Management</span>
                <i className={`fa-solid fa-angle-left pull-right ${openSections.staff ? 'rotated' : ''}`}></i>
              </a>
              <div className={`sidebar-tree-wrapper ${openSections.staff ? 'is-open' : ''}`}>
                <div className="sidebar-tree-inner">
                  <ul className="treeview-menu">
                    <li><Link to="/staff/new">Add New Staff</Link></li>
                    <li><Link to="/staff">Staff List</Link></li>
                    <li><Link to="/staff/attendance">Attendance</Link></li>
                    <li><Link to="/staff/performance-ranking">Performance</Link></li>
                  </ul>
                </div>
              </div>
            </li>

            {/* Booking Management */}
            <li className={`treeview ${openSections.booking ? 'active is-expanded' : ''}`}>
              <a href="#!" onClick={(e) => { e.preventDefault(); toggleSection('booking'); }}>
                <i className="fa-solid fa-calendar"></i>
                <span>Booking Management</span>
                <i className={`fa-solid fa-angle-left pull-right ${openSections.booking ? 'rotated' : ''}`}></i>
              </a>
              <div className={`sidebar-tree-wrapper ${openSections.booking ? 'is-open' : ''}`}>
                <div className="sidebar-tree-inner">
                  <ul className="treeview-menu">
                    <li><Link to="/booking/create">Create New Booking</Link></li>
                    <li><Link to="/booking/all">All Bookings</Link></li>

                  </ul>
                </div>
              </div>
            </li>

            {/* Billing */}
            <li className={`treeview ${openSections.folio ? 'active is-expanded' : ''}`}>
              <a href="#!" onClick={(e) => { e.preventDefault(); toggleSection('folio'); }}>
                <i className="fa-solid fa-file-invoice-dollar"></i>
                <span>Billing</span>
                <i className={`fa-solid fa-angle-left pull-right ${openSections.folio ? 'rotated' : ''}`}></i>
              </a>
              <div className={`sidebar-tree-wrapper ${openSections.folio ? 'is-open' : ''}`}>
                <div className="sidebar-tree-inner">
                  <ul className="treeview-menu">
                    <li><Link to="/folio/running">Running Folios</Link></li>
                    <li><Link to="/folio/invoice">Generate Invoice</Link></li>
                    <li><Link to="/folio/payments">Payment Records</Link></li>
                  </ul>
                </div>
              </div>
            </li>

            {/* Reports */}
            <li className={`treeview ${openSections.reports ? 'active is-expanded' : ''}`}>
              <a href="#!" onClick={(e) => {
                e.preventDefault();
                if (!can('reports')) { locked(); return; }
                toggleSection('reports');
              }}>
                <i className="fa-solid fa-chart-column"></i>
                <span>Reports</span>
                {!can('reports') && <PremiumBadge />}
                {can('reports') && (
                  <i className={`fa-solid fa-angle-left pull-right ${openSections.reports ? 'rotated' : ''}`}></i>
                )}
              </a>
              {can('reports') && (
                <div className={`sidebar-tree-wrapper ${openSections.reports ? 'is-open' : ''}`}>
                  <div className="sidebar-tree-inner">
                    <ul className="treeview-menu">
                      <li><Link to="/reports">Reports Dashboard</Link></li>
                      <li><Link to="/reports/occupancy">Occupancy Report</Link></li>
                      <li><Link to="/reports/revenue">Revenue Report</Link></li>
                      <li><Link to="/reports/pending-payments">Pending Payments</Link></li>
                      <li><Link to="/reports/cancellation">Cancellation Report</Link></li>
                      <li><Link to="/reports/guest-history">Customer History</Link></li>
                      {/* <li><Link to="/reports/housekeeping">Housekeeping Report</Link></li> */}
                      {/* <li><Link to="/reports/staff-performance">Staff Performance</Link></li> */}
                    </ul>
                  </div>
                </div>
              )}
            </li>

            {/* Activity Log */}
            <li className={`treeview ${openSections.activity ? 'active is-expanded' : ''}`}>
              <a href="#!" onClick={(e) => { e.preventDefault(); toggleSection('activity'); }}>
                <i className="fa-solid fa-list"></i>
                <span>Activity Log</span>
                <i className={`fa-solid fa-angle-left pull-right ${openSections.activity ? 'rotated' : ''}`}></i>
              </a>
              <div className={`sidebar-tree-wrapper ${openSections.activity ? 'is-open' : ''}`}>
                <div className="sidebar-tree-inner">
                  <ul className="treeview-menu">
                    <li><Link to="/activity/logs">View All Logs</Link></li>
                  </ul>
                </div>
              </div>
            </li>

            {/* Settings */}
            <li className={`treeview ${openSections.settings ? 'active is-expanded' : ''}`}>
              <a href="#!" onClick={(e) => { e.preventDefault(); toggleSection('settings'); }}>
                <i className="fa-solid fa-gears"></i>
                <span>Settings</span>
                <i className={`fa-solid fa-angle-left pull-right ${openSections.settings ? 'rotated' : ''}`}></i>
              </a>
              <div className={`sidebar-tree-wrapper ${openSections.settings ? 'is-open' : ''}`}>
                <div className="sidebar-tree-inner">
                  <ul className="treeview-menu">
                    <li><Link to="/settings">My Profile</Link></li>
                  </ul>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      {/* Upgrade modal */}
      {showUpgrade && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowUpgrade(false)}
        >
          <div
            style={{ background: 'white', borderRadius: 12, padding: 32, maxWidth: 380, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>★</div>
            <h3 style={{ margin: '0 0 8px', color: '#1e293b' }}>Premium Feature</h3>
            <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>
              This feature is not available on your current plan. Contact your administrator to upgrade to Premium and unlock all features.
            </p>
            <button
              style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, padding: '10px 28px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              onClick={() => setShowUpgrade(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default Aside;
