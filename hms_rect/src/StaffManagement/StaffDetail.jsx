import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { getWithAuth, postWithAuth, patchWithAuth } from '../api'
import { resolveAssetUrl } from '../Functions/assetUrl'

const ON_TIME_TARGET_MIN = 120

function formatDateTime(value) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return String(value)
  return dt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatHistoryDuration(durationMin, startTime, endTime) {
  const mins = Number(durationMin || 0)
  if (mins > 0) return `${mins} min`

  if (startTime && endTime) {
    const s = new Date(startTime).getTime()
    const e = new Date(endTime).getTime()
    if (Number.isFinite(s) && Number.isFinite(e) && e >= s) {
      const sec = Math.floor((e - s) / 1000)
      if (sec >= 60) return `${Math.ceil(sec / 60)} min`
      if (sec > 0) return `${sec}s`
      return '< 1s'
    }
  }
  return '-'
}

function formatAssignmentStatus(value) {
  const v = String(value || '').toLowerCase()
  if (v === 'in_progress') return 'Cleaning'
  if (v === 'clean') return 'Clean'
  if (v === 'dirty') return 'Dirty'
  if (v === 'available') return 'Available'
  return value || '-'
}

function isHousekeepingRole(role) {
  return String(role || '').trim().toLowerCase() === 'housekeeping'
}

