import React, { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useNavigate } from "react-router-dom"
import Swal from "sweetalert2"
import { getWithAuth } from "../api"
import { formatCurrency, formatNumber, toLabel } from "../Reports/reportUtils"
import "../Reports/ReportsModern.css"

function renderValue(key, value) {
  if (typeof value !== 'number') return value ?? '-'
  if (/amount|revenue|refund|tax|spend|due|pending|outstanding|price/i.test(key)) return formatCurrency(value)
  if (/pct|percent|occupancy/i.test(key)) return `${formatNumber(value)}%`
  return formatNumber(value)
}

function ReportOverviewPage() {
  const token = useSelector((state) => state.auth.accesstoken)
  const activeHotel = useSelector((state) => state.auth.activeHotel)
  const navigate = useNavigate()
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await getWithAuth('reports/overview', token)
        const result = res?.data
        if (!result?.status) {
          Swal.fire({ title: "Warning", text: result?.error || "Unable to load report", icon: "warning" })
          return
        }
        setData(result.data || {})
      } catch {
        Swal.fire({ title: "Oops!", text: "Unable to load report overview", icon: "error" })
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      load()
    }
  }, [token])

  const entries = Object.entries(data).filter(([k]) => k !== 'from_date' && k !== 'to_date')

  return (
    <div className="reports-page-wrapper">
      {/* ── Enterprise OTA Top Header ── */}
      <div className="reports-top-hero">
        <div className="reports-hero-left">
          <div className="reports-hero-icon-box">
            <i className="fa-solid fa-gauge-high"></i>
          </div>
          <div>
            <div className="reports-hero-breadcrumb">
              <span onClick={() => navigate('/reports')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                Reports
              </span>
              <i className="fa-solid fa-chevron-right"></i>
              <span className="current">Month-to-Date Overview</span>
            </div>
            <h1 className="reports-hero-title">Operational Snapshot</h1>
            <p className="reports-hero-subtitle">
              Current month overview for {activeHotel?.name || 'your hotel'} (Period: {data.from_date || '-'} to {data.to_date || '-'}).
            </p>
          </div>
        </div>

        <div className="reports-hero-actions">
          <button
            type="button"
            className="reports-btn-primary"
            onClick={() => navigate('/reports')}
          >
            <i className="fa-solid fa-chart-pie"></i> Detailed Reports Hub
          </button>
        </div>
      </div>

      {/* ── KPI Metric Cards ── */}
      {loading ? (
        <div className="reports-table-card" style={{ padding: '60px', textAlign: 'center' }}>
          <div className="reports-table-loader">
            <i className="fa-solid fa-spinner fa-spin"></i>
            <span>Loading overview metrics…</span>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="reports-table-card" style={{ padding: '60px', textAlign: 'center' }}>
          <div className="reports-empty-state">
            <div className="reports-empty-icon">
              <i className="fa-regular fa-folder-open"></i>
            </div>
            <h4>No Overview Data</h4>
            <p>No operational transactions recorded for the current month.</p>
          </div>
        </div>
      ) : (
        <div className="reports-kpi-grid">
          {entries.map(([key, value]) => (
            <div className="reports-kpi-card tone-blue" key={key}>
              <div className="reports-kpi-top">
                <div className="reports-kpi-icon-wrap">
                  <i className="fa-solid fa-chart-simple"></i>
                </div>
              </div>
              <div className="reports-kpi-label">{toLabel(key)}</div>
              <div className="reports-kpi-value">{renderValue(key, value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ReportOverviewPage
