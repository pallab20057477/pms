import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createApiClient } from '../api';
import './HotelPlanPage.css';

const FEATURES = [
    { key: 'feature_online_payment', label: 'Online Payment', desc: 'Razorpay payment gateway for guests', icon: '💳' },
    { key: 'feature_reports', label: 'Reports & Analytics', desc: 'Revenue, occupancy and booking reports', icon: '📊' },
    { key: 'feature_staff_payroll', label: 'Staff Payroll', desc: 'Salary management and payroll processing', icon: '👥' },
    { key: 'feature_housekeeping', label: 'Housekeeping', desc: 'Room cleaning and housekeeping management', icon: '🧹' },
    { key: 'feature_email_notify', label: 'Email Notifications', desc: 'Automated booking confirmations to guests', icon: '📧' },
    { key: 'feature_seasonal_pricing', label: 'Seasonal Pricing', desc: 'Time-bound price adjustments per room type', icon: '🏷️' },
];

const PLANS = [
    {
        key: 'free',
        label: 'Free',
        color: '#06b6d4',
        price: '₹0',
        period: 'forever',
        booking_limit: 5,
        features: { feature_reports: true, feature_housekeeping: true },
        description: 'Basic hotel management for small properties',
    },
    {
        key: 'premium',
        label: 'Premium',
        color: '#f59e0b',
        price: '₹2,999',
        period: 'per month',
        booking_limit: 0,
        features: {
            feature_online_payment: true,
            feature_reports: true,
            feature_staff_payroll: true,
            feature_housekeeping: true,
            feature_email_notify: true,
            feature_seasonal_pricing: true,
        },
        description: 'Full-featured solution for growing hotels',
    },
];

