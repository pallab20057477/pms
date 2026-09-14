import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { getWithAuth } from '../api'
import { getReportType } from './reportConfig'
import { defaultDateRange, DATE_PRESETS, downloadCSV, downloadXLSX, formatCurrency, formatNumber, toLabel } from './reportUtils'
import './ReportsModern.css'

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

export default function ReportsTablePage() {
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

  const dataset = params.get('dataset') || 'main'
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
      reqParams.dataset = dataset
      const res = await getWithAuth(report.endpoint, token, { params: reqParams })
      setData(res.data || null)
      setParams(reqParams)
    } catch (e) {
      console.error(e)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [token, filters, report.endpoint, dataset, setParams])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const handleApplyPreset = (preset) => {
    setActivePreset(preset.label)
    const range = preset.getRange()
    const updated = { ...filters, ...range }
    setFilters(updated)
    loadReport(updated)
  }

  const rawRows = dataset === 'repeat'
    ? (Array.isArray(data?.top_repeat_guests) ? data.top_repeat_guests : [])
    : (data?.table || [])

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rawRows
    const term = searchTerm.toLowerCase()
    return rawRows.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(term)
      )
    )
  }, [rawRows, searchTerm])

  useEffect(() => {
    setPage(1)
  }, [filteredRows.length, pageSize, dataset, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  const hiddenColumns = type === 'room-revenue' ? ['room_id'] : []
  const visibleKeys = rawRows.length > 0
    ? Object.keys(rawRows[0]).filter((k) => !hiddenColumns.includes(k))
    : []

  const title = dataset === 'repeat' ? 'VIP Repeat Guests Ledger' : `${report.title} Detailed Ledger`

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
        <head><title>${report.title} - ${title}</title>${styles}</head>
        <body>
          <h2>${report.title}</h2>
          <p>${title} | Range: ${filters.from_date} to ${filters.to_date} | Records: ${filteredRows.length}</p>
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
            <i className="fa-solid fa-table-list"></i>
          </div>
          <div>
            <div className="hms-breadcrumb">
              <span onClick={() => navigate('/reports')} style={{ cursor: 'pointer' }}>
                Reports
              </span>
              <i className="fa-solid fa-angle-right"></i>
              <span onClick={() => navigate(`/reports/${type}?from_date=${filters.from_date}&to_date=${filters.to_date}`)} style={{ cursor: 'pointer' }}>
                {report.title}
              </span>
              <i className="fa-solid fa-angle-right"></i>
              <span className="active">Ledger Table</span>
            </div>
            <h1 className="hms-header-title">{title}</h1>
            <p className="hms-header-subtitle">
              Granular auditing records for period {filters.from_date} to {filters.to_date}.
            </p>
          </div>
        </div>

        <div className="hms-header-actions">
          <button
            type="button"
            className="hms-btn-secondary"
            onClick={() => navigate(`/reports/${type}?from_date=${filters.from_date}&to_date=${filters.to_date}`)}
          >
            <i className="fa-solid fa-chart-pie"></i> Visual Charts
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

          <button type="submit" className="hms-btn-filter" disabled={loading}>
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-arrows-rotate"></i>}
            <span>Update Range</span>
          </button>
        </form>
      </div>

      {/* ── Table Card ── */}
      <div className="hms-table-card">
        <div className="hms-table-header">
          <div className="hms-table-header-left">
            <h3 className="hms-table-title">{title}</h3>
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
              onClick={() => downloadCSV(filteredRows, `${type}-${dataset}.csv`)}
              disabled={!filteredRows.length}
            >
              <i className="fa-solid fa-file-csv"></i> CSV
            </button>

            <button
              type="button"
              className="hms-btn-action"
              onClick={() => downloadXLSX(filteredRows, `${type}-${dataset}.xlsx`)}
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
