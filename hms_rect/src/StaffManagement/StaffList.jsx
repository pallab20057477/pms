import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { deleteWithAuth, getWithAuth, postWithAuth } from '../api'
import { resolveAssetUrl } from '../Functions/assetUrl'
import './StaffListModern.css'

const ROLE_OPTIONS = [
  'Housekeeping',
  'Receptionist',
  'Manager',
  'Accountant',
  'Maintenance',
  'Security',
]

function isHousekeepingRole(role) {
  return String(role || '').trim().toLowerCase() === 'housekeeping'
}

function roleMeta(role) {
  const normalized = String(role || '').trim().toLowerCase()
  switch (normalized) {
    case 'housekeeping':
      return {
        summary: 'Room readiness, cleaning progress, and room turnover',
        actionLabel: 'Housekeeping',
        actionPath: '/housekeeping/dirty',
      }
    case 'receptionist':
      return {
        summary: 'Front desk operations, arrivals, departures, and guest handling',
        actionLabel: 'Bookings',
        actionPath: '/booking/all',
      }
    case 'manager':
      return {
        summary: 'Oversight, operations control, and staff performance visibility',
        actionLabel: 'Reports',
        actionPath: '/reports',
      }
    case 'accountant':
      return {
        summary: 'Billing control, payments tracking, and financial follow-up',
        actionLabel: 'Payments',
        actionPath: '/folio/payments',
      }
    case 'maintenance':
      return {
        summary: 'Room issue handling, service readiness, and maintenance follow-up',
        actionLabel: 'Maintenance',
        actionPath: '/rooms/maintenance',
      }
    case 'security':
      return {
        summary: 'Entry monitoring, property watch, and operational visibility',
        actionLabel: 'Activity Log',
        actionPath: '/activity/logs',
      }
    default:
      return {
        summary: 'Operational staff access',
        actionLabel: 'Open',
        actionPath: '/dashboard',
      }
  }
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase()
}