function formatDurationMinutes(value) {
  const total = Math.max(0, Number(value || 0))
  if (!Number.isFinite(total) || total === 0) return '0 min'
  if (total < 60) return `${Math.round(total)} min`
  const hours = Math.floor(total / 60)
  const mins = Math.round(total % 60)
  if (hours < 24) return `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return `${days}d ${remHours}h`
}

function roleOverviewLines(role, performance, assignments, history) {
  const normalized = String(role || '').trim().toLowerCase()
  switch (normalized) {
    case 'housekeeping':
      return [
        `Active Assignments: ${assignments.length}`,
        `Completed Rooms: ${Number(performance?.quality_completed_rooms || 0)}`,
        `Average Cleaning Time: ${formatDurationMinutes(performance?.quality_avg_cleaning_min)}`,
      ]
    case 'receptionist':
      return [
        `Closed Shifts: ${Number(performance?.attendance_closed_shifts || 0)}`,
        `Average Shift Duration: ${formatDurationMinutes(performance?.attendance_avg_shift_min)}`,
        'Primary Focus: Front desk, bookings, and guest service',
      ]
    case 'manager':
      return [
        `Closed Shifts: ${Number(performance?.attendance_closed_shifts || 0)}`,
        `Average Shift Duration: ${formatDurationMinutes(performance?.attendance_avg_shift_min)}`,
        'Primary Focus: Team oversight and operations control',
      ]
    case 'accountant':
      return [
        `Closed Shifts: ${Number(performance?.attendance_closed_shifts || 0)}`,
        `Average Shift Duration: ${formatDurationMinutes(performance?.attendance_avg_shift_min)}`,
        'Primary Focus: Billing, payments, and finance review',
      ]
    case 'maintenance':
      return [
        `Closed Shifts: ${Number(performance?.attendance_closed_shifts || 0)}`,
        `Average Shift Duration: ${formatDurationMinutes(performance?.attendance_avg_shift_min)}`,
        'Primary Focus: Repairs, readiness, and service restoration',
      ]
    case 'security':
      return [
        `Closed Shifts: ${Number(performance?.attendance_closed_shifts || 0)}`,
        `Average Shift Duration: ${formatDurationMinutes(performance?.attendance_avg_shift_min)}`,
        'Primary Focus: Monitoring and site visibility',
      ]
    default:
      return [
        `Closed Shifts: ${Number(performance?.attendance_closed_shifts || 0)}`,
        `Average Shift Duration: ${formatDurationMinutes(performance?.attendance_avg_shift_min)}`,
        `Recorded Activity Rows: ${history.length}`,
      ]
  }
}

function roleMeta(role) {
  const normalized = String(role || '').trim().toLowerCase()
  switch (normalized) {
    case 'housekeeping':
      return {
        workspaceTitle: 'Housekeeping Workspace',
        workspaceText: 'Track active cleaning assignments, room turnaround, and housekeeping history.',
        workspacePath: '/housekeeping/dirty',
        workspaceLabel: 'Open Housekeeping',
        showAssignmentTabs: true,
        overviewTitle: 'Housekeeping Snapshot',
      }
    case 'receptionist':
      return {
        workspaceTitle: 'Front Desk Workspace',
        workspaceText: 'Handle bookings, guest arrivals, check-ins, and check-outs from the front desk flow.',
        workspacePath: '/booking/all',
        workspaceLabel: 'Open Bookings',
        showAssignmentTabs: false,
        overviewTitle: 'Front Desk Snapshot',
      }
    case 'manager':
      return {
        workspaceTitle: 'Manager Workspace',
        workspaceText: 'Monitor team activity, performance, and operations from reports and attendance dashboards.',
        workspacePath: '/staff/attendance',
        workspaceLabel: 'Open Focused Attendance',
        showAssignmentTabs: false,
        overviewTitle: 'Management Snapshot',
      }
    case 'accountant':
      return {
        workspaceTitle: 'Accounts Workspace',
        workspaceText: 'Review folio payments, invoices, and collection activity from the billing center.',
        workspacePath: '/folio/payments',
        workspaceLabel: 'Open Payments',
        showAssignmentTabs: false,
        overviewTitle: 'Accounts Snapshot',
      }
    case 'maintenance':
      return {
        workspaceTitle: 'Maintenance Workspace',
        workspaceText: 'Follow room maintenance status, readiness, and repair-related room availability.',
        workspacePath: '/rooms/maintenance',
        workspaceLabel: 'Open Maintenance Rooms',
        showAssignmentTabs: false,
        overviewTitle: 'Maintenance Snapshot',
      }
    case 'security':
      return {
        workspaceTitle: 'Security Workspace',
        workspaceText: 'Review movement and operational logs to keep watch on site activity.',
        workspacePath: '/activity/logs',
        workspaceLabel: 'Open Activity Log',
        showAssignmentTabs: false,
        overviewTitle: 'Security Snapshot',
      }
    default:
      return {
        workspaceTitle: 'Operations Workspace',
        workspaceText: 'Use the main dashboard to continue operational work.',
        workspacePath: '/dashboard',
        workspaceLabel: 'Open Dashboard',
        showAssignmentTabs: false,
        overviewTitle: 'Operational Snapshot',
      }
  }
}

export default function StaffDetail() {
  const token = useSelector((s) => s.auth.accesstoken)
  const navigate = useNavigate()
  const { id } = useParams()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('profile')
  const [staff, setStaff] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [history, setHistory] = useState([])
  const [shifts, setShifts] = useState([])
  const [performance, setPerformance] = useState(null)
  const [busyAction, setBusyAction] = useState(false)
  const [shiftNote, setShiftNote] = useState('')
  // Salary/payroll state
  const [salaryRecords, setSalaryRecords] = useState([])
  const [salaryLoading, setSalaryLoading] = useState(false)
  const [salaryModal, setSalaryModal] = useState(false)
  const [salaryForm, setSalaryForm] = useState({ month: '', amount: '', status: 'unpaid', paid_on: '' })
  const [salarySaving, setSalarySaving] = useState(false)

  // Increment state
  const [incrementTab, setIncrementTab] = useState(false)
  const [increments, setIncrements] = useState([])
  const [incrementLoading, setIncrementLoading] = useState(false)
  const [incrementModal, setIncrementModal] = useState(false)
  const [incrementForm, setIncrementForm] = useState({ amount: '', reason: '' })
  const [incrementSaving, setIncrementSaving] = useState(false)

  const load = useCallback(async () => {
    if (!token || !id) return
    setLoading(true)
    try {
      const [detailRes, perfRes, shiftRes] = await Promise.all([
        getWithAuth(`/staff/${id}`, token),
        getWithAuth(`/staff/${id}/performance`, token, { params: { on_time_target_min: ON_TIME_TARGET_MIN } }),
        getWithAuth(`/staff/${id}/shifts?page=1&page_size=20`, token),
      ])

      const body = detailRes?.data?.data || {}
      setStaff(body.staff || null)
      setAssignments(Array.isArray(body.current_assignments) ? body.current_assignments : [])
      setHistory(Array.isArray(body.history) ? body.history : [])
      setPerformance(perfRes?.data?.data || null)
      setShifts(Array.isArray(shiftRes?.data?.data?.items) ? shiftRes.data.data.items : [])
      // Load salary records
      try {
        setSalaryLoading(true)
        const res = await getWithAuth(`/staff/${id}/salaries`, token)
        setSalaryRecords(res?.data?.data || [])
      } catch {
        setSalaryRecords([])
      } finally {
        setSalaryLoading(false)
      }
      // Load increments
      try {
        setIncrementLoading(true)
        const incRes = await getWithAuth(`/staff/${id}/increments`, token)
        setIncrements(incRes?.data || [])
      } catch {
        setIncrements([])
      } finally {
        setIncrementLoading(false)
      }
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || 'Failed to load staff details')
      navigate('/staff')
    } finally {
      setLoading(false)
    }
  }, [token, id, navigate])

  useEffect(() => {
    load()
  }, [load])

  const summary = useMemo(() => {
    const completed = history.filter((h) => h.current_status === 'available').length
    const minutes = history.reduce((acc, h) => acc + Number(h.duration_min || 0), 0)
    return { completed, minutes }
  }, [history])
  const roleInfo = useMemo(() => roleMeta(staff?.role), [staff?.role])
  const housekeepingRole = useMemo(() => isHousekeepingRole(staff?.role), [staff?.role])
  const workspaceTarget = useMemo(() => {
    const base = roleMeta(staff?.role)
    if (String(staff?.role || '').trim().toLowerCase() === 'manager') {
      const query = new URLSearchParams()
      if (staff?.name) query.set('q', staff.name)
      if (staff?.role) query.set('role', staff.role)
      return { ...base, workspacePath: `${base.workspacePath}?${query.toString()}` }
    }
    return base
  }, [staff?.name, staff?.role])

  async function onCheckIn() {
    if (!token || !id || busyAction) return
    try {
      setBusyAction(true)
      await postWithAuth(`/staff/${id}/shifts/check-in`, { notes: shiftNote }, token)
      toast.success('Check-in recorded')
      setShiftNote('')
      load()
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || 'Failed to check in')
    } finally {
      setBusyAction(false)
    }
  }

  async function onCheckOut() {
    if (!token || !id || busyAction) return
    try {
      setBusyAction(true)
      await postWithAuth(`/staff/${id}/shifts/check-out`, { notes: shiftNote }, token)
      toast.success('Check-out recorded')
      setShiftNote('')
      load()
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || 'Failed to check out')
    } finally {
      setBusyAction(false)
    }
  }

  // Salary actions
  async function onSalarySave(e) {
    e.preventDefault()
    if (!token || !id) return
    setSalarySaving(true)
    try {
      const payload = {
        month: salaryForm.month,
        amount: Number(salaryForm.amount),
        status: salaryForm.status,
        paid_on: salaryForm.status === 'paid' && salaryForm.paid_on ? salaryForm.paid_on : null,
      }
      await postWithAuth(`/staff/${id}/salaries`, payload, token)
      toast.success('Salary record added')
      setSalaryModal(false)
      setSalaryForm({ month: '', amount: '', status: 'unpaid', paid_on: '' })
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add salary record')
    } finally {
      setSalarySaving(false)
    }
  }

  async function onSalaryStatusChange(salary, status) {
    if (!token || !salary?.id) return
    setSalarySaving(true)
    try {
      const payload = { status }
      if (status === 'paid') payload.paid_on = new Date().toISOString()
      await patchWithAuth(`/staff/salaries/${salary.id}/status`, payload, token)
      toast.success('Salary status updated')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update salary status')
    } finally {
      setSalarySaving(false)
    }
  }

  // Increment actions
  async function onIncrementSave(e) {
    e.preventDefault()
    if (!token || !id) return
    setIncrementSaving(true)
    try {
      const payload = {
        amount: Number(incrementForm.amount),
        reason: incrementForm.reason,
      }
      await postWithAuth(`/staff/${id}/increment`, payload, token)
      toast.success('Increment added')
      setIncrementModal(false)
      setIncrementForm({ amount: '', reason: '' })
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add increment')
    } finally {
      setIncrementSaving(false)
    }
  }

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-id-badge"></i>
        </div>
        <div className="header-title">
          <h1>Staff Management</h1>
          <small>Staff Profile</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="btn-group" id="buttonexport">
                  <a href="#"><h4>Staff details</h4></a>
                </div>
                <div>
                  <button className="btn btn-default" style={{ marginRight: 8 }} onClick={() => navigate('/staff')}>Back</button>
                  <button className="btn btn-primary" onClick={() => navigate(`/staff/${id}/edit`)}>Edit Profile</button>
                </div>
              </div>
              <div className="panel-body">
                {loading ? (
                  <div className="text-center" style={{ padding: '24px 0' }}>
                    <i className="fa fa-spinner fa-spin"></i> Loading profile...
                  </div>
                ) : !staff ? (
                  <div className="alert alert-warning">Staff not found.</div>
                ) : (
                  <>
                    <div className="row" style={{ marginBottom: 12 }}>
                      <div className="col-sm-2">
                        {staff.photo ? (
                          <img src={resolveAssetUrl(staff.photo, 'staff')} alt={staff.name} style={{ width: 110, height: 110, borderRadius: 55, objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 110, height: 110, borderRadius: 55, background: '#f1f3f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fa fa-user" style={{ fontSize: 30, color: '#a0a4a8' }}></i>
                          </div>
                        )}
                      </div>
                      <div className="col-sm-10">
                        <h3 style={{ marginTop: 10, marginBottom: 8 }}>{staff.name}</h3>
                        <p style={{ marginBottom: 4 }}><strong>Role:</strong> {staff.role || '-'}</p>
                        <p style={{ marginBottom: 4 }}><strong>Phone:</strong> {staff.phone}</p>
                        <p style={{ marginBottom: 4 }}><strong>Email:</strong> {staff.email || '-'}</p>
                        <p style={{ marginBottom: 4 }}><strong>Join Date:</strong> {staff.join_date || '-'}</p>
                        <p style={{ marginBottom: 0 }}>
                          {staff.status ? <span className="label label-success">Active</span> : <span className="label label-default">Inactive</span>}
                        </p>
                      </div>
                    </div>

                    <div className="alert alert-info" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <strong>{workspaceTarget.workspaceTitle}</strong>
                        <div style={{ marginTop: 4 }}>{roleInfo.workspaceText}</div>
                      </div>
                      <button className="btn btn-default" type="button" onClick={() => navigate(workspaceTarget.workspacePath)}>
                        {workspaceTarget.workspaceLabel}
                      </button>
                    </div>

                    <ul className="nav nav-tabs" style={{ marginBottom: 12 }}>
                      <li className={activeTab === 'profile' ? 'active' : ''}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('profile') }}>Profile</a>
                      </li>
                      {roleInfo.showAssignmentTabs && (
                        <li className={activeTab === 'assignments' ? 'active' : ''}>
                          <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('assignments') }}>Current Assignments</a>
                        </li>
                      )}
                      {roleInfo.showAssignmentTabs && (
                        <li className={activeTab === 'history' ? 'active' : ''}>
                          <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('history') }}>Assignment History</a>
                        </li>
                      )}
                      <li className={activeTab === 'attendance' ? 'active' : ''}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('attendance') }}>Attendance & Metrics</a>
                      </li>
                      <li className={activeTab === 'salary' ? 'active' : ''}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('salary') }}>Salary / Payroll</a>
                      </li>
                      <li className={activeTab === 'increment' ? 'active' : ''}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('increment') }}>Salary Increments</a>
                      </li>
                    </ul>
                    {activeTab === 'increment' && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <h4 style={{ margin: 0 }}>Salary Increment History</h4>
                          <button className="btn btn-primary" onClick={() => setIncrementModal(true)} disabled={incrementSaving}>Add Increment</button>
                        </div>
                        {incrementLoading ? (
                          <div className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading increments...</div>
                        ) : increments.length === 0 ? (
                          <div className="alert alert-info">No increment records found.</div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-bordered table-striped">
                              <thead>
                                <tr className="info">
                                  <th>Date</th>
                                  <th>Increment Amount</th>
                                  <th>New Salary</th>
                                  <th>Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {increments.map((inc) => (
                                  <tr key={inc.id}>
                                    <td>{inc.created_at ? new Date(inc.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                    <td>₹ {Number(inc.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td>₹ {Number(inc.new_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td>{inc.reason || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {incrementModal && (
                          <div className="modal fade in" style={{ display: 'block', background: 'rgba(0,0,0,0.3)' }}>
                            <div className="modal-dialog">
                              <div className="modal-content">
                                <form onSubmit={onIncrementSave}>
                                  <div className="modal-header">
                                    <button type="button" className="close" onClick={() => setIncrementModal(false)}>&times;</button>
                                    <h4 className="modal-title">Add Salary Increment</h4>
                                  </div>
                                  <div className="modal-body">
                                    <div className="form-group">
                                      <label>Increment Amount</label>
                                      <input type="number" className="form-control" value={incrementForm.amount} onChange={e => setIncrementForm(f => ({ ...f, amount: e.target.value }))} required min="0" step="0.01" />
                                    </div>
                                    <div className="form-group">
                                      <label>Reason / Notes</label>
                                      <input type="text" className="form-control" value={incrementForm.reason} onChange={e => setIncrementForm(f => ({ ...f, reason: e.target.value }))} maxLength={200} />
                                    </div>
                                  </div>
                                  <div className="modal-footer">
                                    <button type="button" className="btn btn-default" onClick={() => setIncrementModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={incrementSaving}>{incrementSaving ? 'Saving...' : 'Save'}</button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'salary' && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <h4 style={{ margin: 0 }}>Salary / Payroll Records</h4>
                          <button className="btn btn-primary" onClick={() => { setSalaryForm(f => ({ ...f, amount: staff?.gross_salary || '', month: new Date().toISOString().slice(0, 7) })); setSalaryModal(true) }} disabled={salarySaving}>Add Salary Record</button>
                        </div>
                        {salaryLoading ? (
                          <div className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading salary records...</div>
                        ) : salaryRecords.length === 0 ? (
                          <div className="alert alert-info">No salary records found.</div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-bordered table-striped">
                              <thead>
                                <tr className="info">
                                  <th>Month</th>
                                  <th>Amount</th>
                                  <th>Status</th>
                                  <th>Paid On</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {salaryRecords.map((s) => (
                                  <tr key={s.id}>
                                    <td>{s.month}</td>
                                    <td>₹ {Number(s.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td>{s.status === 'paid' ? <span className="label label-success">Paid</span> : <span className="label label-warning">Unpaid</span>}</td>
                                    <td>{s.paid_on ? s.paid_on.slice(0, 10) : '-'}</td>
                                    <td>
                                      {s.status === 'unpaid' && (
                                        <button className="btn btn-xs btn-success" disabled={salarySaving} onClick={() => onSalaryStatusChange(s, 'paid')}>Mark as Paid</button>
                                      )}
                                      {s.status === 'paid' && (
                                        <button className="btn btn-xs btn-warning" disabled={salarySaving} onClick={() => onSalaryStatusChange(s, 'unpaid')}>Mark as Unpaid</button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {salaryModal && (
                          <div className="modal fade in" style={{ display: 'block', background: 'rgba(0,0,0,0.3)' }}>
                            <div className="modal-dialog">
                              <div className="modal-content">
                                <form onSubmit={onSalarySave}>
                                  <div className="modal-header">
                                    <button type="button" className="close" onClick={() => setSalaryModal(false)}>&times;</button>
                                    <h4 className="modal-title">Add Salary Record</h4>
                                  </div>
                                  <div className="modal-body">
                                    <div className="form-group">
                                      <label>Month (YYYY-MM)</label>
                                      <input type="month" className="form-control" value={salaryForm.month} onChange={e => setSalaryForm(f => ({ ...f, month: e.target.value }))} required />
                                    </div>
                                    <div className="form-group">
                                      <label>Amount</label>
                                      <input type="number" className="form-control" value={salaryForm.amount} onChange={e => setSalaryForm(f => ({ ...f, amount: e.target.value }))} required min="0" step="0.01" />
                                    </div>
                                    <div className="form-group">
                                      <label>Status</label>
                                      <select className="form-control" value={salaryForm.status} onChange={e => setSalaryForm(f => ({ ...f, status: e.target.value }))}>
                                        <option value="unpaid">Unpaid</option>
                                        <option value="paid">Paid</option>
                                      </select>
                                    </div>
                                    {salaryForm.status === 'paid' && (
                                      <div className="form-group">
                                        <label>Paid On</label>
                                        <input type="date" className="form-control" value={salaryForm.paid_on} onChange={e => setSalaryForm(f => ({ ...f, paid_on: e.target.value }))} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="modal-footer">
                                    <button type="button" className="btn btn-default" onClick={() => setSalaryModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={salarySaving}>{salarySaving ? 'Saving...' : 'Save'}</button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'profile' && (
                      <div className="well">
                        <p><strong>Notes:</strong></p>
                        <p className="text-muted" style={{ marginBottom: 0 }}>{staff.notes || 'No notes available.'}</p>
                      </div>
                    )}

                    {activeTab === 'assignments' && roleInfo.showAssignmentTabs && (
                      <div>
                        {assignments.length === 0 ? (
                          <div className="alert alert-info" style={{ marginBottom: 0 }}>No active room assignments right now.</div>
                        ) : (
                          <table className="table table-bordered table-striped">
                            <thead>
                              <tr className="info">
                                <th>Room</th>
                                <th>Status</th>
                                <th>Start Time</th>
                                <th>Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assignments.map((a) => (
                                <tr key={a.id}>
                                  <td>{a.room_number || `#${a.room_id}`}</td>
                                  <td>{formatAssignmentStatus(a.status)}</td>
                                  <td>{formatDateTime(a.start_time)}</td>
                                  <td>{a.notes || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {activeTab === 'history' && roleInfo.showAssignmentTabs && (
                      <div>
                        <div style={{ marginBottom: 10 }}>
                          <span className="label label-info" style={{ marginRight: 8 }}>Completed: {summary.completed}</span>
                          <span className="label label-default">Minutes Worked: {summary.minutes}</span>
                        </div>
                        {history.length === 0 ? (
                          <div className="alert alert-info" style={{ marginBottom: 0 }}>No assignment history found.</div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-bordered table-striped">
                              <thead>
                                <tr className="info">
                                  <th>Room</th>
                                  <th>From</th>
                                  <th>To</th>
                                  <th>Start</th>
                                  <th>End</th>
                                  <th>Duration (min)</th>
                                  <th>Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {history.map((h) => (
                                  <tr key={h.id}>
                                    <td>{h.room_number || h.room_id}</td>
                                    <td>{h.previous_status || '-'}</td>
                                    <td>{h.current_status || '-'}</td>
                                    <td>{formatDateTime(h.start_time)}</td>
                                    <td>{formatDateTime(h.end_time)}</td>
                                    <td>{formatHistoryDuration(h.duration_min, h.start_time, h.end_time)}</td>
                                    <td>{h.notes || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'attendance' && (
                      <div>
                        <div className="row" style={{ marginBottom: 10 }}>
                          <div className="col-sm-3"><span className="label label-info">Total Shifts: {Number(performance?.attendance_total_shifts || 0)}</span></div>
                          <div className="col-sm-3"><span className="label label-success">Closed Shifts: {Number(performance?.attendance_closed_shifts || 0)}</span></div>
                          <div className="col-sm-3"><span className="label label-primary">Avg Shift: {formatDurationMinutes(performance?.attendance_avg_shift_min)}</span></div>
                          <div className="col-sm-3">
                            {housekeepingRole ? (
                              <span className="label label-warning">On-Time Rate: {Number(performance?.quality_on_time_rate || 0).toFixed(1)}%</span>
                            ) : (
                              <span className="label label-warning">Attendance Reliability: {Number(performance?.attendance_closed_shifts || 0) > 0 ? 'Tracked' : 'No closed shifts yet'}</span>
                            )}
                          </div>
                        </div>

                        <div className="well" style={{ marginBottom: 12 }}>
                          <div className="row">
                            <div className="col-sm-8">
                              <input
                                className="form-control"
                                placeholder="Optional shift note"
                                value={shiftNote}
                                onChange={(e) => setShiftNote(e.target.value)}
                                disabled={busyAction}
                              />
                            </div>
                            <div className="col-sm-4 text-right">
                              <button className="btn btn-success" style={{ marginRight: 8 }} disabled={busyAction} onClick={onCheckIn}>Check In</button>
                              <button className="btn btn-danger" disabled={busyAction} onClick={onCheckOut}>Check Out</button>
                            </div>
                          </div>
                        </div>

                        <div className="table-responsive">
                          <table className="table table-bordered table-striped">
                            <thead>
                              <tr className="info">
                                <th>Shift Date</th>
                                <th>Check-In</th>
                                <th>Check-Out</th>
                                <th>Minutes</th>
                                <th>Status</th>
                                <th>Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shifts.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="text-center text-muted">No shifts recorded yet.</td>
                                </tr>
                              ) : shifts.map((s) => (
                                <tr key={s.id}>
                                  <td>{s.shift_date || '-'}</td>
                                  <td>{formatDateTime(s.check_in_at)}</td>
                                  <td>{formatDateTime(s.check_out_at)}</td>
                                  <td>{formatDurationMinutes(s.minutes_worked)}</td>
                                  <td>{s.status === 'open' ? <span className="label label-warning">Open</span> : <span className="label label-success">Closed</span>}</td>
                                  <td>{s.notes || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
