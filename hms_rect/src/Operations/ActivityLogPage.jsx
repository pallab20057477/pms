import React, { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { getWithAuth } from '../api'
import { downloadCSV, downloadXLSX } from '../Reports/reportUtils'
import './OperationsModern.css'

function defaultFromDate() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function formatTs(unixSeconds) {
  if (!unixSeconds) return '-'
  return new Date(Number(unixSeconds) * 1000).toLocaleString('en-IN')
}

export default function ActivityLogPage() {
  const token = useSelector((state) => state.auth.accesstoken)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    from: defaultFromDate(),
    to: new Date().toISOString().slice(0, 10),
    module: '',
    action: '',
    reference: '',
    keyword: '',
    page: 1,
    page_size: 50,
  })

  const query = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) params.set(k, String(v))
    })
    return params.toString()
  }, [filters])

  const totalPages = useMemo(() => {
    const size = Number(filters.page_size || 1)
    return Math.max(1, Math.ceil(total / size))
  }, [total, filters.page_size])

  const pageStart = useMemo(() => {
    if (total === 0) return 0
    return (Number(filters.page) - 1) * Number(filters.page_size) + 1
  }, [filters.page, filters.page_size, total])

  const pageEnd = useMemo(() => {
    if (total === 0) return 0
    return Math.min(total, Number(filters.page) * Number(filters.page_size))
  }, [filters.page, filters.page_size, total])

  const pageNumbers = useMemo(() => {
    const current = Math.min(Math.max(1, Number(filters.page)), totalPages)
    const start = Math.max(1, current - 2)
    const end = Math.min(totalPages, current + 2)
    const pages = []
    for (let i = start; i <= end; i += 1) pages.push(i)
    return pages
  }, [filters.page, totalPages])

  async function loadLogs() {
    setLoading(true)
    try {
      const res = await getWithAuth(`logs?${query}`, token)
      const payload = res.data || {}
      setItems(Array.isArray(payload.items) ? payload.items : [])
      setTotal(Number(payload.total || 0))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!token) return
    loadLogs().catch(() => {})
  }, [token, query])

  useEffect(() => {
    if (Number(filters.page) > totalPages) {
      setFilters((p) => ({ ...p, page: totalPages }))
    }
  }, [totalPages, filters.page])

  const exportRows = items.map((r) => ({
    timestamp: formatTs(r.timestamp),
    module: r.module,
    action: r.action,
    reference: r.reference || r.reference_id,
    description: r.description,
    admin: r.admin_name || `Admin #${r.admin_id || '-'}`,
  }))

  return (
    <section className="ops-page">
      <div className="ops-head">
        <div>
          <h3 style={{ margin: 0, fontWeight: 700 }}><i className="fa fa-history" style={{ marginRight: '8px' }}></i>Activity Log</h3>
          <div className="text-muted" style={{ marginTop: '4px' }}>Complete audit trail with filters, search, and export.</div>
        </div>
      </div>

      <div className="ops-panel">
        <div className="ops-form-row">
          <div><label>From</label><input className="form-control" type="date" value={filters.from} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value, page: 1 }))} /></div>
          <div><label>To</label><input className="form-control" type="date" value={filters.to} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value, page: 1 }))} /></div>
          <div><label>Module</label><input className="form-control" value={filters.module} placeholder="Booking, Payment..." onChange={(e) => setFilters((p) => ({ ...p, module: e.target.value, page: 1 }))} /></div>
          <div><label>Action</label><input className="form-control" value={filters.action} placeholder="Created, Updated..." onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value, page: 1 }))} /></div>
          <div><label>Reference</label><input className="form-control" value={filters.reference} placeholder="BK-2026..., 101" onChange={(e) => setFilters((p) => ({ ...p, reference: e.target.value, page: 1 }))} /></div>
          <div><label>Keyword</label><input className="form-control" value={filters.keyword} placeholder="search description" onChange={(e) => setFilters((p) => ({ ...p, keyword: e.target.value, page: 1 }))} /></div>
        </div>
        <div className="ops-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-default" onClick={() => loadLogs()}><i className="fa fa-refresh" style={{ marginRight: '6px' }}></i>Refresh Data</button>
          <button className="btn btn-primary" onClick={() => downloadCSV(exportRows, 'activity-logs.csv')} disabled={exportRows.length === 0}><i className="fa fa-file-text-o" style={{ marginRight: '6px' }}></i>Export CSV</button>
          <button className="btn btn-success" onClick={() => downloadXLSX(exportRows, 'activity-logs.xlsx')} disabled={exportRows.length === 0}><i className="fa fa-file-excel-o" style={{ marginRight: '6px' }}></i>Export XLSX</button>
        </div>
      </div>

      <div className="ops-panel">
        <div className="ops-head" style={{ marginBottom: 8 }}>
          <div>
            <strong>Total Logs: {total}</strong>
            <div className="text-muted" style={{ fontSize: 12 }}>Showing {pageStart}-{pageEnd} of {total}</div>
          </div>
          <div className="ops-actions" style={{ alignItems: 'center' }}>
            <label style={{ marginBottom: 0 }}>Rows</label>
            <select
              className="form-control"
              style={{ width: 90 }}
              value={filters.page_size}
              onChange={(e) => setFilters((p) => ({ ...p, page_size: Number(e.target.value), page: 1 }))}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        <div className="ops-pagination">
          <button className="btn btn-default btn-sm" disabled={Number(filters.page) <= 1} onClick={() => setFilters((p) => ({ ...p, page: 1 }))}><i className="fa fa-angle-double-left"></i></button>
          <button className="btn btn-default btn-sm" disabled={Number(filters.page) <= 1} onClick={() => setFilters((p) => ({ ...p, page: Number(p.page) - 1 }))}><i className="fa fa-angle-left"></i></button>

          {pageNumbers.length > 0 && pageNumbers[0] > 1 ? <span className="ops-page-dots">...</span> : null}
          {pageNumbers.map((p) => (
            <button
              key={p}
              className={`btn btn-sm ${Number(filters.page) === p ? 'btn-primary' : 'btn-default'}`}
              onClick={() => setFilters((prev) => ({ ...prev, page: p }))}
            >
              {p}
            </button>
          ))}
          {pageNumbers.length > 0 && pageNumbers[pageNumbers.length - 1] < totalPages ? <span className="ops-page-dots">...</span> : null}

          <button className="btn btn-default btn-sm" disabled={Number(filters.page) >= totalPages} onClick={() => setFilters((p) => ({ ...p, page: Number(p.page) + 1 }))}><i className="fa fa-angle-right"></i></button>
          <button className="btn btn-default btn-sm" disabled={Number(filters.page) >= totalPages} onClick={() => setFilters((p) => ({ ...p, page: totalPages }))}><i className="fa fa-angle-double-right"></i></button>
          <span className="text-muted" style={{ marginLeft: 8, fontSize: 13, fontWeight: 600 }}>Page {filters.page} of {totalPages}</span>
        </div>

        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Module</th>
                <th>Action</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6}>Loading...</td></tr> : null}
              {!loading && items.length === 0 ? <tr><td colSpan={6} className="text-muted">No logs found for selected filters.</td></tr> : null}
              {!loading && items.map((row) => (
                <tr key={row.id}>
                  <td>{formatTs(row.timestamp)}</td>
                  <td>{row.module}</td>
                  <td>{row.action || '-'}</td>
                  <td>{row.reference || row.reference_id || '-'}</td>
                  <td>{row.description}</td>
                  <td>{row.admin_name || `Admin #${row.admin_id || '-'}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
