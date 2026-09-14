import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Bar, Line, Pie } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { getWithAuth } from '../api'
import { getReportType } from './reportConfig'
import { defaultDateRange, DATE_PRESETS, downloadCSV, downloadXLSX, formatCurrency, formatNumber, toLabel } from './reportUtils'
import './ReportsModern.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler)

function renderMetric(key, value) {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value !== 'number') return String(value)
  if (/amount|revenue|refund|tax|spend|due|pending|outstanding|rate|price/i.test(key)) return formatCurrency(value)
  if (/pct|percent|occupancy/i.test(key)) return `${formatNumber(value)}%`
  return formatNumber(value)
}

function getBadgeClass(key, value) {
  if (/status/i.test(key)) {
    const val = String(value).toLowerCase()
    if (val === 'confirmed' || val === 'checked_in' || val === 'active' || val === 'success' || val === 'paid') return 'status-badge-success'
    if (val === 'cancelled' || val === 'suspended' || val === 'failed') return 'status-badge-danger'
    if (val === 'reserved' || val === 'pending' || val === 'partial') return 'status-badge-warning'
    return 'status-badge-neutral'
  }
  return ''
}

export default function ReportsDetail() {
  const token = useSelector((s) => s.auth.accesstoken)
  const navigate = useNavigate()
  const { type } = useParams()
  const report = getReportType(type)
  const [params, setParams] = useSearchParams()
  const fallbackRange = useMemo(() => defaultDateRange(), [])

  const [filters, setFilters] = useState({
    from_date: params.get('from_date') || fallbackRange.from_date,
    to_date: params.get('to_date') || fallbackRange.to_date,
    room_type: params.get('room_type') || '',
    guest_type: params.get('guest_type') || '',
  })

  const [activePreset, setActivePreset] = useState('Custom')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const loadReport = useCallback(async (overrideFilters) => {
    if (!token) return
    const active = overrideFilters || filters
    if (!active.from_date || !active.to_date) return
    setLoading(true)
    try {
      const reqParams = {
        from_date: active.from_date,
        to_date: active.to_date,
      }
      if (active.room_type) reqParams.room_type = active.room_type
      if (active.guest_type) reqParams.guest_type = active.guest_type
      const res = await getWithAuth(report.endpoint, token, { params: reqParams })
      setData(res.data || null)
      setParams(reqParams)
    } catch (e) {
      console.error('Failed to load report data:', e)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [token, filters, report.endpoint, setParams])

  useEffect(() => {
    loadReport()
  }, [loadReport, type])

  const handleApplyPreset = (preset) => {
    setActivePreset(preset.label)
    const range = preset.getRange()
    const updated = { ...filters, ...range }
    setFilters(updated)
    loadReport(updated)
  }

  const summaryEntries = Object.entries(data?.summary || {})
  const tableRows = data?.table || []

  // Filtered rows based on live search
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return tableRows
    const term = searchTerm.toLowerCase()
    return tableRows.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(term)
      )
    )
  }, [tableRows, searchTerm])

  useEffect(() => {
    setPage(1)
  }, [filteredRows.length, pageSize, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  const hiddenColumns = type === 'room-revenue' ? ['room_id'] : []
  const visibleKeys = tableRows.length > 0
    ? Object.keys(tableRows[0]).filter((k) => !hiddenColumns.includes(k))
    : []

  const linePoints = data?.charts?.daily_trend || []
  const lineData = {
    labels: linePoints.map((d) => d.date),
    datasets: [{
      label: type === 'occupancy' ? 'Occupancy Rate (%)' : 'Amount (₹)',
      data: linePoints.map((d) => d.occupancy ?? d.amount ?? d.occupied ?? 0),
      borderColor: '#006CE4',
      backgroundColor: 'rgba(0, 108, 228, 0.08)',
      pointBackgroundColor: '#006CE4',
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: true,
      tension: 0.3,
    }],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F172A',
        padding: 12,
        titleFont: { size: 12, weight: '700' },
        bodyFont: { size: 12 },
        cornerRadius: 6,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || ''
            if (label) label += ': '
            if (context.parsed.y !== null) {
              if (type === 'occupancy') {
                label += context.parsed.y + '%'
              } else {
                label += '₹ ' + Number(context.parsed.y).toLocaleString('en-IN')
              }
            }
            return label
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#64748B' }
      },
      y: {
        grid: { color: '#F1F5F9' },
        ticks: {
          font: { size: 11 },
          color: '#64748B',
          callback: function(value) {
            if (type === 'occupancy') return value + '%'
            if (value >= 1000) return '₹' + (value / 1000).toFixed(0) + 'k'
            return '₹' + value
          }
        }
      }
    }
  }

  const breakdown = data?.charts?.breakdown || []
  const barData = {
    labels: breakdown.map((d) => d.label),
    datasets: [{
      label: 'Amount (₹)',
      data: breakdown.map((d) => d.value),
      backgroundColor: ['#006CE4', '#008234', '#E05600', '#475569'],
      borderRadius: 4,
    }],
  }

  const pieRows = data?.charts?.reasons || data?.charts?.segments || []
  const pieData = {
    labels: pieRows.map((d) => d.label),
    datasets: [{
      data: pieRows.map((d) => d.value),
      backgroundColor: ['#D92D20', '#E05600', '#008234', '#006CE4', '#4F46E5'],
      borderWidth: 2,
      borderColor: '#ffffff',
    }],
  }

  const printTable = () => {
    const tableEl = document.querySelector('.hms-table')
    if (!tableEl) return
    const printWindow = window.open('', '_blank', 'width=1100,height=800')
    if (!printWindow) return

    const styles = `
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 24px; color: #0F172A; }
        h2 { margin: 0 0 4px; color: #003580; font-size: 20px; }
        p { margin: 0 0 16px; color: #64748B; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #E2E8F0; padding: 10px 12px; font-size: 12px; text-align: left; }
        th { background: #F8FAFC; text-transform: uppercase; color: #475569; font-weight: 700; font-size: 11px; }
        tr:nth-child(even) { background-color: #F8FAFC; }
      </style>
    `

    printWindow.document.write(`
      <html>
        <head><title>${report.title}</title>${styles}</head>
        <body>
          <h2>${report.title}</h2>
          <p>Period: ${filters.from_date} to ${filters.to_date} | Total Records: ${filteredRows.length}</p>
          ${tableEl.outerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 150)
  }

  return (
    <div className="hms-reports-container">
      {/* ── Top Header ── */}
      <div className="hms-reports-header">
        <div className="hms-header-left">
          <div className="hms-header-icon-box" style={{ backgroundColor: `${report.color}15`, color: report.color }}>
            <i className={report.icon}></i>
          </div>
          <div>
            <div className="hms-breadcrumb">
              <span onClick={() => navigate('/reports')} style={{ cursor: 'pointer' }}>
                Reports Hub
              </span>
              <i className="fa-solid fa-angle-right"></i>
              <span className="active">{report.title}</span>
            </div>
            <h1 className="hms-header-title">{report.title}</h1>
            <p className="hms-header-subtitle">{report.subtitle}</p>
          </div>
        </div>

        <div className="hms-header-actions">
          <button
            type="button"
            className="hms-btn-secondary"
            onClick={() => navigate('/reports')}
          >
            <i className="fa-solid fa-arrow-left"></i> All Reports
          </button>
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
            loadReport()
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

          {type === 'room-revenue' && (
            <div className="hms-input-item">
              <label>Room Category</label>
              <input
                type="text"
                placeholder="All categories"
                value={filters.room_type}
                onChange={(e) => {
                  setActivePreset('Custom')
                  setFilters((prev) => ({ ...prev, room_type: e.target.value }))
                }}
              />
            </div>
          )}

          {type === 'guest-history' && (
            <div className="hms-input-item">
              <label>Guest Type</label>
              <select
                value={filters.guest_type}
                onChange={(e) => {
                  setActivePreset('Custom')
                  setFilters((prev) => ({ ...prev, guest_type: e.target.value }))
                }}
              >
                <option value="">All Guests</option>
                <option value="new">First-Time Guests</option>
                <option value="returning">Repeat Guests</option>
              </select>
            </div>
          )}

          <button type="submit" className="hms-btn-filter" disabled={loading}>
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-arrows-rotate"></i>}
            <span>Update</span>
          </button>
        </form>
      </div>

      {/* ── Summary Key Metrics Row ── */}
      {summaryEntries.length > 0 && (
        <div className="hms-metrics-summary-row">
          {summaryEntries.map(([key, value]) => (
            <div className="hms-metric-box" key={key}>
              <div className="hms-metric-title">{toLabel(key)}</div>
              <div className="hms-metric-val">{renderMetric(key, value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Visual Charts Row (if trend data exists) ── */}
      {(linePoints.length > 0 || breakdown.length > 0 || pieRows.length > 0) && (
        <div className="hms-charts-row">
          {linePoints.length > 0 && (
            <div className={`hms-chart-card ${breakdown.length > 0 || pieRows.length > 0 ? 'col-2' : 'col-3'}`}>
              <div className="hms-chart-header">
                <h3>Daily Timeline Trend</h3>
                <span className="hms-chart-tag">Period Breakdown</span>
              </div>
              <div className="hms-canvas-container">
                <Line data={lineData} options={chartOptions} height={240} />
              </div>
            </div>
          )}

          {breakdown.length > 0 && (
            <div className="hms-chart-card col-1">
              <div className="hms-chart-header">
                <h3>Revenue Split</h3>
              </div>
              <div className="hms-canvas-container">
                <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false }} height={240} />
              </div>
            </div>
          )}

          {pieRows.length > 0 && (
            <div className="hms-chart-card col-1">
              <div className="hms-chart-header">
                <h3>Categorical Share</h3>
              </div>
              <div className="hms-canvas-container" style={{ display: 'flex', justifyContent: 'center' }}>
                <Pie data={pieData} options={{ responsive: true, maintainAspectRatio: false }} height={220} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detailed Ledger Table Container ── */}
      <div className="hms-table-card">
        <div className="hms-table-header">
          <div className="hms-table-header-left">
            <h3 className="hms-table-title">{report.title} Ledger</h3>
            <span className="hms-table-count">{filteredRows.length} Entries</span>
          </div>

          <div className="hms-table-actions">
            <div className="hms-search-input-wrap">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input
                type="text"
                placeholder="Search within records…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button type="button" className="hms-search-clear-btn" onClick={() => setSearchTerm('')}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>

            <button
              type="button"
              className="hms-btn-action"
              onClick={() => downloadCSV(filteredRows, `${type}-report.csv`)}
              disabled={!filteredRows.length}
            >
              <i className="fa-solid fa-file-csv"></i> CSV
            </button>

            <button
              type="button"
              className="hms-btn-action"
              onClick={() => downloadXLSX(filteredRows, `${type}-report.xlsx`)}
              disabled={!filteredRows.length}
            >
              <i className="fa-solid fa-file-excel"></i> Excel
            </button>

            <button
              type="button"
              className="hms-btn-action"
              onClick={printTable}
              disabled={!filteredRows.length}
            >
              <i className="fa-solid fa-print"></i> Print
            </button>
          </div>
        </div>

        <div className="hms-table-wrap">
          <table className="hms-table">
            <thead>
              <tr>
                {visibleKeys.length > 0 ? (
                  visibleKeys.map((k) => <th key={k}>{toLabel(k)}</th>)
                ) : (
                  <th>Record Entry</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={Math.max(1, visibleKeys.length)} className="hms-table-empty">
                    <div className="hms-table-loading-box">
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>Retrieving records…</span>
                    </div>
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, visibleKeys.length)} className="hms-table-empty">
                    <div className="hms-table-empty-box">
                      <i className="fa-regular fa-folder-open"></i>
                      <h4>No Records Found</h4>
                      <p>
                        {searchTerm
                          ? `No records match your query "${searchTerm}".`
                          : `No transactions or records were registered between ${filters.from_date} and ${filters.to_date}.`}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedRows.map((row, idx) => (
                  <tr key={idx}>
                    {visibleKeys.map((k) => {
                      const badge = getBadgeClass(k, row[k])
                      return (
                        <td key={k}>
                          {badge ? (
                            <span className={`hms-badge ${badge}`}>
                              {renderMetric(k, row[k])}
                            </span>
                          ) : (
                            renderMetric(k, row[k])
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredRows.length > 0 && (
          <div className="hms-table-footer">
            <div className="hms-footer-page-size">
              <span>Show:</span>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
              </select>
              <span className="hms-footer-count-text">
                Showing <strong>{(page - 1) * pageSize + 1}</strong> to{' '}
                <strong>{Math.min(page * pageSize, filteredRows.length)}</strong> of{' '}
                <strong>{filteredRows.length}</strong> records
              </span>
            </div>

            <div className="hms-pagination-btns">
              <button
                type="button"
                className="hms-page-nav-btn"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                <i className="fa-solid fa-angles-left"></i>
              </button>
              <button
                type="button"
                className="hms-page-nav-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <i className="fa-solid fa-angle-left"></i> Prev
              </button>

              <span className="hms-page-current">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
              </span>

              <button
                type="button"
                className="hms-page-nav-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next <i className="fa-solid fa-angle-right"></i>
              </button>
              <button
                type="button"
                className="hms-page-nav-btn"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
              >
                <i className="fa-solid fa-angles-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