export default function StaffList() {
  const token = useSelector((s) => s.auth.accesstoken)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [busyShiftId, setBusyShiftId] = useState(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = { page, page_size: pageSize }
      if (query.trim()) params.q = query.trim()
      if (role.trim()) params.role = role.trim()
      if (status !== 'all') params.status = status

      const res = await getWithAuth('/staff', token, { params })
      const body = res?.data?.data || {}
      setRows(Array.isArray(body.items) ? body.items : [])
      setTotal(Number(body.total || 0))
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || 'Failed to load staff')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, query, role, status])

  useEffect(() => {
    load()
  }, [load])

  async function onDelete(staff) {
    if (!token) return
    const ok = window.confirm(`Delete ${staff.name}? This action cannot be undone.`)
    if (!ok) return
    try {
      await deleteWithAuth(`/staff/${staff.id}`, token)
      toast.success('Staff deleted')
      load()
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || 'Failed to delete staff')
    }
  }

  async function onShiftAction(staff) {
    if (!token || !staff?.id || busyShiftId) return

    const hasOpenShift = !!staff.has_open_shift
    const endpoint = hasOpenShift ? `/staff/${staff.id}/shifts/check-out` : `/staff/${staff.id}/shifts/check-in`
    const successMessage = hasOpenShift ? 'Check-out recorded' : 'Check-in recorded'

    try {
      setBusyShiftId(staff.id)
      await postWithAuth(endpoint, { notes: '' }, token)
      toast.success(`${staff.name}: ${successMessage}`)
      load()
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || `Failed to ${hasOpenShift ? 'check out' : 'check in'}`)
    } finally {
      setBusyShiftId(null)
    }
  }

  function onSearchSubmit(e) {
    e.preventDefault()
    setPage(1)
    load()
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])
  const activeCount = useMemo(() => rows.filter((s) => !!s.status).length, [rows])
  const inactiveCount = useMemo(() => rows.filter((s) => !s.status).length, [rows])
  const activeHousekeepingAssignments = useMemo(
    () => rows.reduce((sum, s) => sum + (isHousekeepingRole(s.role) ? Number(s.active_assignments || 0) : 0), 0),
    [rows]
  )
  const roleCounts = useMemo(() => {
    const counts = Object.fromEntries(ROLE_OPTIONS.map((r) => [r, 0]))
    rows.forEach((s) => {
      const match = ROLE_OPTIONS.find((r) => normalizeRole(r) === normalizeRole(s.role))
      if (match) counts[match] += 1
    })
    return counts
  }, [rows])

  function renderShiftBadge(staff) {
    if (!staff.status) return <span className="staff-status-badge staff-status-inactive">Inactive</span>
    if (staff.has_open_shift) return <span className="staff-status-badge staff-status-active">Checked In</span>
    return <span className="staff-status-badge" style={{background: '#FFF4E5', color: '#B06D0F'}}>Checked Out</span>
  }

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="glyphicon glyphicon-user"></i>
        </div>
        <div className="header-title">
          <h1>Staff Management</h1>
          <small>Staff Directory</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="row staff-kpi-row">
              <div className="col-sm-3 col-xs-6">
                <div className="staff-kpi-card staff-kpi-total">
                  <span className="staff-kpi-label">Total Listed</span>
                  <div className="staff-kpi-value">{total}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="staff-kpi-card staff-kpi-active">
                  <span className="staff-kpi-label">Active</span>
                  <div className="staff-kpi-value">{activeCount}</div>
                </div>
              </div>
              <div className="col-sm-3 col-xs-6">
                <div className="staff-kpi-card staff-kpi-inactive">
                  <span className="staff-kpi-label">Inactive</span>
                  <div className="staff-kpi-value">{inactiveCount}</div>
                </div>
              </div>
                <div className="col-sm-3 col-xs-6">
                  <div className="staff-kpi-card staff-kpi-assigned">
                    <span className="staff-kpi-label">Housekeeping Assignments</span>
                    <div className="staff-kpi-value">{activeHousekeepingAssignments}</div>
                  </div>
                </div>
            </div>

            <div className="panel panel-bd lobidrag staff-list-panel">
              <div className="panel-heading staff-list-heading">
                <div>
                  <h4 className="staff-list-title">Manage Staff</h4>
                  <p className="staff-list-subtitle">Search, review, and maintain hotel workforce records.</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="staff-list-toolbar">
                  <button type="button" className="staff-add-btn" onClick={() => navigate('/staff/new')}>
                    <i className="glyphicon glyphicon-plus" style={{marginRight: 6}}></i> Add New Staff
                  </button>
                </div>

                <form className="row staff-filter-row" onSubmit={onSearchSubmit}>
                  <div className="col-sm-4">
                    <div className="input-group">
                      <span className="input-group-addon"><i className="glyphicon glyphicon-search"></i></span>
                      <input
                        className="form-control staff-list-input"
                        placeholder="Search by name, phone, role"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-sm-2">
                    <select className="form-control staff-list-input" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}>
                      <option value="">All roles</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-sm-2">
                    <select className="form-control staff-list-input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
                      <option value="all">All status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="col-sm-2">
                    <select className="form-control staff-list-input" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                      <option value={10}>10 / page</option>
                      <option value={20}>20 / page</option>
                      <option value={50}>50 / page</option>
                    </select>
                  </div>
                  <div className="col-sm-1">
                    <button className="btn btn-primary" type="submit">Search</button>
                  </div>
                  <div className="col-sm-1 text-right" style={{ paddingTop: 8 }}>
                    <strong>{total}</strong>
                  </div>
                </form>

                <div className="staff-role-strip">
                  <button
                    type="button"
                    className={`staff-role-chip ${role === '' ? 'is-active' : ''}`}
                    onClick={() => { setRole(''); setPage(1) }}
                  >
                    <span>All Roles</span>
                    <strong>{rows.length}</strong>
                  </button>
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`staff-role-chip ${role === r ? 'is-active' : ''}`}
                      onClick={() => { setRole(r); setPage(1) }}
                      title={roleMeta(r).summary}
                    >
                      <span>{r}</span>
                      <strong>{roleCounts[r] || 0}</strong>
                    </button>
                  ))}
                </div>

                <div className="table-responsive" style={{ paddingRight: 8 }}>
                  <table className="table table-bordered table-striped table-hover mb-0 staff-list-table">
                    <thead>
                      <tr>
                        <th style={{ width: 70 }}>Photo</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Shift</th>
                        <th style={{ width: 290 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={9} className="text-center" style={{ padding: '24px 0' }}>
                            <i className="glyphicon glyphicon-refresh staff-spin"></i> Loading staff...
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center text-muted" style={{ padding: '18px 0' }}>
                            No staff found.
                          </td>
                        </tr>
                      ) : rows.map((s) => (
                        <tr key={s.id}>
                          <td>
                            {s.photo ? (
                              <img
                                src={resolveAssetUrl(s.photo, 'staff')}
                                alt={s.name}
                                style={{ width: 42, height: 42, borderRadius: 21, objectFit: 'cover' }}
                              />
                            ) : (
                              <div className="staff-avatar-fallback">
                                <i className="glyphicon glyphicon-user text-muted"></i>
                              </div>
                            )}
                          </td>
                          <td>{s.name}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.role || '-'}</div>
                            <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>
                              {roleMeta(s.role).summary}
                            </small>
                          </td>
                          <td>{s.phone}</td>
                          <td>{s.email || '-'}</td>
                          <td>
                            {s.status ? <span className="staff-status-badge staff-status-active">Active</span> : <span className="staff-status-badge staff-status-inactive">Inactive</span>}
                          </td>
                          <td>
                            <div>{renderShiftBadge(s)}</div>
                            {s.has_open_shift && s.last_check_in_at ? (
                              <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>
                                Since {new Date(s.last_check_in_at).toLocaleTimeString()}
                              </small>
                            ) : null}
                          </td>
                          <td>
                            <div className="staff-row-actions">
                              <button
                                className={`staff-shift-btn`}
                                onClick={() => onShiftAction(s)}
                                title={s.has_open_shift ? 'Check out staff' : 'Check in staff'}
                                disabled={!s.status || busyShiftId === s.id}
                              >
                                <i className={`glyphicon ${s.has_open_shift ? 'glyphicon-log-out' : 'glyphicon-log-in'}`}></i>
                                <span style={{ marginLeft: 4 }}>
                                  {busyShiftId === s.id ? 'Saving...' : s.has_open_shift ? 'Check Out' : 'Check In'}
                                </span>
                              </button>
                              <div className="staff-row-actions-secondary">
                                <button
                                  className="staff-icon-btn"
                                  onClick={() => navigate(roleMeta(s.role).actionPath)}
                                  title={`Open ${roleMeta(s.role).actionLabel}`}
                                >
                                  <i className="glyphicon glyphicon-new-window"></i>
                                </button>
                                <button className="staff-icon-btn" onClick={() => navigate(`/staff/${s.id}`)} title="View profile">
                                  <i className="glyphicon glyphicon-eye-open"></i>
                                </button>
                                <button className="staff-icon-btn" onClick={() => navigate(`/staff/${s.id}/edit`)} title="Edit staff">
                                  <i className="glyphicon glyphicon-edit"></i>
                                </button>
                                <button className="staff-icon-btn" style={{color: '#D32F2F'}} onClick={() => onDelete(s)} title="Delete staff">
                                  <i className="glyphicon glyphicon-trash"></i>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-center" style={{ marginTop: 18 }}>
                  <nav>
                    <ul className="pagination pagination-sm staff-pagination" style={{ margin: 0 }}>
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
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
