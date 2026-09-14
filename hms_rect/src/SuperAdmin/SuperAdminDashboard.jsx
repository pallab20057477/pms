import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../Redux/authSlice';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createApiClient } from '../api';
import { resolveAssetUrl } from '../Functions/assetUrl';
import './SuperAdminDashboard.css';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-chart-pie' },
  { key: 'admins', label: 'Hotel Owners', icon: 'fa-solid fa-user-tie' },
  { key: 'hotels', label: 'Hotels', icon: 'fa-solid fa-hotel' },
  { key: 'plans', label: 'Plans & Pricing', icon: 'fa-solid fa-layer-group' },
  { key: 'logs', label: 'Activity Logs', icon: 'fa-solid fa-list-check' },

  { key: 'payment', label: 'Payment Config', icon: 'fa-solid fa-credit-card', divider: true },
  { key: 'themes', label: 'Public Themes', icon: 'fa-solid fa-palette' },

  { key: 'billing', label: 'SaaS Billing & Usage', icon: 'fa-solid fa-file-invoice-dollar', divider: true },
  { key: 'developer', label: 'API & Developer Hub', icon: 'fa-solid fa-code' },
  { key: 'integrations', label: 'Online Integrations', icon: 'fa-solid fa-link' },
  { key: 'health', label: 'System & OTA Health', icon: 'fa-solid fa-heart-pulse' },
  { key: 'audit', label: 'Compliance & Audit', icon: 'fa-solid fa-shield-halved' },
];

const FEATURE_LIST = [
  { key: 'feature_reports', label: 'Reports & Analytics', desc: 'Revenue, occupancy & bookings' },
  { key: 'feature_staff_payroll', label: 'Staff Payroll', desc: 'Salary & increment management' },
  { key: 'feature_housekeeping', label: 'Housekeeping', desc: 'Room cleaning workflows' },
  { key: 'feature_email_notify', label: 'Email Notifications', desc: 'Booking confirmations & alerts' },
  { key: 'feature_seasonal_pricing', label: 'Seasonal Pricing', desc: 'Time-bound price adjustments' },
];

