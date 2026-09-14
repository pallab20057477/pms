import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { getWithAuth } from '../api'
import './StaffAttendanceModern.css'

const ROLE_OPTIONS = [
  'Housekeeping',
  'Receptionist',
  'Manager',
  'Accountant',
  'Maintenance',
  'Security',
]

function toCsv(rows) {
  const headers = ['Date', 'Staff', 'Role', 'Check In', 'Check Out', 'Minutes', 'Status']
  const data = rows.map((r) => [
    r.shift_date || '',
    r.staff_name || '',
    r.role || '',
    formatDateTime(r.check_in_at),
    formatDateTime(r.check_out_at),
    String(r.minutes_worked || 0),
    r.shift_status || '',
  ])
  const all = [headers, ...data]
  return all
    .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function formatDateTime(value) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return String(value)
  const datePart = dt.toLocaleDateString('en-GB')
  const timePart = dt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  return `${datePart} ${timePart}`
}

function downloadCsv(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function StaffAttendance() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const token = useSelector((s) => s.auth.accesstoken)

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)

  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [role, setRole] = useState(searchParams.get('role') || 'all')
  const [status, setStatus] = useState(searchParams.get('status') || 'all')
  const [fromDate, setFromDate] = useState(searchParams.get('from') || '')
  const [toDate, setToDate] = useState(searchParams.get('to') || '')
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pageSize, setPageSize] = useState(Number(searchParams.get('page_size') || 20))

  useEffect(() => {
    const next = new URLSearchParams()
    if (query.trim()) next.set('q', query.trim())
    if (role !== 'all') next.set('role', role)
    if (status !== 'all') next.set('status', status)
    if (fromDate) next.set('from', fromDate)
    if (toDate) next.set('to', toDate)
    if (page > 1) next.set('page', String(page))
    if (pageSize !== 20) next.set('page_size', String(pageSize))
    setSearchParams(next, { replace: true })
  }, [query, role, status, fromDate, toDate, page, pageSize, setSearchParams])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = { page, page_size: pageSize }
      if (query.trim()) params.q = query.trim()
      if (role !== 'all') params.role = role
      if (status !== 'all') params.status = status
      if (fromDate) params.from = fromDate
      if (toDate) params.to = toDate

      const attendanceRes = await getWithAuth('/staff/attendance', token, { params })

      const attendanceBody = attendanceRes?.data?.data || {}
      setRows(Array.isArray(attendanceBody.items) ? attendanceBody.items : [])
      setTotal(Number(attendanceBody.total || 0))
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || 'Failed to load attendance dashboard')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, query, role, status, fromDate, toDate])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])
  const openShifts = useMemo(() => rows.filter((r) => r.shift_status === 'open').length, [rows])
  const closedShifts = useMemo(() => rows.filter((r) => r.shift_status !== 'open').length, [rows])
  const workedMinutes = useMemo(() => rows.reduce((sum, r) => sum + Number(r.minutes_worked || 0), 0), [rows])

  function onSearchSubmit(e) {
    e.preventDefault()
    setPage(1)
    load()
  }

  function onExport() {
    if (!rows.length) {
      toast.error('No rows to export')
      return
    }
    const csv = toCsv(rows)
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(`staff_attendance_${today}.csv`, csv)
    toast.success('CSV exported')
  }

  function onResetFilters() {
    setQuery('')
    setRole('all')
    setStatus('all')
    setFromDate('')
    setToDate('')
    setPageSize(20)
    setPage(1)
  }

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="glyphicon glyphicon-check"></i>
        </div>
        <div className="header-title">
          <h1>Staff Attendance</h1>
          <small>Date-range attendance tracking</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="row staff-att-kpi-row">
              <div className="col-sm-3 col-xs-6"><div className="staff-att-kpi-card staff-att-kpi-total"><span className="staff-att-kpi-label">Records</span><div className="staff-att-kpi-value">{total}</div></div></div>
              <div className="col-sm-3 col-xs-6"><div className="staff-att-kpi-card staff-att-kpi-open"><span className="staff-att-kpi-label">Open Shifts</span><div className="staff-att-kpi-value">{openShifts}</div></div></div>
              <div className="col-sm-3 col-xs-6"><div className="staff-att-kpi-card staff-att-kpi-closed"><span className="staff-att-kpi-label">Closed Shifts</span><div className="staff-att-kpi-value">{closedShifts}</div></div></div>
              <div className="col-sm-3 col-xs-6"><div className="staff-att-kpi-card staff-att-kpi-minutes"><span className="staff-att-kpi-label">Worked Minutes</span><div className="staff-att-kpi-value">{workedMinutes}</div></div></div>
            </div>

            <div className="panel panel-bd lobidrag staff-att-panel">
              <div className="panel-heading staff-att-heading">
                <div>
                  <h4 className="staff-att-title">Attendance Dashboard</h4>
                  <p className="staff-att-subtitle">Review shift check-ins, check-outs, and productivity windows.</p>
                </div>
                <div className="staff-att-heading-actions">
                  <button className="btn btn-info btn-sm" type="button" onClick={() => navigate('/staff/performance-ranking')}>
                    <i className="glyphicon glyphicon-signal"></i> Open Performance Ranking
                  </button>
                </div>
              </div>
                <div className="panel-body">
                {(query.trim() || role !== 'all') && (
                  <div className="alert alert-info" style={{ marginBottom: 12 }}>
                    <strong>Focused View:</strong> {query.trim() ? `Staff: ${query.trim()}` : 'Selected staff'}
                    {role !== 'all' ? ` | Role: ${role}` : ''}
                  </div>
                )}
                <form className="row staff-att-filter-row" onSubmit={onSearchSubmit}>
                  <div className="col-sm-2">
                    <input className="form-control staff-att-input" placeholder="Search staff" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                  <div className="col-sm-2">
                    <select className="form-control staff-att-input" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}>
                      <option value="all">All roles</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-sm-2">
                    <select className="form-control staff-att-input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
                      <option value="all">All shift status</option>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div className="col-sm-2">
                    <input className="form-control staff-att-input" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1) }} />
                  </div>
                  <div className="col-sm-2">
                    <input className="form-control staff-att-input" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1) }} />
                  </div>
                  <div className="col-sm-1">
                    <select className="form-control staff-att-input" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <div className="col-sm-12 staff-att-filter-actions">
                    <button className="btn btn-default" type="button" onClick={onResetFilters}>Reset</button>
                    <button className="btn btn-primary" type="submit">Apply</button>
                    <button className="btn btn-success" type="button" onClick={onExport}>Export CSV</button>
                  </div>
                </form>

                <div className="table-responsive staff-att-table-wrap">
                  <table className="table table-bordered table-striped table-hover staff-att-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Staff</th>
                        <th>Role</th>
                        <th>Check In</th>
                        <th>Check Out</th>
                        <th>Minutes</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={7} className="text-center"><i className="glyphicon glyphicon-refresh staff-att-spin"></i> Loading attendance...</td></tr>
                      ) : rows.length === 0 ? (
                        <tr><td colSpan={7} className="text-center text-muted">No attendance records found.</td></tr>
                      ) : rows.map((r) => (
                        <tr key={r.shift_id}>
                          <td>{r.shift_date || '-'}</td>
                          <td>{r.staff_name || '-'}</td>
                          <td>{r.role || '-'}</td>
                          <td>{formatDateTime(r.check_in_at)}</td>
                          <td>{formatDateTime(r.check_out_at)}</td>
                          <td>{Number(r.minutes_worked || 0)}</td>
                          <td>{r.shift_status === 'open' ? <span className="label label-warning">Open</span> : <span className="label label-success">Closed</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-center staff-att-pagination-wrap">
                  <ul className="pagination pagination-sm staff-att-pagination">
                    <li className={page === 1 ? 'disabled' : ''}>
                      <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                    </li>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <li key={i} className={page === i + 1 ? 'active' : ''}>
                        <button className="page-link" onClick={() => setPage(i + 1)}>{i + 1}</button>
                      </li>
                    ))}
                    <li className={page === totalPages ? 'disabled' : ''}>
                      <button className="page-link" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
