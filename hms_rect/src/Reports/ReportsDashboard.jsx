import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { getWithAuth } from '../api'
import { REPORT_CARDS } from './reportConfig'
import { defaultDateRange, DATE_PRESETS, formatCurrency, formatNumber } from './reportUtils'
import './ReportsModern.css'

export default function ReportsDashboard() {
  const token = useSelector((s) => s.auth.accesstoken)
  const features = useSelector((s) => s.auth.hotelFeatures)
  const activeHotel = useSelector((s) => s.auth.activeHotel)
  const navigate = useNavigate()
  
  const initial = useMemo(() => defaultDateRange(), [])
  const [filters, setFilters] = useState(initial)
  const [activePreset, setActivePreset] = useState('This Month')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState(null)

  const loadSummary = useCallback(async (customFilters) => {
    if (!token) return
    const active = customFilters || filters
    if (!active.from_date || !active.to_date) return
    setLoading(true)
    try {
      const res = await getWithAuth('/reports/summary', token, { params: active })
      setSummary(res.data?.summary || null)
    } catch (e) {
      console.error('Failed to load reports summary:', e)
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [token, filters])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  const handleApplyPreset = (preset) => {
    setActivePreset(preset.label)
    const range = preset.getRange()
    setFilters(range)
    loadSummary(range)
  }

  const kpis = [
    {
      title: 'Occupancy Rate',
      value: summary?.occupancy_pct != null ? `${summary.occupancy_pct}%` : '0%',
      subtitle: `${summary?.occupied_room_nights || 0} occupied of ${summary?.total_room_nights || 0} nights`,
      icon: 'fa-solid fa-bed',
      tone: 'blue',
      route: '/reports/occupancy',
    },
    {
      title: 'Total Revenue',
      value: formatCurrency(summary?.total_revenue || 0),
      subtitle: 'Realized gross earnings',
      icon: 'fa-solid fa-indian-rupee-sign',
      tone: 'green',
      route: '/reports/revenue',
    },
    {
      title: 'Pending Dues',
      value: formatCurrency(summary?.pending_amount || 0),
      subtitle: 'Uncollected guest balances',
      icon: 'fa-solid fa-clock-rotate-left',
      tone: 'amber',
      route: '/reports/pending-payments',
    },
    {
      title: 'Cancellations',
      value: formatNumber(summary?.cancelled_bookings || 0),
      subtitle: 'Cancelled reservations',
      icon: 'fa-solid fa-ban',
      tone: 'red',
      route: '/reports/cancellation',
    },
  ]

  return (
    <div className="hms-reports-container">
      {/* ── Top Header ── */}
      <div className="hms-reports-header">
        <div className="hms-header-left">
          <div className="hms-header-icon-box">
            <i className="fa-solid fa-chart-pie"></i>
          </div>
          <div>
            <div className="hms-breadcrumb">
              <span>Hotel Management</span>
              <i className="fa-solid fa-angle-right"></i>
              <span className="active">Reports Center</span>
            </div>
            <h1 className="hms-header-title">Executive Performance & Reports</h1>
            <p className="hms-header-subtitle">
              Financial auditing, room night occupancy, and ledger analytics for <strong>{activeHotel?.name || 'Active Property'}</strong>.
            </p>
          </div>
        </div>

        <div className="hms-header-badge">
          <span className="live-dot"></span>
          <span>Live Data Feed</span>
        </div>
      </div>

      {/* ── Date Filter Bar ── */}
      <div className="hms-filter-card">
        <div className="hms-filter-left">
          <span className="hms-filter-caption"><i className="fa-regular fa-calendar" style={{ marginRight: '6px' }}></i> Period:</span>
          <div className="hms-preset-pills">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`hms-pill-btn ${activePreset === p.label ? 'active' : ''}`}
                onClick={() => handleApplyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <form
          className="hms-date-form"
          onSubmit={(e) => {
            e.preventDefault()
            setActivePreset('Custom')
            loadSummary()
          }}
        >
          <div className="hms-input-item">
            <label>From</label>
            <input
              type="date"
              value={filters.from_date}
              onChange={(e) => {
                setActivePreset('Custom')
                setFilters((prev) => ({ ...prev, from_date: e.target.value }))
              }}
              required
            />
          </div>
          <div className="hms-input-item">
            <label>To</label>
            <input
              type="date"
              value={filters.to_date}
              onChange={(e) => {
                setActivePreset('Custom')
                setFilters((prev) => ({ ...prev, to_date: e.target.value }))
              }}
              required
            />
          </div>
          <button type="submit" className="hms-btn-filter" disabled={loading}>
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-magnifying-glass"></i>}
            <span>Filter</span>
          </button>
        </form>
      </div>

      {/* ── KPI Row ── */}
      <div className="hms-kpi-grid">
        {kpis.map((kpi) => (
          <div
            key={kpi.title}
            className={`hms-kpi-card tone-${kpi.tone}`}
            onClick={() => navigate(`${kpi.route}?from_date=${filters.from_date}&to_date=${filters.to_date}`)}
          >
            <div className="hms-kpi-header">
              <span className="hms-kpi-title">{kpi.title}</span>
              <div className="hms-kpi-icon">
                <i className={kpi.icon}></i>
              </div>
            </div>
            <div className="hms-kpi-val">{loading ? '-' : kpi.value}</div>
            <div className="hms-kpi-sub">{kpi.subtitle}</div>
          </div>
        ))}
      </div>

      {/* ── Reports Modules Section ── */}
      <div className="hms-section-title-wrap">
        <h2>Report Categories & Detailed Ledgers</h2>
        <p>Click any report module below to view interactive trend graphs, breakdown statistics, and exportable ledger tables.</p>
      </div>

      {features && features.reports === false ? (
        <div className="hms-upgrade-banner">
          <div className="hms-upgrade-icon">
            <i className="fa-solid fa-lock"></i>
          </div>
          <h3>Advanced Analytics Locked</h3>
          <p>Reports are not enabled on your current subscription plan. Contact your property administrator to upgrade.</p>
        </div>
      ) : (
        <div className="hms-modules-grid">
          {REPORT_CARDS.map((item) => (
            <div
              key={item.key}
              className="hms-module-card"
              onClick={() => navigate(`/reports/${item.key}?from_date=${filters.from_date}&to_date=${filters.to_date}`)}
            >
              <div className="hms-module-top">
                <div className="hms-module-icon-wrap" style={{ backgroundColor: `${item.color}15`, color: item.color }}>
                  <i className={item.icon}></i>
                </div>
                <span className="hms-module-tag">{item.category}</span>
              </div>
              <h3 className="hms-module-name">{item.title}</h3>
              <p className="hms-module-info">{item.subtitle}</p>

              <div className="hms-module-bottom">
                <span className="hms-module-action">
                  View Report <i className="fa-solid fa-arrow-right"></i>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