export default function SuperAdminDashboard() {
  const token = useSelector((s) => s.auth.accesstoken);
  const authUser = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const api = useMemo(() => createApiClient(token), [token]);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [planSubTab, setPlanSubTab] = useState('config'); // 'config' or 'hotels'
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [adminSearch, setAdminSearch] = useState('');
  const [hotelSearch, setHotelSearch] = useState('');

  // Data states
  const [stats, setStats] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [allAdminsList, setAllAdminsList] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [hotelTotal, setHotelTotal] = useState(0);
  const [hotelPage, setHotelPage] = useState(1);
  const [hotelTotalPages, setHotelTotalPages] = useState(1);
  const [logs, setLogs] = useState([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [plans, setPlans] = useState([]);

  // Themes tab state
  const [themeHotels, setThemeHotels] = useState([]);  // all hotels for picker
  const [selectedThemeHotelId, setSelectedThemeHotelId] = useState(null);
  const [themeList, setThemeList] = useState([]);
  const [themeLoading, setThemeLoading] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(null); // null | 'new' | theme_object
  // Global themes (apply to ALL hotels)
  const [globalThemeList, setGlobalThemeList] = useState([]);
  const [globalThemeLoading, setGlobalThemeLoading] = useState(false);
  const [showGlobalThemeEditor, setShowGlobalThemeEditor] = useState(null); // null | 'new' | theme_object
  const [themesSection, setThemesSection] = useState('global'); // 'global' | 'hotel'

  // Payment Config tab state
  const [paymentHotels, setPaymentHotels] = useState([]); // enriched with razorpay status

  // Billing tab state
  const [billingData, setBillingData] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingPage, setBillingPage] = useState(1);

  // Health tab state
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthLastRefresh, setHealthLastRefresh] = useState(null);

  // Audit tab state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditModuleFilter, setAuditModuleFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditHotelFilter, setAuditHotelFilter] = useState('');
  const [auditModules, setAuditModules] = useState([]);

  // Integrations tab state
  const [partners, setPartners] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [showPartnerEditor, setShowPartnerEditor] = useState(null); // null | 'new' | partner_object
  const [showMappingModal, setShowMappingModal] = useState(null); // partner_object

  // Modal states
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [showCreateHotel, setShowCreateHotel] = useState(false);
  const [showConfirm, setShowConfirm] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(null);
  const [showFeatures, setShowFeatures] = useState(null);

  const [adminForm, setAdminForm] = useState({ username: '', email: '', name: '', phone: '', password: '' });
  const [hotelForm, setHotelForm] = useState({ admin_id: '', hotel_name: '', city: '', state: '' });

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await api.get('/api/super-admin/dashboard');
    setStats(res.data);
  }, [token]);

  const fetchAdmins = useCallback(async (page = 1) => {
    const res = await api.get(`/api/super-admin/admins?page=${page}&page_size=10`);
    setAdmins(res.data.data || []);
    setAdminTotal(res.data.total || 0);
    setAdminTotalPages(res.data.total_pages || 1);
    setAdminPage(page);
  }, [token]);

  const fetchHotels = useCallback(async (page = 1) => {
    const res = await api.get(`/api/super-admin/hotels?page=${page}&page_size=10`);
    setHotels(res.data.data || []);
    setHotelTotal(res.data.total || 0);
    setHotelTotalPages(res.data.total_pages || 1);
    setHotelPage(page);
  }, [token]);

  const fetchAllAdminsList = useCallback(async () => {
    try {
      const res = await api.get('/api/super-admin/admins?page=1&page_size=1000');
      setAllAdminsList(res.data.data || []);
    } catch { /* silent */ }
  }, [token]);

  const fetchLogs = useCallback(async (page = 1) => {
    const res = await api.get(`/api/super-admin/subscription-logs?page=${page}&page_size=15`);
    setLogs(res.data.data || []);
    setLogTotal(res.data.total || 0);
    setLogTotalPages(res.data.total_pages || 1);
    setLogPage(page);
  }, [token]);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await api.get('/api/super-admin/plans');
      setPlans(res.data);
    } catch { /* silent */ }
  }, [token]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([fetchStats(), fetchAdmins(1), fetchHotels(1), fetchLogs(1), fetchPlans(), fetchAllAdminsList()]);
    } catch {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [fetchStats, fetchAdmins, fetchHotels, fetchLogs, fetchPlans, fetchAllAdminsList]);

  // Load all hotels for themes/payment tabs (full list, no pagination)
  const fetchAllHotelsForTabs = useCallback(async () => {
    try {
      const res = await api.get('/api/super-admin/hotels?page=1&page_size=1000');
      const list = res.data.data || [];
      setThemeHotels(list);
      setPaymentHotels(list);
      if (list.length > 0 && !selectedThemeHotelId) {
        setSelectedThemeHotelId(list[0].id);
      }
    } catch { /* silent */ }
  }, [api, selectedThemeHotelId]);

  const fetchThemesForHotel = useCallback(async (hotelId) => {
    if (!hotelId) return;
    setThemeLoading(true);
    try {
      const res = await api.get(`/api/super-admin/hotels/${hotelId}/themes`);
      setThemeList(res.data.themes || []);
    } catch { toast.error('Failed to load themes'); }
    finally { setThemeLoading(false); }
  }, [api]);

  const fetchGlobalThemes = useCallback(async () => {
    setGlobalThemeLoading(true);
    try {
      const res = await api.get('/api/super-admin/global-themes');
      setGlobalThemeList(res.data.themes || []);
    } catch { toast.error('Failed to load global themes'); }
    finally { setGlobalThemeLoading(false); }
  }, [api]);

  const fetchBilling = useCallback(async (page = 1) => {
    setBillingLoading(true);
    try {
      const res = await api.get(`/api/super-admin/billing?page=${page}&page_size=20`);
      setBillingData(res.data);
      setBillingPage(page);
    } catch { toast.error('Failed to load billing data'); }
    finally { setBillingLoading(false); }
  }, [api]);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await api.get('/api/super-admin/system-health');
      setHealthData(res.data);
      setHealthLastRefresh(new Date());
    } catch { toast.error('Failed to load health data'); }
    finally { setHealthLoading(false); }
  }, [api]);

  const fetchAuditLogs = useCallback(async (page = 1, mod = auditModuleFilter, act = auditActionFilter, hid = auditHotelFilter) => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ page, page_size: 30 });
      if (mod) params.append('module', mod);
      if (act) params.append('action', act);
      if (hid) params.append('hotel_id', hid);
      const res = await api.get(`/api/super-admin/audit-logs?${params}`);
      setAuditLogs(res.data.data || []);
      setAuditTotal(res.data.total || 0);
      setAuditTotalPages(res.data.total_pages || 1);
      setAuditPage(page);
    } catch { toast.error('Failed to load audit logs'); }
    finally { setAuditLoading(false); }
  }, [api, auditModuleFilter, auditActionFilter, auditHotelFilter]);

  const fetchAuditModules = useCallback(async () => {
    try {
      const res = await api.get('/api/super-admin/audit-logs/modules');
      setAuditModules(res.data.modules || []);
    } catch { /* silent */ }
  }, [api]);

  const fetchPartners = useCallback(async () => {
    setPartnersLoading(true);
    try {
      const res = await api.get('/api/super-admin/integrations/partners');
      setPartners(res.data || []);
    } catch { toast.error('Failed to load partners'); }
    finally { setPartnersLoading(false); }
  }, [api]);

  // Smart tab switch - lazy-load data for special tabs
  const handleTabSwitch = useCallback(async (key) => {
    setActiveTab(key);
    if (key === 'themes' || key === 'payment') {
      if (themeHotels.length === 0) await fetchAllHotelsForTabs();
      if (key === 'themes') fetchGlobalThemes();
    }
    if (key === 'billing') fetchBilling(1);
    if (key === 'health') fetchHealth();
    if (key === 'audit') { fetchAuditLogs(1); fetchAuditModules(); }
    if (key === 'integrations') fetchPartners();
  }, [themeHotels.length, fetchAllHotelsForTabs, fetchGlobalThemes, fetchBilling, fetchHealth, fetchAuditLogs, fetchAuditModules, fetchPartners]);

  // When selectedThemeHotelId changes, reload the theme list
  useEffect(() => {
    if (selectedThemeHotelId) fetchThemesForHotel(selectedThemeHotelId);
  }, [selectedThemeHotelId]);

  useEffect(() => { fetchAll(); }, []);

  const confirm = (title, message, onConfirm) => setShowConfirm({ title, message, onConfirm });

  const doAction = async (fn, successMsg) => {
    setActionLoading(true);
    try {
      await fn();
      toast.success(successMsg);
      await fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(false);
      setShowConfirm(null);
    }
  };

  const handleSuspendAdmin = (id) => confirm('Suspend Admin', 'This admin will not be able to login until reactivated.', () => doAction(() => api.put(`/api/super-admin/admins/${id}/suspend`, { reason: 'Suspended by super admin' }), 'Admin suspended'));
  const handleActivateAdmin = (id) => confirm('Activate Admin', 'This admin account will be restored to active status.', () => doAction(() => api.put(`/api/super-admin/admins/${id}/activate`), 'Admin activated'));
  const handleSuspendHotel = (id) => confirm('Suspend Hotel', 'This hotel will not be able to create new bookings.', () => doAction(() => api.put(`/api/super-admin/hotels/${id}/suspend`, { reason: 'Suspended by super admin' }), 'Hotel suspended'));
  const handleActivateHotel = (id) => confirm('Activate Hotel', 'This hotel will be restored to active status.', () => doAction(() => api.put(`/api/super-admin/hotels/${id}/activate`, { reason: 'Activated by super admin' }), 'Hotel activated'));

  const handleImpersonate = async (hotel) => {
    setActionLoading(true);
    try {
      const res = await api.post(`/api/super-admin/hotels/${hotel.id}/impersonate`);
      toast.success(`Impersonating ${hotel.name}... opening new tab.`);
      const token = res.data.token;
      const hotelId = res.data.hotel_id;
      // Open a new tab passing the impersonate_token in the URL.
      window.open(`/?impersonate_token=${token}&impersonate_hotel_id=${hotelId}`, '_blank');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to impersonate hotel');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePlanSelect = (hotelId, tier, duration_months, start_date, end_date, amount) => {
    setShowUpgradeModal(null);
    const payload = { tier, reason: `Plan changed to ${tier} by super admin`, duration_months, amount: amount || 0 };
    if (start_date) payload.start_date = start_date;
    if (end_date) payload.end_date = end_date;
    doAction(() => api.put(`/api/super-admin/hotels/${hotelId}/subscription`, payload), `Hotel plan updated to ${tier.toUpperCase()}`);
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.post('/api/super-admin/admins', adminForm);
      toast.success('Hotel owner created successfully');
      setShowCreateAdmin(false);
      setAdminForm({ username: '', email: '', name: '', phone: '', password: '' });
      await fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to create owner');
    } finally { setActionLoading(false); }
  };

  const handleCreateHotel = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.post('/api/super-admin/hotels', { ...hotelForm, admin_id: Number(hotelForm.admin_id) });
      toast.success('Hotel created successfully');
      setShowCreateHotel(false);
      setHotelForm({ admin_id: '', hotel_name: '', city: '', state: '' });
      await fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to create hotel');
    } finally { setActionLoading(false); }
  };

  const handleOpenFeatures = async (hotel) => {
    try {
      const res = await api.get(`/api/super-admin/hotels/${hotel.id}/features`);
      setShowFeatures({ hotel_id: hotel.id, hotel_name: hotel.name, features: res.data });
    } catch { toast.error('Failed to load features'); }
  };

  const handleSaveFeatures = async (hotelId, features) => {
    setActionLoading(true);
    try {
      await api.put(`/api/super-admin/hotels/${hotelId}/features`, features);
      toast.success('Features updated');
      setShowFeatures(null);
      await fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update features');
    } finally { setActionLoading(false); }
  };

  const handleSavePaymentConfig = async (hotelId, configData) => {
    try {
      await api.patch(`/api/super-admin/hotels/${hotelId}/payment-config`, configData);
      toast.success('Payment gateway configuration saved successfully');
      // Refresh the features data so the "configured" badge updates
      const res = await api.get(`/api/super-admin/hotels/${hotelId}/features`);
      setShowFeatures(prev => ({ ...prev, features: res.data }));
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to save payment credentials');
      throw e;
    }
  };

  const handleLogout = () => { dispatch(logout()); navigate('/'); };

  const fmtDate = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts < 1e12 ? ts * 1000 : ts);
    return isNaN(d) ? '-' : d.toLocaleDateString('en-GB');
  };

  const fmtTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts < 1e12 ? ts * 1000 : ts);
    return isNaN(d) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const actionBadge = (action) => {
    const map = { upgraded: 'badge-green', downgraded: 'badge-orange', suspended: 'badge-red', activated: 'badge-blue', created: 'badge-purple', updated: 'badge-gray' };
    return map[action] || 'badge-gray';
  };

  const displayName = authUser?.name || authUser?.username || 'Super Admin';
  const initial = displayName.charAt(0).toUpperCase();

  // Filtered lists (client-side search for current page)
  const filteredAdmins = useMemo(() =>
    admins.filter(a => !adminSearch || a.username?.toLowerCase().includes(adminSearch.toLowerCase()) || a.name?.toLowerCase().includes(adminSearch.toLowerCase()) || a.email?.toLowerCase().includes(adminSearch.toLowerCase())),
    [admins, adminSearch]);

  const filteredHotels = useMemo(() =>
    hotels.filter(h => !hotelSearch || h.name?.toLowerCase().includes(hotelSearch.toLowerCase()) || h.admin_name?.toLowerCase().includes(hotelSearch.toLowerCase())),
    [hotels, hotelSearch]);

  const tabTitles = { dashboard: 'Platform Overview', admins: 'Hotel Owners', hotels: 'Registered Hotels', plans: 'Plans & Pricing', logs: 'Activity Logs', payment: 'Payment Gateway Config', themes: 'Public Themes - Festival & Seasonal', billing: 'SaaS Billing & Usage', developer: 'API & Developer Hub', health: 'System & OTA Health', audit: 'Compliance & Audit' };
  const tabSubs = { dashboard: 'Live statistics across your entire hotel network', admins: 'Manage hotel owner accounts and access control', hotels: 'Monitor hotel subscriptions, usage, and feature access', plans: 'Configure subscription tiers and feature sets', logs: 'Subscription changes and administrative audit trail', payment: 'Set per-hotel Razorpay Key ID & Secret for online payments', themes: 'Create seasonal banners and color themes for the public booking portal', billing: 'Monthly recurring revenue, subscription breakdown and per-hotel billing overview', developer: 'Platform API documentation, webhook registry, and developer resource centre', health: 'Real-time service status, OTA channel sync health, and infrastructure metrics', audit: 'Immutable cross-tenant activity log for GDPR compliance and security review' };

  if (loading) {
    return (
      <div className="sa-loading">
        <div className="sa-spinner" />
        <span>Loading Control Centre</span>
      </div>
    );
  }

  return (
    <div className="sa-wrap">

      <aside className="sa-sidebar">
        <div className="sa-sidebar-header">
          <div className="sa-logo-icon">
            <i className="fa-solid fa-building-columns" />
          </div>
          <div className="sa-sidebar-brand">
            <h1>StaySync HMS</h1>
            <p>Admin Control Centre</p>
          </div>
        </div>

        <nav className="sa-nav">
          {TABS.map(({ key, label, icon, divider }) => (
            <React.Fragment key={key}>
              {divider && <div className="sa-nav-divider" />}
              <button
                className={activeTab === key ? 'active' : ''}
                onClick={() => handleTabSwitch(key)}
              >
                <i className={icon} />
                <span>{label}</span>
              </button>
            </React.Fragment>
          ))}
        </nav>

        <div className="sa-sidebar-footer">
          <div className="sa-user-card">
            <div className="sa-user-avatar">{initial}</div>
            <div>
              <div className="sa-user-name">{displayName}</div>
              <div className="sa-user-role">Super Administrator</div>
            </div>
          </div>
          <button className="sa-logout" onClick={handleLogout}>
            <i className="fa-solid fa-right-from-bracket" />
            <span>Secure Logout</span>
          </button>
        </div>
      </aside>

      <main className="sa-main-content">
        {/* Top bar */}
        <div className="sa-topbar">
          <div className="sa-topbar-left">
            <h2>{tabTitles[activeTab]}</h2>
            <p>{tabSubs[activeTab]}</p>
          </div>
          <div className="sa-topbar-right">
            <div className="sa-topbar-status">
              <span className="sa-status-dot" />
              All Systems Operational
            </div>
            <div className="sa-topbar-time">
              {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
            </div>
          </div>
        </div>

        <div className="sa-body">

          {activeTab === 'dashboard' && stats && (
            <>
              {/* Stat Cards */}
              <div className="sa-stats">
                <StatCard label="Total Owners" value={stats.total_admins} color="blue" icon="fa-user-tie" />
                <StatCard label="Total Hotels" value={stats.total_hotels} color="purple" icon="fa-hotel" />
                <StatCard label="Active Hotels" value={stats.active_hotels} color="green" icon="fa-circle-check" />
                <StatCard label="Premium Hotels" value={stats.premium_hotels} color="gold" icon="fa-gem" />
                <StatCard label="Suspended" value={stats.suspended_hotels} color="red" icon="fa-ban" />
                <StatCard label="Bookings Today" value={stats.total_bookings_today} color="orange" icon="fa-calendar-check" />
                <StatCard label="Revenue Today" value={`₹${(stats.total_revenue_today || 0).toLocaleString('en-IN')}`} color="teal" icon="fa-indian-rupee-sign" />
                <StatCard label="Free Hotels" value={stats.free_hotels} color="blue" icon="fa-layer-group" />
              </div>

              {/* Recent tables */}
              <div className="sa-row">
                <div className="sa-card">
                  <div className="sa-card-head">
                    <h3><i className="fa-solid fa-user-tie" /> Recent Owners</h3>
                    <button className="sa-btn sa-btn-sm sa-btn-secondary" onClick={() => setActiveTab('admins')}>
                      View All <i className="fa-solid fa-arrow-right" />
                    </button>
                  </div>
                  <div className="sa-table-wrap">
                    <table className="sa-table">
                      <thead><tr><th>Owner</th><th>Hotels</th><th>Status</th></tr></thead>
                      <tbody>
                        {admins.length === 0 && <tr><td colSpan={3} className="sa-empty"><i className="fa-regular fa-folder-open" />No owners yet</td></tr>}
                        {admins.slice(0, 5).map(a => (
                          <tr key={a.id}>
                            <td>
                              <div className="sa-cell-stack">
                                <strong>{a.name || a.username}</strong>
                                <span className="sa-cell-sub">{a.email}</span>
                              </div>
                            </td>
                            <td><span className="sa-count-badge">{a.hotel_count}</span></td>
                            <td><StatusBadge status={a.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="sa-card">
                  <div className="sa-card-head">
                    <h3><i className="fa-solid fa-hotel" /> Recent Hotels</h3>
                    <button className="sa-btn sa-btn-sm sa-btn-secondary" onClick={() => setActiveTab('hotels')}>
                      View All <i className="fa-solid fa-arrow-right" />
                    </button>
                  </div>
                  <div className="sa-table-wrap">
                    <table className="sa-table">
                      <thead><tr><th>Hotel</th><th>Tier</th><th>Status</th></tr></thead>
                      <tbody>
                        {hotels.length === 0 && <tr><td colSpan={3} className="sa-empty"><i className="fa-regular fa-folder-open" />No hotels yet</td></tr>}
                        {hotels.slice(0, 5).map(h => (
                          <tr key={h.id}>
                            <td>
                              <div className="sa-cell-stack">
                                <strong>{h.name}</strong>
                                <span className="sa-cell-sub">{h.admin_name || h.admin_username || '-'}</span>
                              </div>
                            </td>
                            <td><TierBadge tier={h.subscription_tier} /></td>
                            <td><StatusBadge status={h.subscription_status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'admins' && (
            <div className="sa-card">
              <div className="sa-card-head">
                <div>
                  <h3><i className="fa-solid fa-user-tie" /> Hotel Owners <span className="sa-count">{adminTotal}</span></h3>
                </div>
                <div className="sa-section-actions">
                  <div className="sa-search-wrap">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                    <input className="sa-search-input" placeholder="Search owners..." value={adminSearch} onChange={e => setAdminSearch(e.target.value)} />
                  </div>
                  <button className="sa-btn sa-btn-primary" onClick={() => setShowCreateAdmin(true)}>
                    <i className="fa-solid fa-plus" /> New Owner
                  </button>
                </div>
              </div>
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Owner</th><th>Contact</th><th>Hotels</th><th>Status</th><th>Joined</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdmins.length === 0 && (
                      <tr><td colSpan={6}>
                        <div className="sa-empty-state">
                          <svg viewBox="0 0 48 48" fill="none" width="40" height="40"><circle cx="24" cy="16" r="8" stroke="#CBD5E1" strokeWidth="2" /><path d="M8 40c0-8.837 7.163-16 16-16s16 7.163 16 16" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" /></svg>
                          <h4>No owners found</h4>
                          <p>{adminSearch ? 'Try a different search term' : 'Create the first hotel owner to get started'}</p>
                        </div>
                      </td></tr>
                    )}
                    {filteredAdmins.map(a => (
                      <tr key={a.id}>
                        <td>
                          <div className="sa-cell-stack">
                            <strong>{a.name || a.username}</strong>
                            <span className="sa-cell-sub">@{a.username}</span>
                          </div>
                        </td>
                        <td>
                          <div className="sa-cell-stack">
                            <span>{a.email}</span>
                            <span className="sa-cell-sub">{a.phone || '-'}</span>
                          </div>
                        </td>
                        <td><span className="sa-count-badge">{a.hotel_count}</span></td>
                        <td><StatusBadge status={a.status} /></td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--sa-text-3)', fontSize: '12px' }}>{fmtDate(a.created_at_ts)}</td>
                        <td>
                          <div className="sa-actions">
                            {a.status === 'active'
                              ? <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => handleSuspendAdmin(a.id)}><i className="fa-solid fa-ban" /> Suspend</button>
                              : <button className="sa-btn sa-btn-success sa-btn-sm" onClick={() => handleActivateAdmin(a.id)}><i className="fa-solid fa-check" /> Activate</button>
                            }
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={adminPage} totalPages={adminTotalPages} total={adminTotal} onPage={fetchAdmins} />
            </div>
          )}

          {activeTab === 'hotels' && (
            <div className="sa-card">
              <div className="sa-card-head">
                <div className="sa-card-head-left">
                  <h3><i className="fa-solid fa-hotel" /> Registered Hotels <span className="sa-count">{hotelTotal}</span></h3>
                  <div className="sa-tier-summary">
                    <span className="sa-tier-pill premium"><span className="sa-tier-dot" /> Premium ({stats?.premium_hotels ?? 0})</span>
                    <span className="sa-tier-pill free"><span className="sa-tier-dot" /> Free ({stats?.free_hotels ?? 0})</span>
                    {(stats?.suspended_hotels || 0) > 0 && (
                      <span className="sa-tier-pill suspended"><span className="sa-tier-dot" /> Suspended ({stats.suspended_hotels})</span>
                    )}
                  </div>
                </div>
                <div className="sa-section-actions">
                  <div className="sa-search-wrap">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                    <input className="sa-search-input" placeholder="Search hotels..." value={hotelSearch} onChange={e => setHotelSearch(e.target.value)} />
                  </div>
                  <button className="sa-btn sa-btn-primary" onClick={() => setShowCreateHotel(true)}>
                    <i className="fa-solid fa-plus" /> New Hotel
                  </button>
                </div>
              </div>
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr><th>Hotel & Owner</th><th>Location</th><th>Plan</th><th>Usage Today</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {filteredHotels.length === 0 && (
                      <tr><td colSpan={6}>
                        <div className="sa-empty-state">
                          <svg viewBox="0 0 48 48" fill="none" width="40" height="40"><rect x="8" y="16" width="32" height="28" rx="2" stroke="#CBD5E1" strokeWidth="2" /><path d="M16 16V12a8 8 0 0116 0v4" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" /></svg>
                          <h4>No hotels found</h4>
                          <p>{hotelSearch ? 'Try a different search term' : 'Create the first hotel to get started'}</p>
                        </div>
                      </td></tr>
                    )}
                    {filteredHotels.map(h => (
                      <tr key={h.id}>
                        <td>
                          <div className="sa-cell-stack">
                            <strong>{h.name}</strong>
                            <span className="sa-cell-sub"><i className="fa-regular fa-user" style={{ marginRight: 4 }} />{h.admin_name || h.admin_username || '-'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="sa-cell-sub">{[h.city, h.state].filter(Boolean).join(', ') || '-'}</span>
                        </td>
                        <td>
                          <div className="sa-cell-stack">
                            <TierBadge tier={h.subscription_tier} />
                            <span className="sa-cell-sub" style={{ fontSize: 11 }}>
                              Limit: {h.subscription_tier === 'premium' ? 'Unlimited' : h.booking_limit_per_day}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={h.limit_reached ? 'sa-limit-reached' : ''}>
                            {h.bookings_today}{h.subscription_tier !== 'premium' && ` / ${h.booking_limit_per_day}`}
                          </span>
                        </td>
                        <td><StatusBadge status={h.subscription_status} /></td>
                        <td>
                          <div className="sa-actions">
                            <button className="sa-btn sa-btn-secondary sa-btn-sm" onClick={() => handleImpersonate(h)}>
                              <i className="fa-solid fa-user-secret" /> Login As
                            </button>
                            {h.subscription_status === 'active'
                              ? <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => handleSuspendHotel(h.id)}><i className="fa-solid fa-ban" /> Suspend</button>
                              : <button className="sa-btn sa-btn-success sa-btn-sm" onClick={() => handleActivateHotel(h.id)}><i className="fa-solid fa-check" /> Activate</button>
                            }
                            <button className="sa-btn sa-btn-features sa-btn-sm" onClick={() => handleOpenFeatures(h)}>
                              <i className="fa-solid fa-sliders" /> Features
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={hotelPage} totalPages={hotelTotalPages} total={hotelTotal} onPage={fetchHotels} />
            </div>
          )}

          {activeTab === 'plans' && (
            <div>
              <div className="sa-themes-section-toggle" style={{ marginBottom: 20 }}>
                <button
                  className={`sa-btn ${planSubTab === 'config' ? 'sa-btn-primary' : 'sa-btn-secondary'}`}
                  onClick={() => setPlanSubTab('config')}
                  style={{ marginRight: 10 }}
                >
                  <i className="fa-solid fa-sliders" style={{ marginRight: 8 }} /> Global Plan Configuration
                </button>
                <button
                  className={`sa-btn ${planSubTab === 'hotels' ? 'sa-btn-primary' : 'sa-btn-secondary'}`}
                  onClick={() => setPlanSubTab('hotels')}
                >
                  <i className="fa-solid fa-hotel" style={{ marginRight: 8 }} /> Plan Set Up Per Hotel
                </button>
              </div>

              {planSubTab === 'config' && (
                <PlansTab plans={plans} onUpdate={fetchPlans} doAction={doAction} api={api} />
              )}
              {planSubTab === 'hotels' && (
                <HotelPlansTab 
                  hotels={hotels} 
                  fetchHotels={fetchHotels} 
                  hotelPage={hotelPage} 
                  hotelTotalPages={hotelTotalPages} 
                  hotelTotal={hotelTotal} 
                  setShowUpgradeModal={setShowUpgradeModal} 
                />
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="sa-card">
              <div className="sa-card-head">
                <h3><i className="fa-solid fa-list-check" /> Subscription Activity <span className="sa-count">{logTotal}</span></h3>
                <button className="sa-btn sa-btn-sm sa-btn-secondary" onClick={() => fetchLogs(1)}>
                  <i className="fa-solid fa-rotate-right" /> Refresh
                </button>
              </div>
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr><th>Date & Time</th><th>Action</th><th>Hotel</th><th>Change</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 && <tr><td colSpan={5} className="sa-empty"><i className="fa-regular fa-folder-open" />No activity logs found</td></tr>}
                    {logs.map(l => (
                      <tr key={l.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="sa-cell-stack">
                            <span>{fmtDate(l.created_at)}</span>
                            <span className="sa-cell-sub">{fmtTime(l.created_at)}</span>
                          </div>
                        </td>
                        <td><span className={`sa-badge ${actionBadge(l.action)}`}>{l.action}</span></td>
                        <td><strong>#{l.hotel_id}</strong></td>
                        <td>
                          {l.old_tier && l.new_tier
                            ? <span className="sa-cell-sub" style={{ fontSize: 12 }}>{l.old_tier} &rarr; {l.new_tier}</span>
                            : <span className="sa-cell-sub">-</span>
                          }
                        </td>
                        <td><span style={{ color: 'var(--sa-text-3)', fontSize: 12.5 }}>{l.reason || '-'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={logPage} totalPages={logTotalPages} total={logTotal} onPage={fetchLogs} />
            </div>
          )}

          {activeTab === 'payment' && (
            <div className="sa-card">
              <div className="sa-card-head">
                <div>
                  <h3><i className="fa-solid fa-credit-card" /> Payment Gateway Configuration</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--sa-text-3)', marginTop: 4 }}>
                    Configure per-hotel online payment gateways (Razorpay or PhonePe). Select which gateway each hotel uses and set their API credentials.
                  </p>
                </div>
              </div>
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Hotel</th><th>City</th><th>Tier</th><th>Active Gateway</th><th>Merchant / Key ID</th><th>Status</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHotels.length === 0 && (
                      <tr><td colSpan={6} className="sa-empty"><i className="fa-regular fa-folder-open" /> No hotels found</td></tr>
                    )}
                    {paymentHotels.map(h => (
                      <PaymentConfigRow
                        key={h.id}
                        hotel={h}
                        api={api}
                        onSaved={() => toast.success('Credentials saved for ' + h.name)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'themes' && (
            <div>
              {/* Section toggle */}
              <div className="sa-themes-section-toggle">
                <button
                  className={`sa-themes-section-btn ${themesSection === 'global' ? 'active' : ''}`}
                  onClick={() => setThemesSection('global')}
                >
                  <i className="fa-solid fa-earth-asia" /> Global Themes
                  <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.7 }}>All Hotels</span>
                </button>
                <button
                  className={`sa-themes-section-btn ${themesSection === 'hotel' ? 'active' : ''}`}
                  onClick={() => setThemesSection('hotel')}
                >
                  <i className="fa-solid fa-hotel" /> Per-Hotel Themes
                  <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.7 }}>Override for one hotel</span>
                </button>
              </div>

              {themesSection === 'global' && (
                <div>
                  <div className="sa-themes-section-info">
                    <i className="fa-solid fa-circle-info" />
                    <div>
                      <strong>Global themes apply to ALL hotels automatically.</strong>
                      {' '}Use this for Independence Day, Diwali, New Year, or any event affecting all properties.
                      A per-hotel theme always takes priority over the global theme.
                    </div>
                  </div>

                  <div className="sa-themes-header">
                    <div />
                    <button
                      className="sa-btn sa-btn-primary"
                      onClick={() => setShowGlobalThemeEditor('new')}
                    >
                      <i className="fa-solid fa-earth-asia" /> New Global Theme
                    </button>
                  </div>

                  {globalThemeLoading ? (
                    <div className="sa-empty-state"><div className="sa-spinner" /><p>Loading...</p></div>
                  ) : globalThemeList.length === 0 ? (
                    <div className="sa-empty-state">
                      <i className="fa-solid fa-earth-asia" style={{ fontSize: 48, color: 'var(--sa-text-3)', marginBottom: 12 }} />
                      <h4>No global themes yet</h4>
                      <p>Create a global theme to apply branding across all hotels simultaneously.</p>
                    </div>
                  ) : (
                    <div className="sa-themes-grid">
                      {globalThemeList.map(theme => (
                        <ThemeCard
                          key={theme.id}
                          theme={theme}
                          isGlobal
                          api={api}
                          onSaved={fetchGlobalThemes}
                          onEdit={() => setShowGlobalThemeEditor(theme)}
                        />
                      ))}
                    </div>
                  )}

                  {showGlobalThemeEditor && (
                    <ThemeEditorModal
                      hotelId={null}
                      isGlobal
                      theme={showGlobalThemeEditor === 'new' ? null : showGlobalThemeEditor}
                      api={api}
                      onClose={() => setShowGlobalThemeEditor(null)}
                      onSaved={() => { setShowGlobalThemeEditor(null); fetchGlobalThemes(); }}
                      onDeleted={() => { setShowGlobalThemeEditor(null); fetchGlobalThemes(); }}
                    />
                  )}
                </div>
              )}

              {themesSection === 'hotel' && (
                <div>
                  <div className="sa-themes-section-info" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
                    <i className="fa-solid fa-circle-info" style={{ color: '#3b82f6' }} />
                    <div style={{ color: '#1d4ed8' }}>
                      <strong>Per-hotel themes override the global theme</strong> for that specific hotel only.
                    </div>
                  </div>

                  <div className="sa-themes-header">
                    <div className="sa-themes-hotel-picker">
                      <label><i className="fa-solid fa-hotel" /> Select Hotel</label>
                      <select
                        value={selectedThemeHotelId || ''}
                        onChange={e => setSelectedThemeHotelId(Number(e.target.value))}
                      >
                        {themeHotels.map(h => (
                          <option key={h.id} value={h.id}>{h.name} - {h.city || h.state || ''}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="sa-btn sa-btn-primary"
                      onClick={() => setShowThemeEditor('new')}
                      disabled={!selectedThemeHotelId}
                    >
                      <i className="fa-solid fa-plus" /> New Theme for Hotel
                    </button>
                  </div>

                  {themeLoading ? (
                    <div className="sa-empty-state"><div className="sa-spinner" /><p>Loading themes</p></div>
                  ) : themeList.length === 0 ? (
                    <div className="sa-empty-state">
                      <i className="fa-solid fa-palette" style={{ fontSize: 48, color: 'var(--sa-text-3)', marginBottom: 12 }} />
                      <h4>No themes for this hotel</h4>
                      <p>Create a hotel-specific theme to override the global theme for this property.</p>
                    </div>
                  ) : (
                    <div className="sa-themes-grid">
                      {themeList.map(theme => (
                        <ThemeCard
                          key={theme.id}
                          theme={theme}
                          api={api}
                          onSaved={() => fetchThemesForHotel(selectedThemeHotelId)}
                          onEdit={() => setShowThemeEditor(theme)}
                        />
                      ))}
                    </div>
                  )}

                  {showThemeEditor && (
                    <ThemeEditorModal
                      hotelId={selectedThemeHotelId}
                      theme={showThemeEditor === 'new' ? null : showThemeEditor}
                      api={api}
                      onClose={() => setShowThemeEditor(null)}
                      onSaved={() => { setShowThemeEditor(null); fetchThemesForHotel(selectedThemeHotelId); }}
                      onDeleted={() => { setShowThemeEditor(null); fetchThemesForHotel(selectedThemeHotelId); }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="sa-enterprise-tab">
              {billingLoading ? (
                <div className="sa-tab-loader"><div className="sa-spinner" /><span>Loading billing data</span></div>
              ) : billingData ? (
                <>
                  {/* KPI row */}
                  <div className="sa-billing-kpi-row">
                    <div className="sa-billing-kpi sa-billing-kpi-mrr">
                      <div className="sa-billing-kpi-label"><i className="fa-solid fa-indian-rupee-sign" /> Monthly Recurring Revenue</div>
                      <div className="sa-billing-kpi-value">₹{(billingData.total_mrr || 0).toLocaleString('en-IN')}</div>
                      <div className="sa-billing-kpi-sub">{billingData.premium_hotels} premium &middot; {billingData.free_hotels} free</div>
                    </div>
                    <div className="sa-billing-kpi sa-billing-kpi-hotels">
                      <div className="sa-billing-kpi-label"><i className="fa-solid fa-hotel" /> Total Hotels</div>
                      <div className="sa-billing-kpi-value">{billingData.total_hotels}</div>
                      <div className="sa-billing-kpi-sub">{billingData.suspended_hotels} suspended</div>
                    </div>
                    <div className="sa-billing-kpi sa-billing-kpi-premium">
                      <div className="sa-billing-kpi-label"><i className="fa-solid fa-crown" /> Premium</div>
                      <div className="sa-billing-kpi-value">{billingData.premium_hotels}</div>
                      <div className="sa-billing-kpi-sub">₹2,999/mo each</div>
                    </div>
                    <div className="sa-billing-kpi sa-billing-kpi-free">
                      <div className="sa-billing-kpi-label"><i className="fa-solid fa-circle" /> Free Tier</div>
                      <div className="sa-billing-kpi-value">{billingData.free_hotels}</div>
                      <div className="sa-billing-kpi-sub">Upgrade candidates</div>
                    </div>
                  </div>

                  {/* Monthly revenue chart (bar bars using CSS widths) */}
                  {billingData.monthly_revenue?.length > 0 && (
                    <div className="sa-card" style={{ marginBottom: 20 }}>
                      <div className="sa-card-head"><h3><i className="fa-solid fa-chart-bar" /> Revenue - Last 6 Months</h3></div>
                      <div className="sa-billing-chart">
                        {(() => {
                          const maxRev = Math.max(...billingData.monthly_revenue.map(m => m.revenue), 1);
                          return billingData.monthly_revenue.map((m, i) => (
                            <div key={i} className="sa-billing-chart-col">
                              <div className="sa-billing-bar-wrap">
                                <div className="sa-billing-bar" style={{ height: `${Math.max((m.revenue / maxRev) * 100, 4)}%` }}>
                                  <span className="sa-billing-bar-tip">₹{m.revenue.toLocaleString('en-IN')}</span>
                                </div>
                              </div>
                              <div className="sa-billing-chart-label">{m.month}</div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Per-hotel billing table */}
                  <div className="sa-card">
                    <div className="sa-card-head">
                      <h3><i className="fa-solid fa-table" /> Per-Hotel Billing</h3>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="sa-badge badge-gray">{billingData.total_hotels} hotels</span>
                      </div>
                    </div>
                    <div className="sa-table-wrap">
                      <table className="sa-table">
                        <thead><tr>
                          <th>Hotel</th><th>Owner</th><th>Plan</th><th>Status</th><th>Bookings/Month</th><th>MRR</th><th>Member Since</th>
                        </tr></thead>
                        <tbody>
                          {(billingData.hotels || []).map(h => (
                            <tr key={h.hotel_id}>
                              <td><strong>{h.hotel_name}</strong></td>
                              <td>
                                <div className="sa-cell-stack">
                                  <span>{h.admin_name || '-'}</span>
                                  <span className="sa-cell-sub">{h.admin_email || ''}</span>
                                </div>
                              </td>
                              <td><TierBadge tier={h.subscription_tier} /></td>
                              <td>
                                <span className={`sa-badge ${h.subscription_status === 'active' ? 'badge-green' : 'badge-red'}`}>
                                  {h.subscription_status}
                                </span>
                              </td>
                              <td>{h.bookings_this_month}</td>
                              <td><strong style={{ color: h.mrr > 0 ? 'var(--sa-accent)' : 'var(--sa-text-3)' }}>₹{h.mrr.toLocaleString('en-IN')}</strong></td>
                              <td style={{ color: 'var(--sa-text-2)', fontSize: 12 }}>
                                {h.created_at ? new Date(h.created_at).toLocaleDateString('en-GB') : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    {billingData.total_hotels > 20 && (
                      <div className="sa-pagination">
                        <button className="sa-btn sa-btn-sm sa-btn-secondary" disabled={billingPage <= 1} onClick={() => fetchBilling(billingPage - 1)}>" Prev</button>
                        <span>Page {billingPage}</span>
                        <button className="sa-btn sa-btn-sm sa-btn-secondary" disabled={billingPage * 20 >= billingData.total_hotels} onClick={() => fetchBilling(billingPage + 1)}>Next &rarr;</button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="sa-empty-state">
                  <i className="fa-solid fa-file-invoice-dollar" />
                  <h3>No billing data</h3>
                  <p>Register hotels and assign subscription tiers to see billing data here.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'developer' && (
            <div className="sa-enterprise-tab">
              {/* Overview cards */}
              <div className="sa-dev-overview-grid">
                <div className="sa-dev-overview-card sa-dev-card-blue">
                  <div className="sa-dev-card-icon"><i className="fa-solid fa-code" /></div>
                  <div>
                    <div className="sa-dev-card-title">REST API</div>
                    <div className="sa-dev-card-sub">Full booking & HMS API for hotel integrations</div>
                  </div>
                </div>
                <div className="sa-dev-overview-card sa-dev-card-purple">
                  <div className="sa-dev-card-icon"><i className="fa-solid fa-webhook" /></div>
                  <div>
                    <div className="sa-dev-card-title">Webhooks</div>
                    <div className="sa-dev-card-sub">Real-time event push for booking, payment, checkin</div>
                  </div>
                </div>
                <div className="sa-dev-overview-card sa-dev-card-green">
                  <div className="sa-dev-card-icon"><i className="fa-solid fa-shield-check" /></div>
                  <div>
                    <div className="sa-dev-card-title">JWT Auth</div>
                    <div className="sa-dev-card-sub">Bearer token authentication per hotel tenant</div>
                  </div>
                </div>
                <div className="sa-dev-overview-card sa-dev-card-gold">
                  <div className="sa-dev-card-icon"><i className="fa-solid fa-satellite-dish" /></div>
                  <div>
                    <div className="sa-dev-card-title">OTA Channel API</div>
                    <div className="sa-dev-card-sub">Booking.com, Expedia sync via channel manager</div>
                  </div>
                </div>
              </div>

              {/* API Endpoints Reference */}
              <div className="sa-card" style={{ marginBottom: 20 }}>
                <div className="sa-card-head"><h3><i className="fa-solid fa-book-open" /> Core API Endpoints</h3></div>
                <div className="sa-dev-endpoint-list">
                  {[
                    { method: 'POST', path: '/api/auth/login', desc: 'Hotel admin authentication - returns JWT Bearer token' },
                    { method: 'GET', path: '/api/bookings', desc: 'List all bookings for the hotel with filters (date, status, room)' },
                    { method: 'POST', path: '/api/bookings', desc: 'Create a new booking - validates room availability and limits' },
                    { method: 'GET', path: '/api/rooms', desc: 'List all rooms with current occupancy and pricing' },
                    { method: 'GET', path: '/api/reports/revenue', desc: 'Revenue analytics - daily, monthly, yearly breakdown' },
                    { method: 'GET', path: '/api/guests', desc: 'Paginated guest directory with search' },
                    { method: 'POST', path: '/api/checkin', desc: 'Check in a guest - links booking to room with OTP flow' },
                    { method: 'GET', path: '/api/folio/:booking_id', desc: 'Fetch full folio with charges and payments for a booking' },
                    { method: 'POST', path: '/api/payments', desc: 'Record a payment against a booking (cash, card, UPI)' },
                    { method: 'GET', path: '/api/housekeeping', desc: 'List housekeeping tasks by room and status' },
                  ].map((ep, i) => (
                    <div key={i} className="sa-dev-endpoint-row">
                      <span className={`sa-dev-method sa-dev-method-${ep.method.toLowerCase()}`}>{ep.method}</span>
                      <code className="sa-dev-path">{ep.path}</code>
                      <span className="sa-dev-desc">{ep.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auth Flow */}
              <div className="sa-card" style={{ marginBottom: 20 }}>
                <div className="sa-card-head"><h3><i className="fa-solid fa-key" /> Authentication Flow</h3></div>
                <div className="sa-dev-code-block">
                  <div className="sa-dev-code-label">1. Login to get token</div>
                  <pre>{`POST /api/auth/login
Content-Type: application/json

{ "username": "hotel_admin", "password": "" }

" " { "token": "eyJhbGci...", "role": "admin", "hotel_id": 12 }`}</pre>
                  <div className="sa-dev-code-label" style={{ marginTop: 12 }}>2. Use token in all subsequent requests</div>
                  <pre>{`GET /api/bookings
Authorization: Bearer eyJhbGci...
Accept: application/json`}</pre>
                </div>
              </div>

              {/* Webhook events */}
              <div className="sa-card">
                <div className="sa-card-head"><h3><i className="fa-solid fa-webhook" /> Webhook Events</h3></div>
                <div className="sa-dev-webhook-grid">
                  {[
                    { event: 'booking.created', desc: 'Fires when a new booking is confirmed' },
                    { event: 'booking.cancelled', desc: 'Fires when a booking is cancelled' },
                    { event: 'payment.received', desc: 'Fires when a payment is recorded' },
                    { event: 'checkin.completed', desc: 'Fires when a guest checks in' },
                    { event: 'checkout.completed', desc: 'Fires when a guest checks out' },
                    { event: 'room.status.changed', desc: 'Fires when a room status changes (housekeeping)' },
                  ].map((w, i) => (
                    <div key={i} className="sa-dev-webhook-row">
                      <code className="sa-dev-event-name">{w.event}</code>
                      <span className="sa-dev-desc">{w.desc}</span>
                    </div>
                  ))}
                </div>
                <div className="sa-dev-info-box">
                  <i className="fa-solid fa-circle-info" />
                  <span>Webhook delivery uses HMAC-SHA256 signature verification. All events include a <code>X-StaySync-Signature</code> header.</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="sa-enterprise-tab">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2>Online Integrations (OTAs)</h2>
                <button className="sa-btn sa-btn-primary" onClick={() => setShowPartnerEditor('new')}>
                  <i className="fa-solid fa-plus" /> Add Partner
                </button>
              </div>

              {partnersLoading ? (
                <div className="sa-loading-spinner" />
              ) : (
                <div className="sa-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Partner Name</th>
                        <th>Inventory URL</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partners.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--sa-text-3)' }}>
                            No partners configured. Click "Add Partner" to set up Booking.com, Agoda, etc.
                          </td>
                        </tr>
                      ) : (
                        partners.map(p => (
                          <tr key={p.id}>
                            <td>{p.id}</td>
                            <td style={{ fontWeight: 600 }}>{p.partner_name}</td>
                            <td style={{ fontSize: 13, color: 'var(--sa-text-2)' }}>{p.inventory_url}</td>
                            <td>
                              <span className={`sa-badge ${p.is_active ? 'sa-badge-green' : 'sa-badge-red'}`}>
                                {p.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button className="sa-btn sa-btn-sm sa-btn-primary" onClick={() => setShowMappingModal(p)} style={{ marginRight: 8 }}>
                                <i className="fa-solid fa-link" /> Map Codes
                              </button>
                              <button className="sa-btn sa-btn-sm sa-btn-secondary" onClick={() => setShowPartnerEditor(p)} style={{ marginRight: 8 }}>
                                <i className="fa-solid fa-pen" />
                              </button>
                              <button className="sa-btn sa-btn-sm sa-btn-danger" onClick={() => confirm('Delete Partner', `Remove ${p.partner_name}?`, async () => {
                                try {
                                  await api.delete(`/api/super-admin/integrations/partners/${p.id}`);
                                  toast.success('Partner deleted');
                                  fetchPartners();
                                } catch (e) { toast.error('Failed to delete partner'); }
                              })}>
                                <i className="fa-solid fa-trash" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'health' && (
            <div className="sa-enterprise-tab">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 10, alignItems: 'center' }}>
                {healthLastRefresh && (
                  <span style={{ fontSize: 12, color: 'var(--sa-text-3)' }}>
                    Last refreshed: {healthLastRefresh.toLocaleTimeString('en-IN')}
                  </span>
                )}
                <button className="sa-btn sa-btn-sm sa-btn-secondary" onClick={fetchHealth} disabled={healthLoading}>
                  <i className={`fa-solid fa-rotate${healthLoading ? ' fa-spin' : ''}`} /> Refresh
                </button>
              </div>

              {healthLoading && !healthData ? (
                <div className="sa-tab-loader"><div className="sa-spinner" /><span>Checking system health</span></div>
              ) : healthData ? (
                <>
                  {/* Server metrics */}
                  <div className="sa-health-meta-row">
                    {[
                      { icon: 'fa-clock', label: 'Server Time', value: healthData.server_time },
                      { icon: 'fa-gauge-high', label: 'Uptime', value: healthData.uptime },
                      { icon: 'fa-microchip', label: 'Go Runtime', value: healthData.go_version },
                      { icon: 'fa-memory', label: 'Memory Used', value: `${(healthData.mem_alloc_mb || 0).toFixed(1)} MB` },
                      { icon: 'fa-layer-group', label: 'Goroutines', value: healthData.num_goroutines },
                    ].map((m, i) => (
                      <div key={i} className="sa-health-meta-card">
                        <i className={`fa-solid ${m.icon}`} />
                        <div>
                          <div className="sa-health-meta-label">{m.label}</div>
                          <div className="sa-health-meta-value">{m.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Core services */}
                  <div className="sa-card" style={{ marginBottom: 20 }}>
                    <div className="sa-card-head"><h3><i className="fa-solid fa-server" /> Core Services</h3></div>
                    <div className="sa-health-service-list">
                      {(healthData.services || []).map((svc, i) => (
                        <div key={i} className={`sa-health-service-row sa-health-status-${svc.status}`}>
                          <div className="sa-health-service-dot" />
                          <div className="sa-health-service-info">
                            <strong>{svc.name}</strong>
                            <span>{svc.message}</span>
                          </div>
                          <div className="sa-health-service-right">
                            <span className="sa-health-latency">{svc.latency}</span>
                            <span className={`sa-badge ${svc.status === 'ok' ? 'badge-green' : svc.status === 'degraded' ? 'badge-orange' : 'badge-red'}`}>
                              {svc.status === 'ok' ? 'Operational' : svc.status === 'degraded' ? 'Degraded' : 'Down'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* OTA Channel Health */}
                  <div className="sa-card">
                    <div className="sa-card-head"><h3><i className="fa-solid fa-satellite-dish" /> OTA Channel Sync Health</h3></div>
                    <div className="sa-table-wrap">
                      <table className="sa-table">
                        <thead><tr>
                          <th>Channel</th><th>Hotels Linked</th><th>Last Sync</th><th>Pending Jobs</th><th>Failed Jobs</th><th>Status</th>
                        </tr></thead>
                        <tbody>
                          {(healthData.ota_channels || []).map((ch, i) => (
                            <tr key={i}>
                              <td><strong>{ch.channel}</strong></td>
                              <td>{ch.hotels_linked}</td>
                              <td style={{ color: 'var(--sa-text-2)', fontSize: 12 }}>{ch.last_sync_time || '-'}</td>
                              <td>
                                <span style={{ color: ch.pending_jobs > 10 ? '#f59e0b' : 'inherit' }}>{ch.pending_jobs || 0}</span>
                              </td>
                              <td>
                                <span style={{ color: ch.failed_jobs > 0 ? '#ef4444' : 'var(--sa-accent)', fontWeight: 600 }}>{ch.failed_jobs || 0}</span>
                              </td>
                              <td>
                                <span className={`sa-badge ${ch.status === 'ok' ? 'badge-green' : ch.status === 'inactive' ? 'badge-gray' : ch.status === 'degraded' ? 'badge-orange' : 'badge-red'}`}>
                                  {ch.status === 'ok' ? 'Healthy' : ch.status === 'inactive' ? 'Inactive' : ch.status === 'degraded' ? 'Degraded' : 'Down'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="sa-empty-state">
                  <i className="fa-solid fa-heart-pulse" />
                  <h3>No health data</h3>
                  <button className="sa-btn sa-btn-primary" style={{ marginTop: 12 }} onClick={fetchHealth}>Check Now</button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="sa-enterprise-tab">
              {/* Filters */}
              <div className="sa-card" style={{ marginBottom: 20, padding: '14px 20px' }}>
                <div className="sa-audit-filter-row">
                  <div className="sa-audit-filter-group">
                    <label>Module</label>
                    <select
                      value={auditModuleFilter}
                      onChange={e => { setAuditModuleFilter(e.target.value); fetchAuditLogs(1, e.target.value, auditActionFilter, auditHotelFilter); }}
                    >
                      <option value="">All Modules</option>
                      {auditModules.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="sa-audit-filter-group">
                    <label>Action / Keyword</label>
                    <input
                      type="text"
                      placeholder="e.g. created, deleted..."
                      value={auditActionFilter}
                      onChange={e => setAuditActionFilter(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && fetchAuditLogs(1)}
                    />
                  </div>
                  <div className="sa-audit-filter-group">
                    <label>Hotel ID</label>
                    <input
                      type="text"
                      placeholder="Hotel ID..."
                      value={auditHotelFilter}
                      onChange={e => setAuditHotelFilter(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && fetchAuditLogs(1)}
                    />
                  </div>
                  <button className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => fetchAuditLogs(1)} disabled={auditLoading}>
                    <i className="fa-solid fa-magnifying-glass" /> Search
                  </button>
                  <button className="sa-btn sa-btn-secondary sa-btn-sm" onClick={() => {
                    setAuditModuleFilter(''); setAuditActionFilter(''); setAuditHotelFilter('');
                    fetchAuditLogs(1, '', '', '');
                  }}>
                    Clear
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sa-text-3)' }}>
                  <i className="fa-solid fa-lock" /> Audit logs are read-only and cannot be modified or deleted - permanent compliance record.
                </div>
              </div>

              <div className="sa-card">
                <div className="sa-card-head">
                  <h3><i className="fa-solid fa-shield-halved" /> Activity Audit Trail</h3>
                  <span className="sa-badge badge-gray">{auditTotal.toLocaleString()} total events</span>
                </div>
                {auditLoading ? (
                  <div className="sa-tab-loader" style={{ padding: '30px 0' }}><div className="sa-spinner" /><span>Loading audit logs</span></div>
                ) : auditLogs.length === 0 ? (
                  <div className="sa-empty-state" style={{ margin: '32px 0' }}>
                    <i className="fa-solid fa-user-shield" />
                    <h3>No events found</h3>
                    <p>Adjust your filters or wait for activity to be logged.</p>
                  </div>
                ) : (
                  <>
                    <div className="sa-table-wrap">
                      <table className="sa-table">
                        <thead><tr>
                          <th>#</th><th>Hotel</th><th>Admin</th><th>Module</th><th>Action</th><th>Description</th><th>Time</th>
                        </tr></thead>
                        <tbody>
                          {auditLogs.map(log => (
                            <tr key={log.id}>
                              <td style={{ color: 'var(--sa-text-3)', fontSize: 11 }}>{log.id}</td>
                              <td>
                                <div className="sa-cell-stack">
                                  <span>{log.hotel_name || '-'}</span>
                                  <span className="sa-cell-sub">ID: {log.hotel_id}</span>
                                </div>
                              </td>
                              <td>{log.admin_name || '-'}</td>
                              <td>
                                <span className="sa-badge badge-blue" style={{ fontSize: 11 }}>{log.module}</span>
                              </td>
                              <td>
                                <span className={`sa-badge ${log.action?.includes('delete') || log.action?.includes('suspend') ? 'badge-red' : log.action?.includes('create') || log.action?.includes('add') ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 11 }}>
                                  {log.action}
                                </span>
                              </td>
                              <td style={{ maxWidth: 280, fontSize: 12.5 }}>
                                <span title={log.description}>{log.description?.length > 80 ? log.description.slice(0, 80) + '' : log.description}</span>
                              </td>
                              <td style={{ color: 'var(--sa-text-2)', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                                {log.created_at ? new Date(log.created_at < 1e12 ? log.created_at * 1000 : log.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    <div className="sa-pagination">
                      <button className="sa-btn sa-btn-sm sa-btn-secondary" disabled={auditPage <= 1} onClick={() => fetchAuditLogs(auditPage - 1)}>" Prev</button>
                      <span>Page {auditPage} of {auditTotalPages}</span>
                      <button className="sa-btn sa-btn-sm sa-btn-secondary" disabled={auditPage >= auditTotalPages} onClick={() => fetchAuditLogs(auditPage + 1)}>Next &rarr;</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

        </div>
      </main>

      {showCreateAdmin && (
        <Modal title="Create Hotel Owner" subtitle="New owner will receive login credentials" onClose={() => setShowCreateAdmin(false)}>
          <form onSubmit={handleCreateAdmin}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="Username *" value={adminForm.username} onChange={v => setAdminForm(f => ({ ...f, username: v }))} required />
              <FormField label="Full Name *" value={adminForm.name} onChange={v => setAdminForm(f => ({ ...f, name: v }))} required />
            </div>
            <FormField label="Email Address *" type="email" value={adminForm.email} onChange={v => setAdminForm(f => ({ ...f, email: v }))} required />
            <FormField label="Phone Number" value={adminForm.phone} onChange={v => setAdminForm(f => ({ ...f, phone: v }))} />
            <FormField label="Temporary Password *" type="password" value={adminForm.password} onChange={v => setAdminForm(f => ({ ...f, password: v }))} required />
            <div className="sa-modal-footer">
              <button type="button" className="sa-btn sa-btn-secondary" onClick={() => setShowCreateAdmin(false)}>Cancel</button>
              <button type="submit" className="sa-btn sa-btn-primary" disabled={actionLoading}>
                {actionLoading ? <><i className="fa-solid fa-spinner fa-spin" /> Creating</> : <><i className="fa-solid fa-user-plus" /> Create Owner</>}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showCreateHotel && (
        <Modal title="Register New Hotel" subtitle="Assign hotel to an existing owner account" onClose={() => setShowCreateHotel(false)}>
          <form onSubmit={handleCreateHotel}>
            <div className="sa-form-group">
              <label>Assign to Owner *</label>
              <select value={hotelForm.admin_id} onChange={e => setHotelForm(f => ({ ...f, admin_id: e.target.value }))} required>
                <option value="">- Select an Owner -</option>
                {allAdminsList.map(a => <option key={a.id} value={a.id}>{a.name || a.username} - {a.email}</option>)}
              </select>
            </div>
            <FormField label="Hotel Name *" value={hotelForm.hotel_name} onChange={v => setHotelForm(f => ({ ...f, hotel_name: v }))} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="City" value={hotelForm.city} onChange={v => setHotelForm(f => ({ ...f, city: v }))} />
              <FormField label="State" value={hotelForm.state} onChange={v => setHotelForm(f => ({ ...f, state: v }))} />
            </div>
            <div className="sa-modal-footer">
              <button type="button" className="sa-btn sa-btn-secondary" onClick={() => setShowCreateHotel(false)}>Cancel</button>
              <button type="submit" className="sa-btn sa-btn-primary" disabled={actionLoading}>
                {actionLoading ? <><i className="fa-solid fa-spinner fa-spin" /> Creating</> : <><i className="fa-solid fa-hotel" /> Register Hotel</>}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showConfirm && (
        <Modal title={showConfirm.title} onClose={() => setShowConfirm(null)}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <i className="fa-solid fa-triangle-exclamation sa-confirm-icon" />
            <p className="sa-confirm-msg">{showConfirm.message}</p>
            <div className="sa-modal-footer" style={{ justifyContent: 'center', marginTop: 24, padding: '14px 0 0' }}>
              <button className="sa-btn sa-btn-secondary" onClick={() => setShowConfirm(null)}>Cancel</button>
              <button className="sa-btn sa-btn-danger" disabled={actionLoading} onClick={showConfirm.onConfirm}>
                {actionLoading ? <><i className="fa-solid fa-spinner fa-spin" /> Processing</> : 'Confirm Action'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showUpgradeModal && (
        <PricingModal
          hotel={showUpgradeModal}
          plans={plans}
          api={api}
          onClose={() => setShowUpgradeModal(null)}
          onSelect={(tier, duration, start, end, amount) => handlePlanSelect(showUpgradeModal.id, tier, duration, start, end, amount)}
        />
      )}

      {showFeatures && (
        <FeaturesModal
          hotel={showFeatures}
          onClose={() => setShowFeatures(null)}
          onSave={handleSaveFeatures}
          onSavePayment={handleSavePaymentConfig}
          loading={actionLoading}
        />
      )}

      {showPartnerEditor && (
        <PartnerEditorModal
          partner={showPartnerEditor}
          api={api}
          onClose={() => setShowPartnerEditor(null)}
          onSaved={() => {
            setShowPartnerEditor(null);
            fetchPartners();
          }}
        />
      )}

      {showMappingModal && (
        <ChannelMappingModal
          partner={showMappingModal}
          api={api}
          allHotelsList={hotels}
          onClose={() => setShowMappingModal(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div className={`sa-stat sa-stat-${color}`}>
      <div className="sa-stat-icon">
        <i className={`fa-solid ${icon || 'fa-chart-pie'}`} />
      </div>
      <div className="sa-stat-info">
        <p className="sa-stat-label">{label}</p>
        <p className="sa-stat-value">{value ?? '-'}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { active: 'badge-green', suspended: 'badge-red', inactive: 'badge-gray', expired: 'badge-orange' };
  const icon = { active: 'fa-circle-check', suspended: 'fa-ban', inactive: 'fa-circle', expired: 'fa-clock' };
  return (
    <span className={`sa-badge ${map[status] || 'badge-gray'}`}>
      <i className={`fa-solid ${icon[status] || 'fa-circle'}`} style={{ fontSize: 8 }} />
      {status || '-'}
    </span>
  );
}

function TierBadge({ tier }) {
  if (tier === 'premium') return <span className="sa-badge badge-gold"><i className="fa-solid fa-gem" style={{ fontSize: 9 }} /> Premium</span>;
  if (tier === 'pro') return <span className="sa-badge badge-blue"><i className="fa-solid fa-star" style={{ fontSize: 9 }} /> Pro</span>;
  return <span className="sa-badge badge-gray"><i className="fa-regular fa-circle" style={{ fontSize: 9 }} /> Free</span>;
}

function Pagination({ page, totalPages, total, onPage }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1);
  return (
    <div className="sa-pagination">
      <span className="sa-page-info">{total} total records</span>
      <div className="sa-page-btns">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}> Prev</button>
        {pages.map(p => (
          <button key={p} className={p === page ? 'active' : ''} onClick={() => onPage(p)}>{p}</button>
        ))}
        {totalPages > 7 && <span style={{ padding: '0 4px', color: 'var(--sa-text-3)' }}></span>}
        <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next </button>
      </div>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sa-modal">
        <div className="sa-modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="sa-modal-close" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="sa-modal-body">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text', placeholder, required, disabled }) {
  return (
    <div className="sa-form-group">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}

function FeaturesModal({ hotel, onClose, onSave, onSavePayment, loading }) {
  const [flags, setFlags] = useState({ ...hotel.features });

  const toggle = (key) => setFlags(f => ({ ...f, [key]: !f[key] }));

  const handleSave = () => {
    const payload = {};
    FEATURE_LIST.forEach(f => { payload[f.key] = flags[f.key] ?? false; });
    onSave(hotel.hotel_id, payload);
  };

  return (
    <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sa-modal" style={{ maxWidth: 620 }}>
        <div className="sa-modal-head">
          <div>
            <h3>Feature Access & Payment Gateway Control</h3>
            <p>{hotel.hotel_name}</p>
          </div>
          <button className="sa-modal-close" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="sa-modal-body">

          <div className="sa-features-list">
            {FEATURE_LIST.map(f => (
              <div key={f.key} className="sa-feature-row">
                <div className="sa-feature-info">
                  <span className="sa-feature-label">{f.label}</span>
                  <span className="sa-feature-desc">{f.desc}</span>
                </div>
                <button
                  type="button"
                  className={`sa-toggle ${flags[f.key] ? 'sa-toggle-on' : 'sa-toggle-off'}`}
                  onClick={() => toggle(f.key)}
                  aria-label={`Toggle ${f.label}`}
                >
                  <span className="sa-toggle-thumb" />
                </button>
              </div>
            ))}
          </div>

        </div>
        <div className="sa-modal-footer">
          <button className="sa-btn sa-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="sa-btn sa-btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : <><i className="fa-solid fa-check" /> Save Features</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function PricingModal({ hotel, plans, onClose, onSelect, api }) {
  const [durationMonths, setDurationMonths] = useState(1);
  const [customStart, setCustomStart] = useState(hotel.last_payment_date ? hotel.last_payment_date.substring(0, 10) : hotel.created_at ? hotel.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10));
  
  // Calculate default expiry based on duration and start date
  const calcExpiry = (startStr, months) => {
    if (months === -1) return '';
    const date = new Date(startStr);
    if(isNaN(date)) return '';
    date.setMonth(date.getMonth() + months);
    return date.toISOString().substring(0, 10);
  };
  
  const [customEnd, setCustomEnd] = useState(() => calcExpiry(customStart, 1));
  const [tab, setTab] = useState('plans'); // 'plans' or 'history'
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const handleStatusChange = async (logId, status) => {
    try {
      await api.put(`/api/super-admin/subscription-logs/${logId}/status`, { payment_status: status });
      setLogs(logs.map(log => log.id === logId ? { ...log, payment_status: status } : log));
    } catch (err) {
      console.error(err);
      alert('Failed to update status: ' + (err?.response?.data?.error || err.message));
    }
  };

  useEffect(() => {
    if (durationMonths > 0) {
      setCustomEnd(calcExpiry(customStart, durationMonths));
    } else if (durationMonths === -1) {
      setCustomEnd('');
    }
  }, [durationMonths, customStart]);

  useEffect(() => {
    if (tab === 'history' && api) {
      setLogsLoading(true);
      api.get(`/api/super-admin/subscription-logs?hotel_id=${hotel.id}`)
        .then(res => setLogs(res.data.data || []))
        .catch(err => console.error(err))
        .finally(() => setLogsLoading(false));
    }
  }, [tab, api, hotel.id]);

  return (
    <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sa-modal" style={{ maxWidth: 900, width: '95%', background: '#f8f9fa' }}>
        <div className="sa-modal-head" style={{ borderBottom: '1px solid #eaeaea', background: '#fff', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
          <div>
            <h3 style={{ color: '#00224f', fontSize: '22px', fontWeight: 700 }}>Plan & Pricing Management</h3>
            <p style={{ color: '#666', marginTop: 4 }}>
              {hotel.name} - Currently on <strong style={{ textTransform: 'capitalize', color: '#0071c2' }}>{hotel.subscription_tier || 'free'}</strong> plan
            </p>
          </div>
          <button className="sa-modal-close" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        
        <div style={{ display: 'flex', gap: 20, padding: '15px 24px', background: '#fff', borderBottom: '1px solid #eaeaea' }}>
          <button className={`sa-tab-btn ${tab === 'plans' ? 'active' : ''}`} onClick={() => setTab('plans')} style={{ background: 'none', border: 'none', padding: '8px 16px', fontSize: '15px', fontWeight: tab==='plans'?600:500, color: tab==='plans'?'#0071c2':'#555', borderBottom: tab==='plans'?'2px solid #0071c2':'none', cursor: 'pointer' }}>Update Plan</button>
          <button className={`sa-tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')} style={{ background: 'none', border: 'none', padding: '8px 16px', fontSize: '15px', fontWeight: tab==='history'?600:500, color: tab==='history'?'#0071c2':'#555', borderBottom: tab==='history'?'2px solid #0071c2':'none', cursor: 'pointer' }}>Payment History</button>
        </div>

        <div className="sa-modal-body" style={{ padding: '24px' }}>
          {tab === 'plans' && (
            <>
              {/* Premium Duration Selector */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ display: 'inline-flex', background: '#fff', padding: 4, borderRadius: 30, border: '1px solid #ddd', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  {[{label:'1 Month', val:1}, {label:'6 Months', val:6}, {label:'1 Year', val:12}, {label:'Lifetime', val:-1}, {label:'Custom', val:0}].map(d => (
                    <button key={d.val} 
                      onClick={() => setDurationMonths(d.val)}
                      style={{ 
                        padding: '8px 20px', border: 'none', borderRadius: 30, 
                        background: durationMonths === d.val ? '#0071c2' : 'transparent',
                        color: durationMonths === d.val ? '#fff' : '#444',
                        fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >{d.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginBottom: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', padding: '10px 15px', borderRadius: 8, border: '1px solid #ddd' }}>
                   <label style={{ fontSize: '14px', color: '#444', fontWeight: 600 }}><i className="fa-regular fa-calendar" style={{marginRight: '6px', color:'#0071c2'}}></i>Start Date:</label>
                   <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ border: 'none', outline: 'none', fontFamily: 'inherit', color: '#333' }} />
                 </div>
                 {durationMonths !== -1 && (
                 <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', padding: '10px 15px', borderRadius: 8, border: '1px solid #ddd' }}>
                   <label style={{ fontSize: '14px', color: '#444', fontWeight: 600 }}><i className="fa-regular fa-calendar-xmark" style={{marginRight: '6px', color:'#0071c2'}}></i>Expiry Date:</label>
                   <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} disabled={durationMonths !== 0} style={{ border: 'none', outline: 'none', fontFamily: 'inherit', color: durationMonths !== 0 ? '#888' : '#333', background: 'transparent' }} />
                 </div>
                 )}
              </div>

              <div className="sa-pricing-container" style={{ gap: 20 }}>
                {plans.map(p => (
                  <div key={p.tier_name} className={`sa-pricing-card ${p.tier_name} ${hotel.subscription_tier === p.tier_name ? 'active-tier' : ''}`} style={{ flex: 1, minWidth: 260, position: 'relative', overflow: 'hidden', background: '#fff', borderRadius: 12, border: p.tier_name==='pro'?'2px solid #febb02':'1px solid #eaeaea', padding: 24, boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                    {p.tier_name === 'pro' && <div style={{ position: 'absolute', top: 15, right: -30, background: '#febb02', color: '#00224f', padding: '4px 30px', transform: 'rotate(45deg)', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>RECOMMENDED</div>}
                    <div className="sa-pricing-header" style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 15, marginBottom: 15 }}>
                      <div className="sa-pricing-title" style={{ fontSize: 22, fontWeight: 800, textTransform: 'capitalize', color: p.tier_name==='pro'?'#00224f':'#333' }}>{p.tier_name}</div>
                      <div className="sa-pricing-price" style={{ marginTop: 10 }}>
                        <i className="fa-solid fa-indian-rupee-sign" style={{ fontSize: '1.2rem', marginRight: 2, color: '#0071c2' }} />
                        <span style={{ fontSize: '2rem', fontWeight: 700, color: '#333' }}>{p.price}</span>
                        <span style={{ fontSize: '0.9rem', color: '#777', fontWeight: 500, marginLeft: 4 }}>/ month</span>
                      </div>
                    </div>
                    <ul className="sa-pricing-features" style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <li style={{ fontSize: 14, color: '#444' }}><i className="fa-solid fa-check" style={{ color: '#008009', width: 20 }} /> <strong>{p.booking_limit_per_day >= 999999 ? 'Unlimited' : p.booking_limit_per_day}</strong> bookings/day</li>
                      <li style={{ fontSize: 14, color: p.feature_reports ? '#444' : '#aaa' }}><i className={`fa-solid ${p.feature_reports ? 'fa-check' : 'fa-xmark'}`} style={{ color: p.feature_reports ? '#008009' : '#ccc', width: 20 }} /> Reports & Analytics</li>
                      <li style={{ fontSize: 14, color: p.feature_housekeeping ? '#444' : '#aaa' }}><i className={`fa-solid ${p.feature_housekeeping ? 'fa-check' : 'fa-xmark'}`} style={{ color: p.feature_housekeeping ? '#008009' : '#ccc', width: 20 }} /> Housekeeping Module</li>
                      <li style={{ fontSize: 14, color: p.feature_email_notify ? '#444' : '#aaa' }}><i className={`fa-solid ${p.feature_email_notify ? 'fa-check' : 'fa-xmark'}`} style={{ color: p.feature_email_notify ? '#008009' : '#ccc', width: 20 }} /> Email Notifications</li>
                      <li style={{ fontSize: 14, color: p.feature_staff_payroll ? '#444' : '#aaa' }}><i className={`fa-solid ${p.feature_staff_payroll ? 'fa-check' : 'fa-xmark'}`} style={{ color: p.feature_staff_payroll ? '#008009' : '#ccc', width: 20 }} /> Staff Payroll</li>
                    </ul>
                    <button
                      style={{ 
                        marginTop: 20, padding: '12px', width: '100%', borderRadius: 6, border: 'none',
                        background: hotel.subscription_tier === p.tier_name ? '#e6f0f9' : (p.tier_name === 'pro' ? '#0071c2' : '#f0f0f0'),
                        color: hotel.subscription_tier === p.tier_name ? '#0071c2' : (p.tier_name === 'pro' ? '#fff' : '#333'),
                        fontWeight: 700, fontSize: 15, cursor: hotel.subscription_tier === p.tier_name ? 'default' : 'pointer',
                        transition: '0.2s',
                        boxShadow: (hotel.subscription_tier !== p.tier_name && p.tier_name === 'pro') ? '0 2px 6px rgba(0,113,194,0.3)' : 'none'
                      }}
                      disabled={hotel.subscription_tier === p.tier_name}
                      onClick={() => {
                        const isSelectionValid = durationMonths !== 0 || (customStart && customEnd);
                        if (!isSelectionValid) {
                          alert('Please select both start and end dates for a custom duration.');
                          return;
                        }
                        const amount = p.price * (durationMonths > 0 ? durationMonths : (durationMonths === -1 ? 120 : 1));
                        onSelect(p.tier_name, durationMonths, customStart, durationMonths === -1 ? null : customEnd, amount);
                      }}
                    >
                      {hotel.subscription_tier === p.tier_name ? <><i className="fa-solid fa-circle-check" /> Current Plan</> : `Select ${p.tier_name.charAt(0).toUpperCase() + p.tier_name.slice(1)}`}
                    </button>
                    <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#777' }}>
                      <i className="fa-solid fa-shield-halved" style={{ marginRight: 4, color: '#0071c2' }} /> 100% Secure & Guaranteed
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'history' && (
            <div className="sa-history-container" style={{ background: '#fff', borderRadius: 8, border: '1px solid #eaeaea', overflow: 'hidden' }}>
              {logsLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#666' }}><i className="fa-solid fa-spinner fa-spin fa-2x" /></div>
              ) : logs.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#888' }}><i className="fa-solid fa-clock-rotate-left fa-3x" style={{ opacity: 0.2, marginBottom: 15 }} /> <br/> No payment history found.</div>
              ) : (
                <table className="sa-table" style={{ margin: 0, border: 'none' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '14px 15px', color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Date</th>
                      <th style={{ padding: '14px 15px', color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Action</th>
                      <th style={{ padding: '14px 15px', color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Tier Change</th>
                      <th style={{ padding: '14px 15px', color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Duration</th>
                      <th style={{ padding: '14px 15px', color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Period</th>
                      <th style={{ padding: '14px 15px', color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Amount</th>
                      <th style={{ padding: '14px 15px', color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Status</th>
                      <th style={{ padding: '14px 15px', color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, minWidth: 250 }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'all 0.2s' }} className="sa-history-row">
                        <td style={{ padding: '16px 15px', whiteSpace: 'nowrap', color: '#334155', fontSize: 13, fontWeight: 500 }}>
                          {new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '16px 15px', textTransform: 'capitalize' }}>
                           <span style={{ 
                             background: log.action === 'upgraded' ? '#ecfdf5' : log.action === 'downgraded' ? '#fef2f2' : '#eff6ff',
                             color: log.action === 'upgraded' ? '#059669' : log.action === 'downgraded' ? '#dc2626' : '#2563eb',
                             padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${log.action === 'upgraded' ? '#d1fae5' : log.action === 'downgraded' ? '#fee2e2' : '#dbeafe'}`
                           }}>{log.action}</span>
                        </td>
                        <td style={{ padding: '16px 15px', fontSize: 13 }}>
                          {log.old_tier !== log.new_tier ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ textTransform: 'capitalize', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>{log.old_tier}</span>
                              <i className="fa-solid fa-arrow-right" style={{ color: '#cbd5e1', fontSize: 10 }} />
                              <strong style={{ textTransform: 'capitalize', color: '#1e293b' }}>{log.new_tier}</strong>
                            </div>
                          ) : (
                            <strong style={{ textTransform: 'capitalize', color: '#1e293b' }}>{log.new_tier}</strong>
                          )}
                        </td>
                        <td style={{ padding: '16px 15px', color: '#334155', fontSize: 13, fontWeight: 600 }}>
                          {log.duration_months === -1 ? 'Lifetime' : log.duration_months === 0 ? 'Custom' : `${log.duration_months} Month(s)`}
                        </td>
                        <td style={{ padding: '16px 15px', color: '#475569', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {log.start_date ? new Date(log.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'} 
                          {log.duration_months !== -1 && log.end_date ? <><br/><span style={{color: '#94a3b8', fontSize: 12}}>to</span> {new Date(log.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</> : ''}
                        </td>
                        <td style={{ padding: '16px 15px', color: log.amount > 0 ? '#0f172a' : '#cbd5e1', fontSize: 14, fontWeight: 700 }}>
                          {log.amount > 0 ? `₹${log.amount.toLocaleString()}` : 'N/A'}
                        </td>
                        <td style={{ padding: '16px 15px' }}>
                          <select 
                            value={log.payment_status || 'unpaid'}
                            onChange={(e) => handleStatusChange(log.id, e.target.value)}
                            style={{ 
                              appearance: 'none', WebkitAppearance: 'none',
                              padding: '6px 28px 6px 12px', borderRadius: 20, border: '1px solid transparent', fontSize: 12, fontWeight: 600,
                              background: `${(log.payment_status || 'unpaid') === 'paid' ? '#dcfce7' : ((log.payment_status || 'unpaid') === 'failed' ? '#fee2e2' : '#fef3c7')} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='20' height='20' fill='%23${(log.payment_status || 'unpaid') === 'paid' ? '166534' : ((log.payment_status || 'unpaid') === 'failed' ? '991b1b' : '92400e')}'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E") no-repeat right 6px center / 18px`,
                              color: (log.payment_status || 'unpaid') === 'paid' ? '#166534' : ((log.payment_status || 'unpaid') === 'failed' ? '#991b1b' : '#92400e'),
                              cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                          >
                            <option value="unpaid">Unpaid</option>
                            <option value="paid">Paid</option>
                            <option value="failed">Failed</option>
                          </select>
                        </td>
                        <td style={{ padding: '16px 15px', color: '#64748b', fontSize: 13, minWidth: 250 }}>
                          {log.reason || <span style={{color: '#cbd5e1'}}>N/A</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlansTab({ plans, onUpdate, doAction, api }) {
  const [editingPlan, setEditingPlan] = useState(null);
  const handleSave = (tier_name) => {
    doAction(async () => {
      await api.put(`/api/super-admin/plans/${tier_name}`, editingPlan);
      onUpdate();
      setEditingPlan(null);
    }, 'Plan settings saved successfully');
  };

  return (
    <div className="sa-card">
      <div className="sa-card-head">
        <div>
          <h3><i className="fa-solid fa-layer-group" /> Subscription Plans Configuration</h3>
          <p style={{ fontSize: 12.5, color: 'var(--sa-text-3)', marginTop: 4 }}>
            Changes applied here automatically update limits and features for all hotels on that plan.
          </p>
        </div>
      </div>
      <div className="sa-plans-grid">
        {plans.map(p => {
          const isEditing = editingPlan && editingPlan.tier_name === p.tier_name;
          const currentData = isEditing ? editingPlan : p;
          return (
            <div key={p.tier_name} className={`sa-plan-editor ${p.tier_name}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ textTransform: 'capitalize' }}>{p.tier_name} Plan</h3>
                {!isEditing ? (
                  <button className="sa-btn sa-btn-sm sa-btn-secondary" onClick={() => setEditingPlan({ ...p })}>
                    <i className="fa-solid fa-pen" /> Edit
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="sa-btn sa-btn-sm sa-btn-secondary" onClick={() => setEditingPlan(null)}>Cancel</button>
                    <button className="sa-btn sa-btn-sm sa-btn-primary" onClick={() => handleSave(p.tier_name)}>
                      <i className="fa-solid fa-check" /> Save
                    </button>
                  </div>
                )}
              </div>
              <FormField
                label="Monthly Price (₹)"
                type="number"
                value={currentData.price}
                onChange={v => isEditing && setEditingPlan({ ...editingPlan, price: Number(v) })}
                disabled={!isEditing}
              />
              <FormField
                label="Daily Booking Limit (999999 = unlimited)"
                type="number"
                value={currentData.booking_limit_per_day}
                onChange={v => isEditing && setEditingPlan({ ...editingPlan, booking_limit_per_day: Number(v) })}
                disabled={!isEditing}
              />
              <div className="sa-plan-features">
                {FEATURE_LIST.map(f => (
                  <div key={f.key} className="sa-plan-feature-row">
                    <span>{f.label}</span>
                    <button
                      type="button"
                      disabled={!isEditing}
                      className={`sa-toggle ${currentData[f.key] ? 'sa-toggle-on' : 'sa-toggle-off'}`}
                      onClick={() => isEditing && setEditingPlan({ ...editingPlan, [f.key]: !currentData[f.key] })}
                    >
                      <span className="sa-toggle-thumb" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// PAYMENT CONFIG ROW - inline editable row for the Payment tab

function PaymentConfigRow({ hotel, api, onSaved }) {
  const [open, setOpen] = useState(false);
  const [gateway, setGateway] = useState(hotel.payment_gateway || 'razorpay');
  const [keyId, setKeyId] = useState(hotel.razorpay_key_id || '');
  const [keySecret, setKeySecret] = useState('');
  
  const [ppMerchantID, setPpMerchantID] = useState(hotel.phonepe_merchant_id || '');
  const [ppSaltKey, setPpSaltKey] = useState('');
  const [ppSaltIndex, setPpSaltIndex] = useState(hotel.phonepe_salt_index || '1');
  const [ppEnv, setPpEnv] = useState(hotel.phonepe_env || 'UAT');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [rpConfigured, setRpConfigured] = useState(hotel.razorpay_configured || false);
  const [ppConfigured, setPpConfigured] = useState(hotel.phonepe_configured || false);
  const [error, setError] = useState('');

  // Fetch real state when expanding
  const handleToggle = async () => {
    if (open) { setOpen(false); setError(''); setTestResult(null); return; }
    try {
      const res = await api.get(`/api/super-admin/hotels/${hotel.id}/features`);
      setGateway(res.data.payment_gateway || 'razorpay');
      setKeyId(res.data.razorpay_key_id || '');
      setKeySecret(res.data.razorpay_key_secret || '');
      setRpConfigured(res.data.razorpay_configured || false);
      setPpMerchantID(res.data.phonepe_merchant_id || '');
      setPpSaltKey(res.data.phonepe_salt_key || '');
      setPpSaltIndex(res.data.phonepe_salt_index || '1');
      setPpEnv(res.data.phonepe_env || 'UAT');
      setPpConfigured(res.data.phonepe_configured || false);
    } catch { /* use current state */ }
    setOpen(true);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (gateway === 'razorpay') {
        const res = await api.get(`/api/super-admin/payments/razorpay/health?hotel_id=${hotel.id}`);
        setTestResult({ ok: true, msg: res.data?.message || 'Razorpay connection valid!' });
      } else {
        const res = await api.get(`/api/super-admin/payments/phonepe/health?hotel_id=${hotel.id}`);
        setTestResult({ ok: true, msg: res.data?.message || 'PhonePe credentials valid!' });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e?.response?.data?.message || e?.response?.data?.error || 'Connection failed - please check credentials.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setTestResult(null);
    if (gateway === 'razorpay' && !keyId.trim()) {
      setError('Razorpay Key ID is required');
      return;
    }
    if (gateway === 'phonepe' && !ppMerchantID.trim()) {
      setError('PhonePe Merchant ID is required');
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/api/super-admin/hotels/${hotel.id}/payment-config`, {
        payment_gateway: gateway,
        razorpay_key_id: keyId.trim(),
        razorpay_key_secret: keySecret.trim(),
        phonepe_merchant_id: ppMerchantID.trim(),
        phonepe_salt_key: ppSaltKey.trim(),
        phonepe_salt_index: ppSaltIndex.trim() || '1',
        phonepe_env: ppEnv,
      });

      // Refetch updated state
      const res = await api.get(`/api/super-admin/hotels/${hotel.id}/features`);
      setGateway(res.data.payment_gateway || 'razorpay');
      setKeyId(res.data.razorpay_key_id || '');
      setKeySecret(res.data.razorpay_key_secret || '');
      setRpConfigured(res.data.razorpay_configured || false);
      setPpMerchantID(res.data.phonepe_merchant_id || '');
      setPpSaltKey(res.data.phonepe_salt_key || '');
      setPpSaltIndex(res.data.phonepe_salt_index || '1');
      setPpEnv(res.data.phonepe_env || 'UAT');
      setPpConfigured(res.data.phonepe_configured || false);
      setOpen(false);
      toast.success(`Gateway updated to ${gateway.toUpperCase()} for ${hotel.name}`);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to save gateway configuration');
    } finally {
      setSaving(false);
    }
  };

  const isCurrentConfigured = gateway === 'razorpay' ? rpConfigured : ppConfigured;
  const currentIdPreview = gateway === 'razorpay' ? keyId : ppMerchantID;

  return (
    <>
      <tr>
        <td>
          <div className="sa-cell-stack">
            <strong>{hotel.name}</strong>
            <span className="sa-cell-sub">{hotel.admin_name || hotel.admin_username || '-'}</span>
          </div>
        </td>
        <td>{hotel.city || '-'}</td>
        <td><TierBadge tier={hotel.subscription_tier} /></td>
        <td>
          {gateway === 'phonepe' ? (
            <span className="sa-badge badge-purple"><i className="fa-solid fa-mobile-screen-button" /> PhonePe</span>
          ) : (
            <span className="sa-badge badge-blue"><i className="fa-solid fa-bolt" /> Razorpay</span>
          )}
        </td>
        <td>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--sa-text-2)' }}>
            {currentIdPreview || <em style={{ opacity: 0.4 }}>Not set</em>}
          </span>
        </td>
        <td>
          {isCurrentConfigured ? (
            <span className="sa-badge badge-green"><i className="fa-solid fa-circle-check" /> Configured</span>
          ) : (
            <span className="sa-badge badge-orange"><i className="fa-solid fa-circle-exclamation" /> Not set</span>
          )}
        </td>
        <td>
          <button className="sa-btn sa-btn-sm sa-btn-secondary" onClick={handleToggle}>
            <i className={`fa-solid ${open ? 'fa-chevron-up' : isCurrentConfigured ? 'fa-pen-to-square' : 'fa-key'}`} />
            {' '}{open ? 'Close' : isCurrentConfigured ? 'Edit' : 'Configure'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ background: '#f8fafc', padding: '16px 20px', borderBottom: '2px solid #e2e8f0' }}>
            <div style={{ maxWidth: 720 }}>
              {/* Gateway selector radio pills */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--sa-text-2)', display: 'block', marginBottom: 6 }}>
                  Select Active Payment Gateway for {hotel.name}:
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setGateway('razorpay')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                      border: gateway === 'razorpay' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      background: gateway === 'razorpay' ? '#f0f9ff' : '#ffffff',
                      color: gateway === 'razorpay' ? '#0369a1' : '#475569',
                      fontWeight: 600, fontSize: 13,
                    }}
                  >
                    <i className="fa-solid fa-bolt" style={{ color: '#0284c7' }} /> Razorpay
                    {gateway === 'razorpay' && <i className="fa-solid fa-circle-check" style={{ marginLeft: 4, color: '#0284c7' }} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGateway('phonepe')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                      border: gateway === 'phonepe' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                      background: gateway === 'phonepe' ? '#f5f3ff' : '#ffffff',
                      color: gateway === 'phonepe' ? '#6d28d9' : '#475569',
                      fontWeight: 600, fontSize: 13,
                    }}
                  >
                    <i className="fa-solid fa-mobile-screen-button" style={{ color: '#7c3aed' }} /> PhonePe
                    {gateway === 'phonepe' && <i className="fa-solid fa-circle-check" style={{ marginLeft: 4, color: '#7c3aed' }} />}
                  </button>
                </div>
              </div>

              {/* Conditional credentials form */}
              {gateway === 'razorpay' ? (
                <div style={{ background: '#ffffff', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fa-solid fa-bolt" /> Razorpay Credentials
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="sa-form-group" style={{ margin: 0 }}>
                      <label>Razorpay Key ID *</label>
                      <input
                        type="text"
                        value={keyId}
                        onChange={e => { setKeyId(e.target.value); setError(''); }}
                        placeholder="rzp_live_... or rzp_test_..."
                        autoComplete="off"
                      />
                    </div>
                    <div className="sa-form-group" style={{ margin: 0 }}>
                      <label>
                        Key Secret{' '}
                        {rpConfigured && <span style={{ opacity: 0.6, fontWeight: 400 }}>(blank = keep existing)</span>}
                      </label>
                      <input
                        type="text"
                        value={keySecret}
                        onChange={e => setKeySecret(e.target.value)}
                        placeholder={rpConfigured ? '  (unchanged)' : 'Enter Razorpay secret'}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#ffffff', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fa-solid fa-mobile-screen-button" /> PhonePe PG Credentials
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                    <div className="sa-form-group" style={{ margin: 0 }}>
                      <label>Merchant ID *</label>
                      <input
                        type="text"
                        value={ppMerchantID}
                        onChange={e => { setPpMerchantID(e.target.value); setError(''); }}
                        placeholder="e.g. PGTESTPAYUAT or M123456"
                        autoComplete="off"
                      />
                    </div>
                    <div className="sa-form-group" style={{ margin: 0 }}>
                      <label>
                        Salt Key{' '}
                        {ppConfigured && <span style={{ opacity: 0.6, fontWeight: 400 }}>(blank = keep existing)</span>}
                      </label>
                      <input
                        type="text"
                        value={ppSaltKey}
                        onChange={e => setPpSaltKey(e.target.value)}
                        placeholder={ppConfigured ? '  (unchanged)' : 'Enter PhonePe Salt Key'}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="sa-form-group" style={{ margin: 0 }}>
                      <label>Salt Index</label>
                      <input
                        type="text"
                        value={ppSaltIndex}
                        onChange={e => setPpSaltIndex(e.target.value)}
                        placeholder="1"
                      />
                    </div>
                    <div className="sa-form-group" style={{ margin: 0 }}>
                      <label>Environment</label>
                      <select value={ppEnv} onChange={e => setPpEnv(e.target.value)}>
                        <option value="UAT">UAT / Sandbox (Testing)</option>
                        <option value="PRODUCTION">PRODUCTION (Live)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <button
                  type="button"
                  className="sa-btn sa-btn-secondary sa-btn-sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? <><i className="fa-solid fa-spinner fa-spin" /> Testing</> : <><i className="fa-solid fa-plug" /> Test Credentials</>}
                </button>
                <button
                  className="sa-btn sa-btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <><i className="fa-solid fa-spinner fa-spin" /> Saving Gateway</> : <><i className="fa-solid fa-check" /> Save Gateway Config</>}
                </button>
              </div>

              {testResult && (
                <div style={{
                  marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                  background: testResult.ok ? '#dcfce7' : '#fee2e2',
                  color: testResult.ok ? '#166534' : '#991b1b',
                  border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <i className={`fa-solid ${testResult.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
                  {testResult.msg}
                </div>
              )}

              {error && (
                <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fa-solid fa-circle-exclamation" /> {error}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// THEME CARD - preview card for a hotel theme

// PSYCHOLOGICAL TRUST PRESETS (MakeMyTrip, Agoda, EaseMyTrip, Festive, Heritage)

const PSYCHOLOGICAL_PRESETS = [
  {
    id: 'mmt_navy',
    name: 'MakeMyTrip Classic Navy',
    badge: 'Platform Trust Standard',
    primary_color: '#003580',
    accent_color: '#FF6B00',
    bg_gradient_from: '#001f5c',
    bg_gradient_to: '#003580',
    text_on_banner: '#ffffff',
    font_family: 'Inter',
    trust_badge_text: '"" 100% Verified Hotel  Best Price Guarantee  Pay at Hotel Available',
    banner_headline: 'Book Direct & Save - Best Rate Guarantee',
    banner_subtext: 'Instant confirmation with zero booking fees and free cancellation',
  },
  {
    id: 'agoda_emerald',
    name: 'Agoda Emerald Resort',
    badge: 'Luxury & Resort Conversion',
    primary_color: '#059669',
    accent_color: '#F59E0B',
    bg_gradient_from: '#064e3b',
    bg_gradient_to: '#059669',
    text_on_banner: '#ffffff',
    font_family: 'Plus Jakarta Sans',
    trust_badge_text: ' 4.8/5 Guest Rating  Free Cancellation on Most Rooms  Instant Confirmation',
    banner_headline: 'Luxury Stays & Premium Suite Deals',
    banner_subtext: 'Unlock member-only discounts and complimentary welcome drinks',
  },
  {
    id: 'easemytrip_blue',
    name: 'EaseMyTrip Vibrant Cyan',
    badge: 'Fast Booking OTA Style',
    primary_color: '#0284C7',
    accent_color: '#FF385C',
    bg_gradient_from: '#0c4a6e',
    bg_gradient_to: '#0284C7',
    text_on_banner: '#ffffff',
    font_family: 'Outfit',
    trust_badge_text: ' No Hidden Charges  Zero Convenience Fee Options  24x7 Customer Helpdesk',
    banner_headline: 'Express Check-In & Best Value Stay',
    banner_subtext: 'Book in 30 seconds with instant WhatsApp confirmation',
  },
  {
    id: 'festive_gold',
    name: 'Festive Gold & Diwali',
    badge: 'Indian Festive Special',
    primary_color: '#D97706',
    accent_color: '#E11D48',
    bg_gradient_from: '#451a03',
    bg_gradient_to: '#92400e',
    text_on_banner: '#fef3c7',
    font_family: 'Outfit',
    trust_badge_text: '" Festive Season Exclusive  Special Family Discounts  Complimentary Breakfast',
    banner_headline: 'Happy Festive Season! Enjoy Up to 30% Off',
    banner_subtext: 'Celebrate with festive meals, fireworks views, and luxury stay packages',
  },
  {
    id: 'royal_wine',
    name: 'Royal Heritage Palace',
    badge: 'Boutique & Heritage',
    primary_color: '#831843',
    accent_color: '#EAB308',
    bg_gradient_from: '#500724',
    bg_gradient_to: '#831843',
    text_on_banner: '#fffbeb',
    font_family: 'Playfair Display',
    trust_badge_text: '"˜" Heritage Luxury Stay  Royal Welcome Drink  Complimentary Late Checkout',
    banner_headline: 'Experience Royal Indian Hospitality',
    banner_subtext: 'Palace suites, traditional fine dining, and personalized concierge service',
  },
  {
    id: 'modern_slate',
    name: 'Modern Executive Slate',
    badge: 'Business & Corporate',
    primary_color: '#334155',
    accent_color: '#2563EB',
    bg_gradient_from: '#0f172a',
    bg_gradient_to: '#334155',
    text_on_banner: '#f8fafc',
    font_family: 'Inter',
    trust_badge_text: 'Business Class Verified  High-Speed Wi-Fi  Express Check-in & Tax Invoice',
    banner_headline: 'Corporate Friendly Hotel & Meeting Spaces',
    banner_subtext: 'Prime city center location with seamless airport transfers',
  },
];

// THEME CARD - Enhanced Enterprise Card with Quick Toggle & Trust Indicator

function ThemeCard({ theme, onEdit, isGlobal, api, onSaved }) {
  const [toggling, setToggling] = useState(false);
  const gradStyle = { background: `linear-gradient(135deg, ${theme.bg_gradient_from || '#001f5c'}, ${theme.bg_gradient_to || '#003580'})` };
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  const handleQuickToggle = async (e) => {
    e.stopPropagation();
    setToggling(true);
    try {
      const endpoint = isGlobal
        ? `/api/super-admin/global-themes/${theme.id}`
        : `/api/super-admin/hotels/${theme.hotel_id}/themes/${theme.id}`;
      await api.put(endpoint, { is_active: !theme.is_active });
      toast.success(theme.is_active ? 'Theme deactivated' : 'Theme activated!');
      if (onSaved) onSaved();
    } catch (err) {
      toast.error('Failed to toggle theme status');
    } finally {
      setToggling(false);
    }
  };

  const presetMatch = PSYCHOLOGICAL_PRESETS.find(p => p.id === theme.preset_name) || PSYCHOLOGICAL_PRESETS[0];

  const now = new Date();
  const isScheduled = theme.is_active && theme.active_from && new Date(theme.active_from) > now;
  const isExpired = theme.is_active && theme.active_until && new Date(theme.active_until) < now;

  return (
    <div className="sa-theme-card" onClick={onEdit} title="Click to edit theme studio">
      <div className="sa-theme-banner-preview" style={gradStyle}>
        {theme.banner_image_url && <img src={resolveAssetUrl(theme.banner_image_url)} alt="" className="sa-theme-banner-img" />}
        <div className="sa-theme-banner-overlay">
          <div className="sa-theme-banner-headline" style={{ color: theme.text_on_banner || '#fff', fontFamily: theme.font_family || 'Inter' }}>
            {theme.banner_headline || theme.name}
          </div>
          {theme.banner_subtext && (
            <div className="sa-theme-banner-sub" style={{ color: theme.text_on_banner || '#fff' }}>
              {theme.banner_subtext}
            </div>
          )}
        </div>
        
        {theme.is_currently_active ? (
          <div className="sa-theme-active-badge"><i className="fa-solid fa-bolt" /> LIVE NOW</div>
        ) : isScheduled ? (
          <div className="sa-theme-scheduled-badge" style={{ background: '#d97706', color: '#fff', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, position: 'absolute', top: 10, left: 10, zIndex: 3 }}><i className="fa-solid fa-clock" /> SCHEDULED</div>
        ) : isExpired ? (
          <div className="sa-theme-inactive-badge" style={{ background: '#64748b', color: '#fff', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, position: 'absolute', top: 10, left: 10, zIndex: 3 }}><i className="fa-solid fa-calendar-xmark" /> EXPIRED</div>
        ) : (
          <div className="sa-theme-inactive-badge"><i className="fa-solid fa-moon" /> INACTIVE</div>
        )}

        {isGlobal ? (
          <div className="sa-theme-global-badge"><i className="fa-solid fa-earth-asia" /> GLOBAL (ALL HOTELS)</div>
        ) : (
          <div className="sa-theme-hotel-badge"><i className="fa-solid fa-hotel" /> HOTEL OVERRIDE</div>
        )}
      </div>

      <div className="sa-theme-card-body">
        <div className="sa-theme-card-head-row">
          <div>
            <div className="sa-theme-card-name">{theme.name}</div>
            <div className="sa-theme-preset-tag">
              <i className="fa-solid fa-shield-halved" style={{ color: theme.primary_color || '#003580' }} />
              {theme.preset_name ? (presetMatch.name) : 'Custom Trust Theme'}
            </div>
          </div>
          <button
            type="button"
            className={`sa-btn-quick-toggle ${theme.is_active ? 'active' : ''}`}
            onClick={handleQuickToggle}
            disabled={toggling}
            title={theme.is_active ? 'Click to deactivate' : 'Click to enable & activate'}
          >
            {toggling ? <i className="fa-solid fa-spinner fa-spin" /> : theme.is_active ? <i className="fa-solid fa-toggle-on" /> : <i className="fa-solid fa-toggle-off" />}
            {theme.is_active ? 'Active' : 'Enable'}
          </button>
        </div>

        {theme.trust_badge_text && (
          <div className="sa-theme-card-trust-snippet" title={theme.trust_badge_text}>
            {theme.trust_badge_text}
          </div>
        )}

        <div className="sa-theme-card-foot-row">
          <div className="sa-theme-card-dates">
            {fmtD(theme.active_from) && fmtD(theme.active_until) ? (
              <><i className="fa-solid fa-calendar" /> {fmtD(theme.active_from)} " " {fmtD(theme.active_until)}</>
            ) : theme.is_active ? (
              <span style={{ color: '#059669', fontWeight: 600 }}><i className="fa-solid fa-circle-check" /> Continuous / Force Active</span>
            ) : (
              <span style={{ opacity: 0.5 }}><i className="fa-solid fa-power-off" /> Disabled / Standby</span>
            )}
          </div>
          <div className="sa-theme-colors">
            {[theme.primary_color, theme.accent_color, theme.bg_gradient_from, theme.bg_gradient_to].map((c, i) => (
              <span key={i} className="sa-color-chip" style={{ background: c || '#000' }} title={c} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// THEME EDITOR MODAL - Enterprise Theme Studio with Psychological Trust Presets & Real-Time Booking Portal Canvas

function ThemeEditorModal({ hotelId, isGlobal, theme, api, onClose, onSaved, onDeleted }) {
  const isNew = !theme;
  const [activeSection, setActiveSection] = React.useState('brand'); // 'brand' | 'banner' | 'left' | 'right' | 'schedule'
  const [form, setForm] = useState({
    name: theme?.name || 'MakeMyTrip Trust Theme',
    description: theme?.description || '',
    preset_name: theme?.preset_name || 'mmt_navy',
    font_family: theme?.font_family || 'Inter',
    trust_badge_text: theme?.trust_badge_text || '"" 100% Verified Hotel  Best Price Guarantee  Pay at Hotel Available',
    header_logo_url: theme?.header_logo_url || '',

    banner_image_url: theme?.banner_image_url || '',
    banner_headline:  theme?.banner_headline  || 'Book Direct & Save - Best Rate Guarantee',
    banner_subtext:   theme?.banner_subtext   || 'Instant confirmation with zero booking fees and free cancellation',

    primary_color:   theme?.primary_color   || '#003580',
    accent_color:    theme?.accent_color    || '#FF6B00',
    bg_gradient_from: theme?.bg_gradient_from || '#001f5c',
    bg_gradient_to:   theme?.bg_gradient_to   || '#003580',
    text_on_banner:  theme?.text_on_banner  || '#ffffff',

    left_panel_image_url:  theme?.left_panel_image_url  || '',
    left_panel_title:      theme?.left_panel_title      || '',
    left_panel_subtext:    theme?.left_panel_subtext    || '',
    left_panel_btn_text:   theme?.left_panel_btn_text   || '',
    left_panel_btn_url:    theme?.left_panel_btn_url    || '',
    left_panel_bg_from:    theme?.left_panel_bg_from    || '#001f5c',
    left_panel_bg_to:      theme?.left_panel_bg_to      || '#003580',
    left_panel_text_color: theme?.left_panel_text_color || '#ffffff',

    right_panel_image_url:  theme?.right_panel_image_url  || '',
    right_panel_title:      theme?.right_panel_title      || '',
    right_panel_subtext:    theme?.right_panel_subtext    || '',
    right_panel_btn_text:   theme?.right_panel_btn_text   || '',
    right_panel_btn_url:    theme?.right_panel_btn_url    || '',
    right_panel_bg_from:    theme?.right_panel_bg_from    || '#001f5c',
    right_panel_bg_to:      theme?.right_panel_bg_to      || '#003580',
    right_panel_text_color: theme?.right_panel_text_color || '#ffffff',

    active_from:  theme?.active_from  ? theme.active_from.slice(0, 10)  : '',
    active_until: theme?.active_until ? theme.active_until.slice(0, 10) : '',
    is_active: theme?.is_active || false,
  });
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Upload state
  const [uploading,  setUploading]  = useState({});
  const [previews,   setPreviews]   = useState({
    banner:      theme?.banner_image_url     || '',
    left_panel:  theme?.left_panel_image_url || '',
    right_panel: theme?.right_panel_image_url|| '',
    logo:        theme?.header_logo_url      || '',
  });
  const fileRefs = {
    banner: React.useRef(null),
    left_panel: React.useRef(null),
    right_panel: React.useRef(null),
    logo: React.useRef(null),
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Apply a 1-click psychological design preset
  const applyPreset = (p) => {
    setForm(f => ({
      ...f,
      preset_name: p.id,
      name: f.name === 'MakeMyTrip Trust Theme' || !f.name ? p.name : f.name,
      primary_color: p.primary_color,
      accent_color: p.accent_color,
      bg_gradient_from: p.bg_gradient_from,
      bg_gradient_to: p.bg_gradient_to,
      text_on_banner: p.text_on_banner,
      font_family: p.font_family,
      trust_badge_text: p.trust_badge_text,
      banner_headline: f.banner_headline === 'Book Direct & Save - Best Rate Guarantee' || !f.banner_headline ? p.banner_headline : f.banner_headline,
      banner_subtext: f.banner_subtext === 'Instant confirmation with zero booking fees and free cancellation' || !f.banner_subtext ? p.banner_subtext : f.banner_subtext,
    }));
    toast.success(`Applied ${p.name} color palette & trust settings!`);
  };

  const uploadImage = async (slot, fieldName, formKey) => {
    const ref = fileRefs[slot];
    const file = ref.current?.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setPreviews(p => ({ ...p, [slot]: localUrl }));
    setUploading(u => ({ ...u, [slot]: true }));
    try {
      const fd = new FormData();
      fd.append(fieldName, file);
      const base = isGlobal ? '/api/super-admin/global-themes' : `/api/super-admin/hotels/${hotelId}/themes`;
      const endpoint = slot === 'banner' ? `${base}/upload-banner` : slot === 'logo' ? `${base}/upload-logo` : `${base}/upload-panel`;
      const res = await api.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data?.url || '';
      set(formKey, url);
      setPreviews(p => ({ ...p, [slot]: url }));
      toast.success('Image uploaded successfully!');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed');
      setPreviews(p => ({ ...p, [slot]: form[formKey] }));
    } finally {
      setUploading(u => ({ ...u, [slot]: false }));
    }
  };

  const UploadZone = ({ slot, fieldName, formKey, label }) => (
    <div className="sa-form-group" style={{ gridColumn: 'span 2' }}>
      <label>{label} <span style={{ opacity:.5, fontWeight:400 }}>(JPG/PNG/WEBP  max 5 MB)</span></label>
      <input ref={fileRefs[slot]} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display:'none' }}
        onChange={() => uploadImage(slot, fieldName, formKey)} />
      <div className="sa-banner-upload-zone" onClick={() => fileRefs[slot].current?.click()}>
        {uploading[slot] ? (
          <div className="sa-banner-uploading"><i className="fa-solid fa-spinner fa-spin" style={{ fontSize:26, color: form.primary_color || '#003580' }} /><span>Uploading image</span></div>
        ) : previews[slot] ? (
          <div className="sa-banner-preview-wrap">
            <img src={resolveAssetUrl(previews[slot])} alt="preview" className="sa-banner-preview-img" />
            <div className="sa-banner-change-overlay"><i className="fa-solid fa-camera" /> Change Image</div>
          </div>
        ) : (
          <div className="sa-banner-empty">
            <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize:26, color: form.primary_color || '#003580', marginBottom:4 }} />
            <div style={{ fontWeight:600, fontSize:13 }}>Click to upload artwork</div>
            <div style={{ fontSize:11, opacity:.6, marginTop:2 }}>High contrast JPG, PNG or WEBP (up to 5 MB)</div>
          </div>
        )}
      </div>
    </div>
  );

  const ColorField = ({ label, field }) => (
    <div className="sa-form-group sa-color-field">
      <label>{label}</label>
      <div className="sa-color-input-wrap">
        <input type="color" value={form[field] || '#000000'} onChange={e => set(field, e.target.value)} />
        <input type="text"  value={form[field]}              onChange={e => set(field, e.target.value)} maxLength={7} />
      </div>
    </div>
  );

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Theme name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        active_from:  form.active_from  ? new Date(form.active_from).toISOString()  : null,
        active_until: form.active_until ? new Date(form.active_until).toISOString() : null,
      };
      if (isGlobal) {
        if (isNew) await api.post('/api/super-admin/global-themes', payload);
        else       await api.put(`/api/super-admin/global-themes/${theme.id}`, payload);
      } else {
        if (isNew) await api.post(`/api/super-admin/hotels/${hotelId}/themes`, payload);
        else       await api.put(`/api/super-admin/hotels/${hotelId}/themes/${theme.id}`, payload);
      }
      toast.success(isNew ? 'Theme created successfully!' : 'Theme updated successfully!');
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to save theme'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this theme? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      if (isGlobal) await api.delete(`/api/super-admin/global-themes/${theme.id}`);
      else          await api.delete(`/api/super-admin/hotels/${hotelId}/themes/${theme.id}`);
      toast.success('Theme deleted'); onDeleted();
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to delete theme'); }
    finally { setDeleting(false); }
  };

  const sectionTabs = [
    { key: 'brand',    label: 'Trust & Brand System', icon: 'fa-solid fa-shield-halved' },
    { key: 'banner',   label: 'Top Ribbon',           icon: 'fa-solid fa-rectangle-ad' },
    { key: 'left',     label: 'Left Promo Panel',      icon: 'fa-solid fa-table-columns' },
    { key: 'right',    label: 'Right Promo Panel',     icon: 'fa-solid fa-table-columns' },
    { key: 'schedule', label: 'Schedule & Status',    icon: 'fa-solid fa-calendar-check' },
  ];

  return (
    <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sa-modal sa-theme-studio-modal" style={{ maxWidth: 960, width: '96%' }}>
        <div className="sa-modal-head">
          <div>
            <h3>
              <i className="fa-solid fa-wand-magic-sparkles" style={{ color: form.primary_color || '#003580' }} />
              {' '}{isNew ? 'Enterprise Theme Studio - New Theme' : `Theme Studio - ${theme.name}`}
            </h3>
            <p>Psychological trust design builder for public booking portal (MakeMyTrip, Agoda, EaseMyTrip standard)</p>
          </div>
          <button className="sa-modal-close" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        {/* 1-CLICK PSYCHOLOGICAL PRESETS STRIP */}
        <div className="sa-theme-presets-bar">
          <div className="sa-theme-presets-title">
            <i className="fa-solid fa-bolt" /> 1-Click Trust Palettes:
          </div>
          <div className="sa-theme-presets-scroll">
            {PSYCHOLOGICAL_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                className={`sa-preset-chip ${form.preset_name === p.id ? 'active' : ''}`}
                onClick={() => applyPreset(p)}
                title={p.badge}
              >
                <span className="sa-preset-dot" style={{ background: p.primary_color }} />
                <span className="sa-preset-dot-accent" style={{ background: p.accent_color }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* REAL-TIME INTERACTIVE PORTAL CANVAS PREVIEW */}
        <div className="sa-portal-canvas-preview" style={{ fontFamily: form.font_family || 'Inter' }}>
          <div className="sa-canvas-top-ribbon" style={{ background: form.primary_color }}>
            <div className="sa-canvas-trust-text">
              <i className="fa-solid fa-shield-cat" /> {form.trust_badge_text || '"" 100% Verified Hotel  Best Rate Guarantee'}
            </div>
            <div className="sa-canvas-top-right">
              <span>₹ INR</span>
              <span>English</span>
              <span><i className="fa-solid fa-headset" /> 24x7 Help</span>
            </div>
          </div>

          <div
            className="sa-canvas-hero-banner"
            style={{
              background: `linear-gradient(135deg, ${form.bg_gradient_from || '#001f5c'}, ${form.bg_gradient_to || '#003580'})`,
            }}
          >
            {previews.banner && (
              <img src={resolveAssetUrl(previews.banner)} alt="" className="sa-canvas-hero-img" />
            )}
            <div className="sa-canvas-hero-content">
              <div className="sa-canvas-hero-title" style={{ color: form.text_on_banner }}>
                {form.banner_headline || 'Book Direct & Save'}
              </div>
              <div className="sa-canvas-hero-sub" style={{ color: form.text_on_banner }}>
                {form.banner_subtext || 'Best rate guarantee & instant booking'}
              </div>
              <button type="button" className="sa-canvas-cta-btn" style={{ background: form.accent_color || '#FF6B00', color: '#ffffff' }}>
                <i className="fa-solid fa-bolt" /> Book Now with Best Offer
              </button>
            </div>
          </div>

          {/* Interactive Mock Search & Room Card inside canvas */}
          <div className="sa-canvas-search-bar">
            <div className="sa-canvas-search-col">
              <span className="lbl">CITY / HOTEL</span>
              <span className="val"><i className="fa-solid fa-location-dot" /> Resort & Spa</span>
            </div>
            <div className="sa-canvas-search-col">
              <span className="lbl">CHECK-IN / OUT</span>
              <span className="val"><i className="fa-solid fa-calendar" /> Today - Tomorrow</span>
            </div>
            <div className="sa-canvas-search-col">
              <span className="lbl">GUESTS</span>
              <span className="val"><i className="fa-solid fa-user-group" /> 2 Adults, 1 Room</span>
            </div>
            <button className="sa-canvas-search-btn" style={{ background: form.primary_color }}>
              <i className="fa-solid fa-magnifying-glass" /> SEARCH
            </button>
          </div>
        </div>

        {/* Section tabs */}
        <div className="sa-theme-section-tabs">
          {sectionTabs.map(t => (
            <button key={t.key} className={`sa-theme-tab ${activeSection === t.key ? 'active' : ''}`}
              onClick={() => setActiveSection(t.key)}>
              <i className={t.icon} style={{ marginRight: 6 }} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="sa-modal-body" style={{ maxHeight:'52vh', overflowY:'auto' }}>

          {activeSection === 'brand' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div className="sa-form-group" style={{ gridColumn:'span 2' }}>
                <label>Theme Name *</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. MakeMyTrip High Trust Navy, Agoda Luxury Resort" />
              </div>

              <div className="sa-form-group">
                <label>Typography / Font Family</label>
                <select value={form.font_family} onChange={e => set('font_family', e.target.value)}>
                  <option value="Inter">Inter (Clean Enterprise Standard)</option>
                  <option value="Plus Jakarta Sans">Plus Jakarta Sans (Modern Agoda Style)</option>
                  <option value="Outfit">Outfit (Vibrant Bold OTA Style)</option>
                  <option value="Playfair Display">Playfair Display (Luxury & Heritage Hotel)</option>
                  <option value="Roboto">Roboto (Google Standard)</option>
                </select>
              </div>

              <div className="sa-form-group">
                <label>Theme Preset ID</label>
                <input type="text" value={form.preset_name} onChange={e => set('preset_name', e.target.value)} placeholder="e.g. mmt_navy, agoda_emerald" />
              </div>

              <div className="sa-form-group" style={{ gridColumn:'span 2' }}>
                <label>Trust & Security Ribbon Copy <span style={{ opacity:.65, fontWeight:400 }}>(Appears at very top of booking portal)</span></label>
                <input
                  type="text"
                  value={form.trust_badge_text}
                  onChange={e => set('trust_badge_text', e.target.value)}
                  placeholder="100% Verified Hotel · Best Price Guarantee · Pay at Hotel Available"
                />
              </div>

              <UploadZone slot="logo" fieldName="logo" formKey="header_logo_url" label="Custom Portal Header Logo / Brand Badge (Optional)" />

              <ColorField label="Primary Color (Buttons, Search)" field="primary_color" />
              <ColorField label="Accent Color (Badges, Highlight CTA)" field="accent_color" />
              <ColorField label="Gradient From (Banner Background)" field="bg_gradient_from" />
              <ColorField label="Gradient To (Banner Background)" field="bg_gradient_to" />
              <ColorField label="Banner Text Color" field="text_on_banner" />
            </div>
          )}

          {activeSection === 'banner' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <UploadZone slot="banner" fieldName="banner" formKey="banner_image_url" label="Top Ribbon Background Image / Artwork" />
              <div className="sa-form-group">
                <label>Ribbon Main Headline</label>
                <input type="text" value={form.banner_headline} onChange={e => set('banner_headline', e.target.value)} placeholder="Book Direct & Save - Best Rate Guarantee" />
              </div>
              <div className="sa-form-group">
                <label>Ribbon Subtext / Offer Details</label>
                <input type="text" value={form.banner_subtext} onChange={e => set('banner_subtext', e.target.value)} placeholder="Instant confirmation with zero booking fees" />
              </div>
            </div>
          )}

          {activeSection === 'left' && (
            <div>
              <div className="sa-theme-panel-hint">
                <i className="fa-solid fa-circle-info" />
                <span>The <strong>Left Promotional Panel</strong> flanks the left side of the booking portal. Use it for festival artwork (Diwali lamps, Pujo, Heritage architecture) and promotional offer links.</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:14 }}>
                <UploadZone slot="left_panel" fieldName="panel" formKey="left_panel_image_url" label="Left Panel Image / Artwork" />
                <div className="sa-form-group">
                  <label>Title Text</label>
                  <input type="text" value={form.left_panel_title} onChange={e => set('left_panel_title', e.target.value)} placeholder="FESTIVE SPECIAL OFFER" />
                </div>
                <div className="sa-form-group">
                  <label>Subtitle / Description</label>
                  <input type="text" value={form.left_panel_subtext} onChange={e => set('left_panel_subtext', e.target.value)} placeholder="Get up to 30% discount on family suites" />
                </div>
                <div className="sa-form-group">
                  <label>CTA Button Text</label>
                  <input type="text" value={form.left_panel_btn_text} onChange={e => set('left_panel_btn_text', e.target.value)} placeholder="Explore Offer" />
                </div>
                <div className="sa-form-group">
                  <label>CTA Link (URL)</label>
                  <input type="text" value={form.left_panel_btn_url} onChange={e => set('left_panel_btn_url', e.target.value)} placeholder="https://" />
                </div>
                <ColorField label="Panel Gradient From" field="left_panel_bg_from" />
                <ColorField label="Panel Gradient To"   field="left_panel_bg_to" />
                <ColorField label="Panel Text Color"    field="left_panel_text_color" />
              </div>
            </div>
          )}

          {activeSection === 'right' && (
            <div>
              <div className="sa-theme-panel-hint">
                <i className="fa-solid fa-circle-info" />
                <span>The <strong>Right Promotional Panel</strong> flanks the right side of the booking portal. Ideal for customer review guarantees, loyalty rewards, or urgent booking incentives.</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:14 }}>
                <UploadZone slot="right_panel" fieldName="panel" formKey="right_panel_image_url" label="Right Panel Image / Artwork" />
                <div className="sa-form-group">
                  <label>Title Text</label>
                  <input type="text" value={form.right_panel_title} onChange={e => set('right_panel_title', e.target.value)} placeholder="100% SECURE BOOKING" />
                </div>
                <div className="sa-form-group">
                  <label>Subtitle / Description</label>
                  <input type="text" value={form.right_panel_subtext} onChange={e => set('right_panel_subtext', e.target.value)} placeholder="Pay at hotel available with instant SMS receipt" />
                </div>
                <div className="sa-form-group">
                  <label>CTA Button Text</label>
                  <input type="text" value={form.right_panel_btn_text} onChange={e => set('right_panel_btn_text', e.target.value)} placeholder="Claim Package" />
                </div>
                <div className="sa-form-group">
                  <label>CTA Link (URL)</label>
                  <input type="text" value={form.right_panel_btn_url} onChange={e => set('right_panel_btn_url', e.target.value)} placeholder="https://" />
                </div>
                <ColorField label="Panel Gradient From" field="right_panel_bg_from" />
                <ColorField label="Panel Gradient To"   field="right_panel_bg_to" />
                <ColorField label="Panel Text Color"    field="right_panel_text_color" />
              </div>
            </div>
          )}

          {activeSection === 'schedule' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div className="sa-form-group">
                <label>Active From Date <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                <input type="date" value={form.active_from} onChange={e => set('active_from', e.target.value)} />
              </div>
              <div className="sa-form-group">
                <label>Active Until Date <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                <input type="date" value={form.active_until} onChange={e => set('active_until', e.target.value)} />
              </div>
              <div className="sa-form-group" style={{ gridColumn:'span 2', display:'flex', alignItems:'center', gap:14, background:'#f8fafc', padding:14, borderRadius:8, border:'1px solid var(--sa-border)' }}>
                <button type="button" className={`sa-toggle ${form.is_active ? 'sa-toggle-on' : 'sa-toggle-off'}`} onClick={() => set('is_active', !form.is_active)}>
                  <span className="sa-toggle-thumb" />
                </button>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--sa-text)' }}>Force Active Theme Now</div>
                  <div style={{ fontSize:12, color:'var(--sa-text-3)', marginTop:2 }}>Activates theme immediately on public booking portal, overriding date schedule.</div>
                </div>
              </div>
              <div className="sa-form-group" style={{ gridColumn:'span 2' }}>
                <label>Internal Notes / Description</label>
                <input type="text" value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Diwali 2026 high trust theme - active across all luxury hotels" />
              </div>
            </div>
          )}

        </div>

        <div className="sa-modal-footer">
          {!isNew && (
            <button className="sa-btn sa-btn-danger" onClick={handleDelete} disabled={deleting} style={{ marginRight:'auto' }}>
              {deleting ? <><i className="fa-solid fa-spinner fa-spin" /> Deleting</> : <><i className="fa-solid fa-trash" /> Delete Theme</>}
            </button>
          )}
          <button className="sa-btn sa-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="sa-btn sa-btn-primary" onClick={handleSave} disabled={saving} style={{ background: form.primary_color || '#003580' }}>
            {saving ? <><i className="fa-solid fa-spinner fa-spin" /> Saving Studio</> : <><i className="fa-solid fa-check" /> {isNew ? 'Create Theme Studio' : 'Save Changes'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function PartnerEditorModal({ partner, api, onClose, onSaved }) {
  const isNew = partner === 'new';
  const [form, setForm] = useState(isNew ? {
    partner_name: '', inventory_url: '', is_active: true
  } : { ...partner });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) {
        await api.post('/api/super-admin/integrations/partners', form);
        toast.success('Partner created successfully');
      } else {
        await api.put(`/api/super-admin/integrations/partners/${partner.id}`, form);
        toast.success('Partner updated successfully');
      }
      onSaved();
    } catch (err) {
      toast.error('Failed to save partner');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? "Add Online Integration Partner" : "Edit Partner"} subtitle="Configure connection settings for Channel Managers" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Partner Name (e.g. BookingHotel) *" value={form.partner_name} onChange={v => setForm({ ...form, partner_name: v })} required disabled={!isNew} />
        <FormField label="Inventory Webhook URL *" value={form.inventory_url} onChange={v => setForm({ ...form, inventory_url: v })} required />
        <div className="sa-form-group" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
          <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} id="partner-active" />
          <label htmlFor="partner-active" style={{ margin: 0, cursor: 'pointer' }}>Partner Connection Active</label>
        </div>
        <div className="sa-modal-footer">
          <button type="button" className="sa-btn sa-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="sa-btn sa-btn-primary" disabled={saving}>
            {saving ? <><i className="fa-solid fa-spinner fa-spin" /> Saving</> : 'Save Partner'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ChannelMappingModal({ partner, api, allHotelsList, onClose }) {
  const [selectedHotel, setSelectedHotel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Data from backend
  const [roomTypes, setRoomTypes] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);

  // Form states
  const [otaHotelCode, setOtaHotelCode] = useState("");
  const [otaUsername, setOtaUsername] = useState("");
  const [otaPassword, setOtaPassword] = useState("");
  const [roomMappings, setRoomMappings] = useState({}); // { roomTypeId: "otaCode" }
  const [rateMappings, setRateMappings] = useState({}); // { planId: "otaCode" }

  useEffect(() => {
    if (!selectedHotel) return;
    const fetchMappingData = async () => {
      setLoading(true);
      try {
        // Fetch resources
        const res1 = await api.get(`/api/super-admin/integrations/mapping-resources/${selectedHotel}`);
        setRoomTypes(res1.data.room_types || []);
        setRatePlans(res1.data.rate_plans || []);

        // Fetch existing mappings
        const res2 = await api.get(`/api/super-admin/integrations/channel-mappings/${selectedHotel}?partner_id=${partner.id}`);
        setOtaHotelCode(res2.data.hotel_mapping?.ota_hotel_code || "");
        setOtaUsername(res2.data.hotel_mapping?.ota_username || "");
        setOtaPassword(res2.data.hotel_mapping?.ota_password || "");
        
        const rMap = {};
        (res2.data.room_mappings || []).forEach(rm => {
          rMap[rm.room_type_id] = rm.ota_room_type_code;
        });
        setRoomMappings(rMap);

        const rtMap = {};
        (res2.data.rate_mappings || []).forEach(rm => {
          rtMap[rm.plan_id] = rm.ota_rate_plan_code;
        });
        setRateMappings(rtMap);

      } catch (err) {
        toast.error("Failed to load mapping data");
      } finally {
        setLoading(false);
      }
    };
    fetchMappingData();
  }, [selectedHotel, partner.id, api]);

  const handleSave = async () => {
    if (!selectedHotel) return;
    setSaving(true);
    try {
      const payload = {
        partner_id: partner.id,
        ota_hotel_code: otaHotelCode,
        ota_username: otaUsername,
        ota_password: otaPassword,
        room_mappings: Object.entries(roomMappings).map(([id, code]) => ({ room_type_id: parseInt(id), ota_room_type_code: code })),
        rate_mappings: Object.entries(rateMappings).map(([id, code]) => ({ plan_id: parseInt(id), ota_rate_plan_code: code }))
      };
      await api.post(`/api/super-admin/integrations/channel-mappings/${selectedHotel}`, payload);
      toast.success("Mappings saved successfully");
      onClose();
    } catch (err) {
      toast.error("Failed to save mappings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Map Codes: ${partner.partner_name}`} subtitle="Link PMS identifiers to the Channel Manager's codes" onClose={onClose}>
      <div className="sa-form-group">
        <label>Select Hotel *</label>
        <select value={selectedHotel} onChange={e => setSelectedHotel(e.target.value)} required>
          <option value="">- Select a Hotel to Map -</option>
          {allHotelsList.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--sa-text-3)' }}>
          <i className="fa-solid fa-spinner fa-spin fa-2x" />
        </div>
      ) : selectedHotel ? (
        <div style={{ marginTop: 24 }}>
          <FormField 
            label={`${partner.partner_name} Hotel Code *`} 
            value={otaHotelCode} 
            onChange={setOtaHotelCode} 
            placeholder="e.g. 137" 
            required 
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField 
              label={`${partner.partner_name} Username *`} 
              value={otaUsername} 
              onChange={setOtaUsername} 
              placeholder="e.g. admin" 
              required 
            />
            <FormField 
              label={`${partner.partner_name} Password`} 
              value={otaPassword} 
              onChange={setOtaPassword} 
              placeholder="Leave blank to keep existing" 
              type="text"
            />
          </div>

          <h4 style={{ marginTop: 24, marginBottom: 12, borderBottom: '1px solid var(--sa-border)', paddingBottom: 8 }}>
            Room Type Mappings
          </h4>
          {roomTypes.length === 0 ? (
            <p style={{ color: 'var(--sa-text-3)', fontSize: 13 }}>No room types configured for this hotel.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {roomTypes.map(rt => (
                <div key={rt.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
                  <div style={{ fontWeight: 500 }}>{rt.name} <span style={{ color: 'var(--sa-text-3)', fontSize: 12 }}>(ID: {rt.id})</span></div>
                  <div className="sa-form-group" style={{ marginBottom: 0 }}>
                    <input 
                      type="text" 
                      placeholder="OTA Room Code (e.g. 1)" 
                      value={roomMappings[rt.id] || ''}
                      onChange={e => setRoomMappings({ ...roomMappings, [rt.id]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <h4 style={{ marginTop: 24, marginBottom: 12, borderBottom: '1px solid var(--sa-border)', paddingBottom: 8 }}>
            Rate Plan Mappings
          </h4>
          {ratePlans.length === 0 ? (
            <p style={{ color: 'var(--sa-text-3)', fontSize: 13 }}>No rate plans configured for this hotel.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ratePlans.map(plan => (
                <div key={plan.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
                  <div style={{ fontWeight: 500 }}>{plan.name} <span style={{ color: 'var(--sa-text-3)', fontSize: 12 }}>(ID: {plan.id} | {plan.meal_plan})</span></div>
                  <div className="sa-form-group" style={{ marginBottom: 0 }}>
                    <input 
                      type="text" 
                      placeholder="OTA Rate Plan Code (e.g. 1)" 
                      value={rateMappings[plan.id] || ''}
                      onChange={e => setRateMappings({ ...rateMappings, [plan.id]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="sa-modal-footer" style={{ marginTop: 32 }}>
            <button className="sa-btn sa-btn-secondary" onClick={onClose}>Cancel</button>
            <button className="sa-btn sa-btn-primary" onClick={handleSave} disabled={saving || !otaHotelCode}>
              {saving ? <><i className="fa-solid fa-spinner fa-spin" /> Saving</> : <><i className="fa-solid fa-check" /> Save Mappings</>}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--sa-text-3)', border: '1px dashed var(--sa-border)', borderRadius: 8, marginTop: 16 }}>
          Select a hotel above to configure mappings
        </div>
      )}
    </Modal>
  );
}

function HotelPlansTab({ hotels, fetchHotels, hotelPage, hotelTotalPages, hotelTotal, setShowUpgradeModal }) {
  return (
    <div className="sa-card">
      <div className="sa-card-head">
        <div>
          <h3><i className="fa-solid fa-hotel" /> Plan Set Up Per Hotel</h3>
          <p style={{ fontSize: 12.5, color: "var(--sa-text-3)", marginTop: 4 }}>
            Assign plans and monitor subscription validity for all registered hotels.
          </p>
        </div>
      </div>
      <div className="sa-table-wrap">
        <table className="sa-table">
          <thead>
            <tr>
              <th>Hotel</th>
              <th>Admin</th>
              <th>Current Tier</th>
              <th>Status</th>
              <th>Start Date</th>
              <th>Expiry Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {hotels.length === 0 && (
              <tr><td colSpan={7} className="sa-empty">No hotels found</td></tr>
            )}
            {hotels.map(h => (
              <tr key={h.id}>
                <td><strong>{h.name}</strong></td>
                <td>
                  <span className="sa-cell-sub"><i className="fa-regular fa-user" style={{ marginRight: 4 }} />{h.admin_name || h.admin_username || "-"}</span>
                </td>
                <td><TierBadge tier={h.subscription_tier} /></td>
                <td><StatusBadge status={h.subscription_status} /></td>
                <td>
                  <span style={{ fontSize: 13, color: "var(--sa-text-2)" }}>
                    {new Date(h.last_payment_date || h.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: 13, color: "var(--sa-text-1)", fontWeight: 500 }}>
                    {h.subscription_end_date ? new Date(h.subscription_end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "Lifetime"}
                  </span>
                </td>
                <td>
                  <button className="sa-btn sa-btn-gold sa-btn-sm" onClick={() => setShowUpgradeModal(h)}>
                    <i className="fa-solid fa-gem" /> Manage Plan
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={hotelPage} totalPages={hotelTotalPages} total={hotelTotal} onPage={fetchHotels} />
    </div>
  );
}

