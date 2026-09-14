import React, { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { getWithAuth, postWithAuth } from '../api'
import toast from 'react-hot-toast'
import './SeasonalPricing.css'

const TODAY = new Date().toISOString().slice(0, 10)
const NEXT30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

export default function SeasonalPricingPage() {
    const token = useSelector(s => s.auth.accesstoken)
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [meta, setMeta] = useState({ occasion: '', reason: '', valid_from: TODAY, valid_to: NEXT30 })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await getWithAuth('/settings/pricing', token)
            const items = Array.isArray(res?.data?.items) ? res.data.items : []
            setRows(items.map(it => ({
                room_type: typeof it.room_type === 'object' ? (it.room_type?.name || '') : String(it.room_type || ''),
                count: it.count || 0,
                avg_price: Number(it.avg_price || 0),
                current_pct: Number(it.current_adjustment_percent || 0),
                valid_from: it.current_valid_from || '',
                valid_to: it.current_valid_to || '',
                new_pct: '',
            })))
        } catch {
            toast.error('Failed to load pricing data')
        } finally {
            setLoading(false)
        }
    }, [token])

    useEffect(() => { load() }, [load])

    const applyRule = async (row) => {
        const pct = Number(row.new_pct)
        if (isNaN(pct) || pct < -100 || pct > 500) {
            toast.error('Adjustment must be between -100% and +500%')
            return
        }
        if (!meta.valid_from || !meta.valid_to) {
            toast.error('Valid From and Valid To are required')
            return
        }
        if (meta.valid_from > meta.valid_to) {
            toast.error('Valid From must be before Valid To')
            return
        }
        setSaving(true)
        try {
            await postWithAuth('/settings/pricing/adjust', {
                adjustments: [{ room_type: row.room_type, percentage: pct }],
                valid_from: meta.valid_from,
                valid_to: meta.valid_to,
                occasion: meta.occasion,
                reason: meta.reason || `Seasonal rule for ${row.room_type}`,
            }, token)
            toast.success(`Rule applied for ${row.room_type}`)
            await load()
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to apply rule')
        } finally {
            setSaving(false)
        }
    }

    const resetRule = async (row) => {
        if (row.current_pct === 0) { toast.success('No active rule to reset'); return }
        setSaving(true)
        try {
            await postWithAuth('/settings/pricing/adjust', {
                adjustments: [{ room_type: row.room_type, percentage: 0 }],
                valid_from: meta.valid_from || TODAY,
                valid_to: meta.valid_to || TODAY,
                reason: `Reset rule for ${row.room_type}`,
            }, token)
            toast.success(`Rule reset for ${row.room_type}`)
            await load()
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to reset rule')
        } finally {
            setSaving(false)
        }
    }

    const resetAll = async () => {
        const active = rows.filter(r => r.current_pct !== 0)
        if (!active.length) { toast.success('No active rules to reset'); return }
        setSaving(true)
        try {
            await postWithAuth('/settings/pricing/adjust', {
                adjustments: active.map(r => ({ room_type: r.room_type, percentage: 0 })),
                valid_from: meta.valid_from || TODAY,
                valid_to: meta.valid_to || TODAY,
                reason: 'Reset all active pricing rules',
            }, token)
            toast.success('All active rules reset')
            await load()
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to reset rules')
        } finally {
            setSaving(false)
        }
    }

    const activeCount = rows.filter(r => r.current_pct !== 0).length

    return (
        <>
            <section className="content-header">
                <div className="header-icon"><i className="fa fa-tags"></i></div>
                <div className="header-title">
                    <h1>Seasonal Pricing</h1>
                    <small>Set time-bound price adjustments per room type</small>
                </div>
            </section>

            <section className="content">
                {/* Info banner */}
                <div className="sp-info-banner">
                    <i className="fa fa-info-circle" />
                    <span>
                        Seasonal pricing lets you increase or decrease room prices for specific date ranges.
                        For example, set <strong>+30%</strong> for Diwali week or <strong>-15%</strong> for off-season.
                        These rules apply automatically when guests book rooms for those dates.
                    </span>
                </div>

                {/* Stats row */}
                <div className="sp-stats-row">
                    <div className="sp-stat-card">
                        <span className="sp-stat-label">Room Types</span>
                        <span className="sp-stat-value">{rows.length}</span>
                    </div>
                    <div className="sp-stat-card sp-stat-active">
                        <span className="sp-stat-label">Active Rules</span>
                        <span className="sp-stat-value">{activeCount}</span>
                    </div>
                    <div className="sp-stat-card">
                        <span className="sp-stat-label">No Rule</span>
                        <span className="sp-stat-value">{rows.length - activeCount}</span>
                    </div>
                </div>

                {/* Date range & meta */}
                <div className="panel panel-bd sp-meta-panel">
                    <div className="panel-heading">
                        <h4 className="panel-title">
                            <i className="fa fa-calendar" style={{ marginRight: 8 }} />
                            Rule Configuration
                        </h4>
                    </div>
                    <div className="panel-body">
                        <div className="sp-meta-grid">
                            <div className="sp-meta-field">
                                <label>Occasion <span className="text-muted">(optional)</span></label>
                                <input className="form-control" value={meta.occasion} onChange={e => setMeta(m => ({ ...m, occasion: e.target.value }))} placeholder="e.g. Diwali, New Year, Summer Peak" />
                            </div>
                            <div className="sp-meta-field">
                                <label>Reason <span className="text-muted">(optional)</span></label>
                                <input className="form-control" value={meta.reason} onChange={e => setMeta(m => ({ ...m, reason: e.target.value }))} placeholder="e.g. High seasonal demand" />
                            </div>
                            <div className="sp-meta-field">
                                <label>Valid From <span className="text-danger">*</span></label>
                                <input className="form-control" type="date" value={meta.valid_from} onChange={e => setMeta(m => ({ ...m, valid_from: e.target.value }))} />
                            </div>
                            <div className="sp-meta-field">
                                <label>Valid To <span className="text-danger">*</span></label>
                                <input className="form-control" type="date" value={meta.valid_to} onChange={e => setMeta(m => ({ ...m, valid_to: e.target.value }))} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Room types table */}
                <div className="panel panel-bd">
                    <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 className="panel-title">
                            <i className="fa fa-bed" style={{ marginRight: 8 }} />
                            Room Type Adjustments
                        </h4>
                        {activeCount > 0 && (
                            <button className="btn btn-danger btn-sm" disabled={saving} onClick={resetAll}>
                                <i className="fa fa-times" /> Reset All Active Rules
                            </button>
                        )}
                    </div>
                    <div className="panel-body">
                        {loading ? (
                            <div className="text-center" style={{ padding: 40, color: '#888' }}>
                                <i className="fa fa-spinner fa-spin" style={{ fontSize: 24 }} />
                                <p style={{ marginTop: 12 }}>Loading room types...</p>
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="sp-empty">
                                <i className="fa fa-bed" />
                                <p>No room types found. Add rooms to your hotel first.</p>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-bordered table-hover sp-table">
                                    <thead>
                                        <tr>
                                            <th>Room Type</th>
                                            <th>Rooms</th>
                                            <th>Base Price (Avg)</th>
                                            <th>Current Rule</th>
                                            <th>Adjusted Price</th>
                                            <th>New Adjustment %</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, idx) => {
                                            const hasRule = row.current_pct !== 0
                                            const adjustedPrice = row.avg_price * (1 + row.current_pct / 100)
                                            return (
                                                <tr key={typeof row.room_type === 'object' ? row.room_type?.name : (row.room_type || idx)} className={hasRule ? 'sp-row-active' : ''}>
                                                    <td><strong>{typeof row.room_type === 'object' ? (row.room_type?.name || '-') : (row.room_type || '-')}</strong></td>
                                                    <td>{row.count}</td>
                                                    <td>₹{row.avg_price.toFixed(0)}</td>
                                                    <td>
                                                        {hasRule ? (
                                                            <div>
                                                                <span className={`sp-rule-badge ${row.current_pct > 0 ? 'sp-rule-up' : 'sp-rule-down'}`}>
                                                                    {row.current_pct > 0 ? '+' : ''}{row.current_pct.toFixed(1)}%
                                                                </span>
                                                                {row.valid_from && (
                                                                    <div className="sp-rule-dates">{row.valid_from} → {row.valid_to}</div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted">No rule</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {hasRule ? (
                                                            <strong style={{ color: row.current_pct > 0 ? '#27ae60' : '#e74c3c' }}>
                                                                ₹{adjustedPrice.toFixed(0)}
                                                            </strong>
                                                        ) : (
                                                            <span className="text-muted">₹{row.avg_price.toFixed(0)}</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className="input-group" style={{ maxWidth: 160 }}>
                                                            <span className="input-group-addon">%</span>
                                                            <input
                                                                className="form-control"
                                                                type="number"
                                                                min="-100"
                                                                max="500"
                                                                step="1"
                                                                value={row.new_pct}
                                                                placeholder="e.g. +30 or -15"
                                                                onChange={e => setRows(prev => prev.map((x, i) => i === idx ? { ...x, new_pct: e.target.value } : x))}
                                                            />
                                                        </div>
                                                        {row.new_pct !== '' && !isNaN(Number(row.new_pct)) && row.avg_price > 0 && (
                                                            <small className="text-muted">
                                                                → ₹{(row.avg_price * (1 + Number(row.new_pct) / 100)).toFixed(0)}/night
                                                            </small>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                            <button
                                                                className="btn btn-success btn-sm"
                                                                disabled={saving || row.new_pct === ''}
                                                                onClick={() => applyRule(row)}
                                                                title="Apply this adjustment"
                                                            >
                                                                <i className="fa fa-check" /> Apply
                                                            </button>
                                                            {hasRule && (
                                                                <button
                                                                    className="btn btn-default btn-sm"
                                                                    disabled={saving}
                                                                    onClick={() => resetRule(row)}
                                                                    title="Remove active rule"
                                                                >
                                                                    <i className="fa fa-times" /> Reset
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* How it works */}
                <div className="panel panel-bd sp-howto-panel">
                    <div className="panel-heading">
                        <h4 className="panel-title"><i className="fa fa-question-circle" style={{ marginRight: 8 }} />How It Works</h4>
                    </div>
                    <div className="panel-body">
                        <div className="sp-howto-grid">
                            <div className="sp-howto-step">
                                <span className="sp-step-num">1</span>
                                <div>
                                    <strong>Set Date Range</strong>
                                    <p>Choose the period when the adjusted price should apply (e.g. Oct 20 - Nov 5 for Diwali).</p>
                                </div>
                            </div>
                            <div className="sp-howto-step">
                                <span className="sp-step-num">2</span>
                                <div>
                                    <strong>Enter Adjustment %</strong>
                                    <p>Use <code>+30</code> to increase by 30% or <code>-15</code> to decrease by 15%.</p>
                                </div>
                            </div>
                            <div className="sp-howto-step">
                                <span className="sp-step-num">3</span>
                                <div>
                                    <strong>Click Apply</strong>
                                    <p>The rule activates immediately. New bookings for those dates will use the adjusted price.</p>
                                </div>
                            </div>
                            <div className="sp-howto-step">
                                <span className="sp-step-num">4</span>
                                <div>
                                    <strong>Reset Anytime</strong>
                                    <p>Click Reset to remove the rule and return to the base price.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    )
}
