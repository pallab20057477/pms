import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { getWithAuth } from '../api'
import './StaffPerformanceRankingModern.css'

const ROLE_OPTIONS = [
  'Housekeeping',
  'Receptionist',
  'Manager',
  'Accountant',
  'Maintenance',
  'Security',
]

const ON_TIME_TARGET_MIN = 120

function isHousekeepingRole(role) {
  return String(role || '').trim().toLowerCase() === 'housekeeping'
}

function formatShiftDuration(minutes) {
  const total = Math.max(0, Number(minutes || 0))
  if (!Number.isFinite(total) || total === 0) return '-'
  if (total < 60) return `${total.toFixed(0)} min`
  const hours = Math.floor(total / 60)
  const mins = Math.round(total % 60)
  if (hours < 24) return `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return `${days}d ${remHours}h`
}

function professionalScoreLabel(label) {
  if (label === 'Housekeeping Score') return 'Operational Score'
  if (label === 'Attendance Score') return 'Attendance Reliability'
  return label || 'Performance Score'
}

export default function StaffPerformanceRanking() {
  const token = useSelector((s) => s.auth.accesstoken)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [role, setRole] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = {
        role,
        from: fromDate || undefined,
        to: toDate || undefined,
        on_time_target_min: ON_TIME_TARGET_MIN,
      }
      const res = await getWithAuth('/staff/performance/ranking', token, { params })
      const items = res?.data?.data?.items || []
      setRows(Array.isArray(items) ? items : [])
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || 'Failed to load performance ranking')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [token, role, fromDate, toDate])

  useEffect(() => {
    load()
  }, [load])

  const topScore = rows.length ? Number(rows[0]?.composite_score || 0).toFixed(1) : '0.0'
  const avgScore = rows.length
    ? (rows.reduce((sum, r) => sum + Number(r.composite_score || 0), 0) / rows.length).toFixed(1)
    : '0.0'
  const totalCompleted = rows.reduce((sum, r) => sum + (isHousekeepingRole(r.role) ? Number(r.completed_rooms || 0) : 0), 0)
  const selectedRoleIsHousekeeping = role === 'Housekeeping'
  const showingMixedRoles = role === 'all'

  function onApply(e) {
    e.preventDefault()
    load()
  }

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="glyphicon glyphicon-signal"></i>
        </div>
        <div className="header-title">
          <h1>Staff Performance Ranking</h1>
          <small>Role-wise quality and productivity ranking</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="row staff-rank-kpi-row">
              <div className="col-sm-3 col-xs-6"><div className="staff-rank-kpi-card staff-rank-kpi-total"><span className="staff-rank-kpi-label">Staff Ranked</span><div className="staff-rank-kpi-value">{rows.length}</div></div></div>
              <div className="col-sm-3 col-xs-6"><div className="staff-rank-kpi-card staff-rank-kpi-top"><span className="staff-rank-kpi-label">Top Score</span><div className="staff-rank-kpi-value">{topScore}</div></div></div>
              <div className="col-sm-3 col-xs-6"><div className="staff-rank-kpi-card staff-rank-kpi-avg"><span className="staff-rank-kpi-label">Avg Score</span><div className="staff-rank-kpi-value">{avgScore}</div></div></div>
              <div className="col-sm-3 col-xs-6"><div className="staff-rank-kpi-card staff-rank-kpi-rooms"><span className="staff-rank-kpi-label">Completed Rooms</span><div className="staff-rank-kpi-value">{totalCompleted}</div></div></div>
            </div>

            <div className="panel panel-bd lobidrag staff-rank-panel">
              <div className="panel-heading staff-rank-heading">
                <h4 className="staff-rank-title">Role-wise Performance Ranking</h4>
                <button className="btn btn-default btn-sm" onClick={() => navigate('/staff/attendance')}>
                  <i className="glyphicon glyphicon-check"></i> Attendance Dashboard
                </button>
              </div>
              <div className="panel-body">
                <div className="alert alert-info" style={{ marginBottom: 12 }}>
                  <strong>Role-Aware Ranking:</strong>{' '}
                  Housekeeping uses room completion and cleaning efficiency. Other roles use attendance discipline and shift consistency.
                </div>
                <form className="row staff-rank-filter-row" onSubmit={onApply}>
                  <div className="col-sm-3">
                    <select className="form-control staff-rank-input" value={role} onChange={(e) => setRole(e.target.value)}>
                      <option value="all">All roles</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-sm-3">
                    <input className="form-control staff-rank-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                  </div>
                  <div className="col-sm-3">
                    <input className="form-control staff-rank-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                  </div>
                  <div className="col-sm-3 text-right">
                    <button className="btn btn-primary" type="submit">Apply</button>
                  </div>
                </form>

                <div className="table-responsive">
                  <table className="table table-bordered table-striped staff-rank-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Staff</th>
                        <th>Role</th>
                        <th>Completed Rooms</th>
                        <th>Avg Cleaning (min)</th>
                        <th>Closed Shifts</th>
                        <th>Avg Shift Duration</th>
                        <th>Performance Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={8} className="text-center"><i className="glyphicon glyphicon-refresh staff-rank-spin"></i> Loading ranking...</td></tr>
                      ) : rows.length === 0 ? (
                        <tr><td colSpan={8} className="text-center text-muted">No ranking data available.</td></tr>
                      ) : rows.map((r, idx) => (
                        <tr key={`${r.staff_id}_${idx}`}>
                          <td>{idx + 1}</td>
                          <td>{r.staff_name}</td>
                          <td>{r.role}</td>
                          <td>{isHousekeepingRole(r.role) ? Number(r.completed_rooms || 0) : <span className="text-muted">-</span>}</td>
                          <td>{isHousekeepingRole(r.role) ? Number(r.avg_cleaning_min || 0).toFixed(1) : <span className="text-muted">-</span>}</td>
                          <td>{Number(r.closed_shifts || 0)}</td>
                          <td>{formatShiftDuration(r.avg_shift_minutes)}</td>
                          <td>
                            <strong>{Number(r.composite_score || 0).toFixed(1)}</strong>
                            {(showingMixedRoles || !selectedRoleIsHousekeeping) && r.score_label ? (
                              <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>{professionalScoreLabel(r.score_label)}</small>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