export default function HotelPlanPage() {
    const token = useSelector(s => s.auth.accesstoken);
    const { hotel_id } = useParams();
    const navigate = useNavigate();

    const api = useMemo(() => createApiClient(token), [token]);

    const [hotel, setHotel] = useState(null);
    const [features, setFeatures] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [durationMonths, setDurationMonths] = useState(1);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [hotelRes, featRes] = await Promise.all([
                api.get(`/api/super-admin/hotels?page=1&page_size=100&_t=${Date.now()}`),
                api.get(`/api/super-admin/hotels/${hotel_id}/features?_t=${Date.now()}`),
            ]);
            const hotelData = (hotelRes.data.data || []).find(h => h.id === Number(hotel_id));
            setHotel(hotelData);
            setFeatures(featRes.data);
        } catch {
            toast.error('Failed to load hotel data');
        } finally {
            setLoading(false);
        }
    }, [hotel_id, token]);

    useEffect(() => { load(); }, [load]);

    const applyPlan = async (plan) => {
        setSaving(true);
        try {
            await api.put(`/api/super-admin/hotels/${hotel_id}/subscription`, {
                tier: plan.key,
                reason: `Applied ${plan.label} plan`,
                duration_months: Number(durationMonths),
            });
            const featurePayload = {};
            FEATURES.forEach(f => { featurePayload[f.key] = plan.features[f.key] ?? false; });
            await api.put(`/api/super-admin/hotels/${hotel_id}/features`, featurePayload);
            toast.success(`${plan.label} plan applied`);
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to apply plan');
        } finally {
            setSaving(false);
        }
    };

    const saveCustom = async () => {
        setSaving(true);
        try {
            await api.put(`/api/super-admin/hotels/${hotel_id}/features`, features);
            toast.success('Custom settings saved');
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const toggleFeature = (key) => setFeatures(f => ({ ...f, [key]: !f[key] }));

    if (loading) return (
        <div className="hp-loading">
            <div className="hp-spinner" />
            <span>Loading...</span>
        </div>
    );

    const currentPlan = PLANS.find(p => p.key === hotel?.subscription_tier) || PLANS[0];

    return (
        <div className="hp-wrap">
            <header className="hp-header">
                <button className="hp-back" onClick={() => navigate('/super-admin/dashboard')}>← Back</button>
                <div className="hp-header-info">
                    <h1>{hotel?.name || 'Hotel'}</h1>
                    <p>Plan & Feature Management · Admin: {hotel?.admin_name}</p>
                </div>
                <span className={`hp-current-plan hp-plan-${hotel?.subscription_tier || 'free'}`}>
                    {currentPlan.label} Plan
                    {hotel?.subscription_end_date && 
                        <span style={{fontSize: '12px', marginLeft: '10px', opacity: 0.8}}>
                            (Expires: {new Date(hotel.subscription_end_date).toLocaleDateString()})
                        </span>
                    }
                </span>
            </header>

            <div className="hp-body">
                {/* Plan Cards */}
                <section className="hp-section">
                    <h2 className="hp-section-title">Choose Plan</h2>
                    <div className="hp-plans">
                        {PLANS.map(plan => (
                            <div key={plan.key} className={`hp-plan-card ${hotel?.subscription_tier === plan.key ? 'hp-plan-active' : ''}`}>
                                <div className="hp-plan-header" style={{ borderColor: plan.color }}>
                                    <div>
                                        <h3 style={{ color: plan.color }}>{plan.label}</h3>
                                        <p>{plan.description}</p>
                                    </div>
                                    <div className="hp-plan-price">
                                        <span className="hp-price-amount">{plan.price}</span>
                                        <span className="hp-price-period">{plan.period}</span>
                                    </div>
                                    <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
                                        <label style={{ fontSize: '14px', color: '#666' }}>Plan Duration:</label>
                                        <select 
                                            value={durationMonths}
                                            onChange={(e) => setDurationMonths(e.target.value)}
                                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                                        >
                                            <option value={1}>1 Month</option>
                                            <option value={6}>6 Months</option>
                                            <option value={12}>1 Year</option>
                                            <option value={-1}>Lifetime (No Expiry)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="hp-plan-features">
                                    <div className="hp-plan-limit">
                                        <span>📅 Bookings/day:</span>
                                        <strong>{plan.booking_limit === 0 ? 'Unlimited' : plan.booking_limit}</strong>
                                    </div>
                                    {FEATURES.map(f => (
                                        <div key={f.key} className={`hp-plan-feature ${plan.features[f.key] ? 'included' : 'excluded'}`}>
                                            <span>{plan.features[f.key] ? '✓' : '✗'}</span>
                                            <span>{f.label}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    className="hp-apply-btn"
                                    style={{ background: plan.color }}
                                    disabled={saving || hotel?.subscription_tier === plan.key}
                                    onClick={() => applyPlan(plan)}
                                >
                                    {hotel?.subscription_tier === plan.key ? 'Current Plan' : `Apply ${plan.label}`}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Custom Feature Control */}
                <section className="hp-section">
                    <h2 className="hp-section-title">Custom Feature Control</h2>
                    <p className="hp-section-sub">Override individual features regardless of plan</p>
                    <div className="hp-features-grid">
                        {FEATURES.map(f => (
                            <div key={f.key} className={`hp-feature-card ${features[f.key] ? 'hp-feat-on' : 'hp-feat-off'}`}>
                                <div className="hp-feat-icon">{f.icon}</div>
                                <div className="hp-feat-info">
                                    <strong>{f.label}</strong>
                                    <span>{f.desc}</span>
                                </div>
                                <button className={`hp-toggle ${features[f.key] ? 'on' : 'off'}`} onClick={() => toggleFeature(f.key)}>
                                    <span className="hp-toggle-thumb" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button className="hp-save-btn" disabled={saving} onClick={saveCustom}>
                        {saving ? 'Saving...' : 'Save Custom Settings'}
                    </button>
                </section>

                {/* Status */}
                <section className="hp-section">
                    <h2 className="hp-section-title">Hotel Status</h2>
                    <div className="hp-status-row">
                        <div className="hp-status-info">
                            <span className={`hp-status-badge ${hotel?.subscription_status}`}>{hotel?.subscription_status}</span>
                            <span className="hp-status-desc">
                                {hotel?.subscription_status === 'active' ? 'Hotel is active and can create bookings' : 'Hotel is suspended'}
                            </span>
                        </div>
                        <div className="hp-status-actions">
                            {hotel?.subscription_status === 'active' ? (
                                <button className="hp-btn hp-btn-danger" disabled={saving} onClick={async () => {
                                    setSaving(true);
                                    try { await api.put(`/api/super-admin/hotels/${hotel_id}/suspend`, { reason: 'Suspended by super admin' }); toast.success('Hotel suspended'); await load(); }
                                    catch { toast.error('Failed'); }
                                    setSaving(false);
                                }}>Suspend Hotel</button>
                            ) : (
                                <button className="hp-btn hp-btn-success" disabled={saving} onClick={async () => {
                                    setSaving(true);
                                    try { await api.put(`/api/super-admin/hotels/${hotel_id}/activate`, { reason: 'Activated by super admin' }); toast.success('Hotel activated'); await load(); }
                                    catch { toast.error('Failed'); }
                                    setSaving(false);
                                }}>Activate Hotel</button>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
