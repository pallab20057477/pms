import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { getWithAuth, putWithAuth } from '../api'
import { resolveAssetUrl } from '../Functions/assetUrl'
import toast from 'react-hot-toast'
import './GuestDetailModern.css'

function renderLoyaltyBadge(tier) {
  const t = String(tier || '').trim().toLowerCase()
  if (t === 'vip') return <span className="loyalty-badge loyalty-vip">VIP</span>
  if (t === 'platinum') return <span className="loyalty-badge loyalty-platinum">Platinum</span>
  if (t === 'gold') return <span className="loyalty-badge loyalty-gold">Gold</span>
  if (t === 'silver') return <span className="loyalty-badge loyalty-silver">Silver</span>
  return <span className="loyalty-badge loyalty-standard">Standard</span>
}

export default function GuestDetail() {
  const token = useSelector((s) => s.auth.accesstoken)
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [proofRows, setProofRows] = useState([{ id: Date.now(), docType: '', file: null, url: '', existing: false }])
  const [guest, setGuest] = useState(null)
  const [history, setHistory] = useState([])
  const [stats, setStats] = useState({ total_previous_stays: 0, last_visit_date: null })

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    gender: '',
    nationality: '',
    date_of_birth: '',
    loyalty_tier: '',
    id_verified: false,
    preferences: '',
    city: '',
    state: '',
    district: '',
    pincode: '',
    country: '',
  })

  function formatDisplayDate(value) {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    if (d.getUTCFullYear() < 1900) return '-'
    return d.toLocaleDateString('en-GB')
  }

  function cleanPreferences(raw) {
    if (!raw) return ''
    return raw
      .replace(/Gender:\s*\S*/gi, '')
      .replace(/Customer Notes:\s*/gi, '')
      .replace(/Proof Documents:[^\n]*/gi, '')
      .trim()
  }

  function fillForm(g, addr) {
    // addr is the parsed address object from the API response
    const a = addr || {}
    setForm({
      name: g?.name || '',
      phone: g?.phone || '',
      email: g?.email || '',
      gender: g?.gender || '',
      nationality: g?.nationality || '',
      date_of_birth: g?.date_of_birth || '',
      loyalty_tier: g?.loyalty_tier || '',
      id_verified: !!g?.id_verified,
      preferences: cleanPreferences(g?.preferences),
      city: a.city || '',
      state: a.state || '',
      district: a.district || '',
      pincode: a.pincode || '',
      country: a.country || g?.country || '',
    })

    // Pre-fill proofRows from proof_documents JSON
    let rows = []
    if (g?.proof_documents) {
      try {
        const docs = JSON.parse(g.proof_documents)
        if (Array.isArray(docs)) {
          rows = docs.map((d, i) => ({
            id: Date.now() + i,
            docType: d.type || '',
            file: null,
            url: d.url || '',
            existing: true,
          }))
        }
      } catch { }
    }
    // Always have one empty row for new upload
    rows.push({ id: Date.now() + 999, docType: '', file: null, url: '', existing: false })
    setProofRows(rows)
  }

  function statusClassName(status) {
    const s = String(status || '').toLowerCase().replace(/-/g, '_')
    if (s === 'checked_in') return 'checked-in'
    if (s === 'reserved') return 'reserved'
    if (s === 'cancelled') return 'cancelled'
    if (s === 'checked_out' || s === 'completed') return 'completed'
    return 'default'
  }

  const load = useCallback(async () => {
    if (!token || !id) return
    setLoading(true)
    try {
      const res = await getWithAuth(`/guests/${id}`, token)
      const body = res.data || {}
      setGuest(body.guest || null)
      setHistory(body.booking_history || [])
      setStats({
        total_previous_stays: Number(body.total_previous_stays || 0),
        last_visit_date: body.last_visit_date || null,
      })
      fillForm(body.guest || {}, body.address || {})
    } catch (e) {
      console.error(e)
      toast.error(e?.response?.data?.error || 'Failed to load customer profile')
      navigate('/guests')
    } finally {
      setLoading(false)
    }
  }, [token, id, navigate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (searchParams.get('edit') === '1' && guest) setEditMode(true)
  }, [searchParams, guest])

  function onChange(e) {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  function addProofRow() {
    setProofRows((prev) => [...prev, { id: Date.now() + Math.random(), docType: '', file: null, url: '', existing: false }])
  }

  function updateProofRow(rowId, key, value) {
    setProofRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [key]: value } : r)))
  }

  function removeProofRow(rowId) {
    setProofRows((prev) => {
      const filtered = prev.filter((r) => r.id !== rowId)
      if (filtered.length === 0) return [{ id: Date.now(), docType: '', file: null, url: '', existing: false }]
      return filtered
    })
  }

  function cancelEdit() {
    setEditMode(false)
    // re-parse address from the stored guest data
    let addr = {}
    try { addr = JSON.parse(guest?.address || '{}') } catch { }
    fillForm(guest, addr)
    setPhoto(null)
  }

  async function onSave() {
    if (!token || !guest) return
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Name and phone are required')
      return
    }

    // Validate new proof rows: both type and file required together
    const invalidProof = proofRows.some(
      (r) => !r.existing && ((r.docType && !r.file) || (!r.docType && r.file))
    )
    if (invalidProof) {
      toast.error('Each new proof document requires both a type and a file')
      return
    }

    const fd = new FormData()
    fd.append('name', form.name.trim())
    fd.append('phone', form.phone.trim())
    fd.append('email', form.email.trim())
    fd.append('gender', form.gender)
    fd.append('nationality', form.nationality.trim())
    fd.append('date_of_birth', form.date_of_birth)
    fd.append('loyalty_tier', form.loyalty_tier)
    fd.append('id_verified', String(form.id_verified))
    fd.append('preferences', form.preferences.trim())
    fd.append('country', form.country.trim())
    fd.append('state', form.state.trim())
    fd.append('city', form.city.trim())
    fd.append('district', form.district.trim())
    fd.append('pincode', form.pincode.trim())

    if (photo) fd.append('photo', photo)

    // New proof documents
    proofRows.forEach((row) => {
      if (!row.existing && row.file && row.docType) {
        fd.append('proof_document_types', row.docType)
        fd.append('proof_documents', row.file)
      }
    })

    // Retained existing documents - backend merges these with new uploads
    const retained = proofRows
      .filter((r) => r.existing && r.url)
      .map((r) => ({ type: r.docType, url: r.url }))
    fd.append('retained_proof_documents', JSON.stringify(retained))

    try {
      setSaving(true)
      const res = await putWithAuth(`/guests/${guest.id}`, fd, token)
      const updatedGuest = res.data
      setGuest(updatedGuest)

      // Parse address from the guest object
      let addr = {}
      try {
        addr = JSON.parse(updatedGuest?.address || '{}')
      } catch { }

      fillForm(updatedGuest, addr)
      setEditMode(false)
      setPhoto(null)
      toast.success('Customer updated successfully')
    } catch (e) {
      console.error(e)
      toast.error(e?.response?.data?.error || 'Failed to update customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="guest-page-header">
        <div className="guest-page-header-icon">
          <i className="fa-solid fa-users"></i>
        </div>
        <div className="guest-page-header-title">
          <h1>Customer Management</h1>
          <p>Customer Profile</p>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag guest-detail-panel">
              <div className="panel-heading guest-detail-heading">
                <div>
                  <h4 className="guest-detail-title">Customer Details</h4>
                  <p className="guest-detail-subtitle">Review identity, contact data, and booking history.</p>
                </div>
                <div className="guest-detail-actions">
                  <button className="btn btn-default guest-detail-back" onClick={() => navigate('/guests')}>Back</button>
                  {!editMode ? (
                    <button className="btn btn-primary guest-detail-edit" type="button" onClick={() => setEditMode(true)}>Edit Customer</button>
                  ) : (
                    <button className="btn btn-warning guest-detail-cancel" type="button" onClick={cancelEdit}>Cancel Edit</button>
                  )}
                </div>
              </div>

              <div className="panel-body guest-detail-body">
                {loading ? (
                  <div className="text-center guest-detail-loading">
                    <i className="fa fa-spinner fa-spin"></i> Loading profile...
                  </div>
                ) : !guest ? (
                  <div className="alert alert-warning">Customer not found.</div>
                ) : (
                  <>
                    {/* ── Profile summary (always visible) ── */}
                    <div className="row guest-profile-row">
                      <div className="col-sm-3 col-md-2">
                        {guest.photo ? (
                          <img src={resolveAssetUrl(guest.photo, 'guests')} alt={guest.name} className="guest-profile-avatar" />
                        ) : (
                          <div className="guest-profile-avatar guest-profile-avatar-fallback">
                            <i className="fa fa-user"></i>
                          </div>
                        )}
                      </div>
                      <div className="col-sm-9 col-md-10">
                        <h3 className="guest-profile-name">{guest.name}</h3>
                        <div className="guest-profile-chips">
                          <span className="label label-info">Stays: {stats.total_previous_stays}</span>
                          <span className="label label-default">Last Visit: {formatDisplayDate(stats.last_visit_date)}</span>
                          <span className={`label ${guest.id_verified ? 'label-success' : 'label-warning'}`}>
                            {guest.id_verified ? 'ID Verified' : 'Verification Pending'}
                          </span>
                        </div>
                        <div className="guest-info-grid">
                          <div className="guest-info-card">
                            <div className="guest-info-label">Contact</div>
                            <div className="guest-info-value">{guest.phone || '-'}</div>
                            <div className="guest-info-subvalue">{guest.email || 'No email recorded'}</div>
                          </div>
                          <div className="guest-info-card">
                            <div className="guest-info-label">Identity</div>
                            <div className="guest-info-value">{guest.gender ? `Gender: ${guest.gender}` : '-'}</div>
                            <div className="guest-info-subvalue">Nationality: <span style={{ textTransform: 'capitalize' }}>{guest.nationality || '-'}</span></div>
                            <div className="guest-info-subvalue">DOB: {formatDisplayDate(guest.date_of_birth)}</div>
                            <div className="guest-info-subvalue" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <span>Loyalty Tier:</span> {renderLoyaltyBadge(guest.loyalty_tier)}
                            </div>
                          </div>
                          <div className="guest-info-card guest-info-card-wide">
                            <div className="guest-info-label">Documents</div>
                            <div className="guest-info-value">Proof Document</div>
                            <div className="guest-info-subvalue">
                              {guest.proof_document ? (
                                <a className="btn btn-xs btn-primary guest-document-btn" href={resolveAssetUrl(guest.proof_document, 'guests')} target="_blank" rel="noreferrer">
                                  <i className="fa-solid fa-folder-open" /> View Document
                                </a>
                              ) : (
                                <span className="text-muted">No proof document uploaded</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── Edit form ── */}
                    {editMode && (
                      <div className="guest-edit-shell">
                        <div className="guest-edit-card-title">Edit customer profile</div>
                        <div className="guest-edit-card-subtitle">Update identity, verification, and profile information.</div>
                        <div className="guest-edit-card">

                          {/* Primary Details */}
                          <div className="guest-section">
                            <div className="guest-section-title">Primary Details</div>
                            <div className="row">
                              <div className="col-sm-6 form-group">
                                <label>Full Name <span className="text-danger">*</span></label>
                                <input className="form-control guest-edit-input" name="name" value={form.name} onChange={onChange} required />
                              </div>
                              <div className="col-sm-6 form-group">
                                <label>Phone <span className="text-danger">*</span></label>
                                <input className="form-control guest-edit-input" name="phone" value={form.phone} onChange={onChange} required />
                              </div>
                            </div>
                          </div>

                          {/* Identity & Contact */}
                          <div className="guest-section">
                            <div className="guest-section-title">Identity &amp; Contact</div>
                            <div className="row">
                              <div className="col-sm-6 form-group">
                                <label>Email</label>
                                <input className="form-control guest-edit-input" type="email" name="email" value={form.email} onChange={onChange} />
                              </div>
                              <div className="col-sm-6 form-group">
                                <label>Gender</label>
                                <select className="form-control guest-edit-input" name="gender" value={form.gender} onChange={onChange}>
                                  <option value="">Select</option>
                                  <option value="Male">Male</option>
                                  <option value="Female">Female</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                            </div>

                            <div className="row">
                              <div className="col-sm-4 form-group">
                                <label>Nationality</label>
                                <input className="form-control guest-edit-input" name="nationality" value={form.nationality} onChange={onChange} placeholder="e.g. Indian, American" />
                              </div>
                              <div className="col-sm-4 form-group">
                                <label>Date of Birth</label>
                                <input className="form-control guest-edit-input" type="date" name="date_of_birth" value={form.date_of_birth} onChange={onChange} />
                              </div>
                              <div className="col-sm-4 form-group">
                                <label>Loyalty / VIP Tier</label>
                                <select className="form-control guest-edit-input guest-select" name="loyalty_tier" value={form.loyalty_tier || 'Standard'} onChange={onChange}>
                                  <option value="Standard">Standard</option>
                                  <option value="Silver">Silver</option>
                                  <option value="Gold">Gold</option>
                                  <option value="Platinum">Platinum</option>
                                  <option value="VIP">VIP</option>
                                </select>
                              </div>
                            </div>

                            <div className="row">
                              <div className="col-sm-6 form-group">
                                <label>Photo</label>
                                <input className="form-control guest-edit-input" type="file" accept="image/*"
                                  onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
                                {photo && <small className="text-muted">{photo.name}</small>}
                              </div>
                            </div>

                            <div className="row">
                              <div className="col-sm-12 form-group">
                                <label>Proof Documents</label>
                                <div className="table-responsive guest-proof-table-wrap">
                                  <table className="table table-bordered table-striped guest-proof-table">
                                    <thead>
                                      <tr>
                                        <th style={{ width: '28%' }}>Document Type</th>
                                        <th>File / Link</th>
                                        <th style={{ width: '22%' }}>Selected</th>
                                        <th style={{ width: 90 }}>Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {proofRows.map((row) => (
                                        <tr key={row.id}>
                                          <td>
                                            <select
                                              className="form-control guest-edit-input guest-proof-select"
                                              value={row.docType}
                                              onChange={(e) => updateProofRow(row.id, 'docType', e.target.value)}
                                              disabled={row.existing}
                                            >
                                              <option value="">Select Type</option>
                                              <option value="passport">Passport</option>
                                              <option value="aadhaar">Aadhaar</option>
                                              <option value="national_id">National ID</option>
                                              <option value="driving_license">Driving License</option>
                                              <option value="voter_id">Voter ID</option>
                                              <option value="other">Other</option>
                                            </select>
                                          </td>
                                          <td>
                                            {row.existing && row.url ? (
                                              <a href={resolveAssetUrl(row.url, 'guests')} target="_blank" rel="noopener noreferrer">
                                                View existing
                                              </a>
                                            ) : (
                                              <input
                                                className="form-control guest-edit-input guest-file"
                                                type="file"
                                                accept="application/pdf,image/*"
                                                onChange={(e) => updateProofRow(row.id, 'file', e.target.files?.[0] || null)}
                                              />
                                            )}
                                          </td>
                                          <td className="text-muted" style={{ fontSize: 12 }}>
                                            {row.existing ? row.url.split('/').pop() : (row.file?.name || '-')}
                                          </td>
                                          <td>
                                            <button type="button" className="btn btn-xs btn-danger"
                                              onClick={() => removeProofRow(row.id)}>
                                              Remove
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <button type="button" className="btn btn-default btn-sm" onClick={addProofRow}>
                                  + Add New Proof
                                </button>
                                <small className="text-muted" style={{ display: 'block', marginTop: 6 }}>
                                  Optional. If adding a row, both document type and file are required.
                                </small>
                              </div>
                            </div>
                          </div>

                          {/* Address */}
                          <div className="guest-section">
                            <div className="guest-section-title">Address</div>
                            <div className="row">
                              <div className="col-sm-3 form-group">
                                <label>Country</label>
                                <input className="form-control guest-edit-input" name="country" value={form.country} onChange={onChange} placeholder="Country" />
                              </div>
                              <div className="col-sm-3 form-group">
                                <label>State</label>
                                <input className="form-control guest-edit-input" name="state" value={form.state} onChange={onChange} placeholder="State" />
                              </div>
                              <div className="col-sm-3 form-group">
                                <label>City</label>
                                <input className="form-control guest-edit-input" name="city" value={form.city} onChange={onChange} placeholder="City" />
                              </div>
                              <div className="col-sm-3 form-group">
                                <label>District</label>
                                <input className="form-control guest-edit-input" name="district" value={form.district} onChange={onChange} placeholder="District" />
                              </div>
                            </div>
                            <div className="row">
                              <div className="col-sm-4 form-group">
                                <label>Pincode</label>
                                <input className="form-control guest-edit-input" name="pincode" value={form.pincode} onChange={onChange} placeholder="Pincode" />
                              </div>
                            </div>
                          </div>

                          {/* Notes & Verification */}
                          <div className="guest-section">
                            <div className="guest-section-title">Notes &amp; Verification</div>
                            <div className="row">
                              <div className="col-sm-12 form-group">
                                <label>Preferences / Notes</label>
                                <textarea className="form-control guest-edit-input" rows={4} name="preferences" value={form.preferences} onChange={onChange}
                                  placeholder="Late check-in, smoking preference, dietary notes, etc." />
                              </div>
                            </div>
                            <label className="guest-edit-check">
                              <input type="checkbox" name="id_verified" checked={form.id_verified} onChange={onChange} />
                              &nbsp;ID Verified
                            </label>
                          </div>

                          <div className="guest-edit-footer">
                            <div />
                            <div className="guest-edit-actions">
                              <button className="btn btn-default" type="button" onClick={cancelEdit}>Cancel</button>
                              <button className="btn btn-success" type="button" onClick={onSave} disabled={saving}>
                                {saving ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* ── Booking history ── */}
                    {!editMode && (
                      <>
                        <h4 className="guest-history-title">Booking History</h4>
                        <div className="table-responsive guest-history-wrap">
                          <table className="table table-bordered table-striped table-hover guest-history-table">
                            <thead>
                              <tr className="info">
                                <th>Booking ID</th>
                                <th>Room</th>
                                <th>Check-in</th>
                                <th>Check-out</th>
                                <th>Status</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="text-center text-muted guest-history-empty">
                                    No booking history available.
                                  </td>
                                </tr>
                              ) : history.map((b) => (
                                <tr key={b.id}>
                                  <td>{b.booking_code || `#${b.id}`}</td>
                                  <td>{b.room_number || b.room_id || '-'}</td>
                                  <td>{b.check_in_date ? new Date(b.check_in_date).toLocaleDateString('en-GB') : '-'}</td>
                                  <td>{b.check_out_date ? new Date(b.check_out_date).toLocaleDateString('en-GB') : '-'}</td>
                                  <td>
                                    <span className={`guest-status-chip ${statusClassName(b.status)}`}>
                                      {b.status ? String(b.status).replace(/_/g, ' ') : '-'}
                                    </span>
                                  </td>
                                  <td>
                                    {typeof b.grand_total === 'number'
                                      ? `Rs ${b.grand_total.toFixed(2)}`
                                      : typeof b.total_amount === 'number'
                                        ? `Rs ${b.total_amount.toFixed(2)}`
                                        : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
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
