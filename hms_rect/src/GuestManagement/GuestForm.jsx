import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { postWithAuth } from '../api'
import toast from 'react-hot-toast'
import './GuestFormModern.css'

const INITIAL = {
  name: '',
  country_code: '+91',
  phone: '',
  email: '',
  gender: '',
  nationality: '',
  date_of_birth: '',
  loyalty_tier: '',
  id_verified: false,
  preferences: '',
  country: '',
  state: '',
  city: '',
  district: '',
  pincode: '',
}

const DEFAULT_COUNTRY_CODES = [
  { code: '+91', label: 'India (+91)' },
  { code: '+1', label: 'United States / Canada (+1)' },
  { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+971', label: 'United Arab Emirates (+971)' },
  { code: '+61', label: 'Australia (+61)' },
  { code: '+65', label: 'Singapore (+65)' },
  { code: '+60', label: 'Malaysia (+60)' },
  { code: '+66', label: 'Thailand (+66)' },
  { code: '+62', label: 'Indonesia (+62)' },
  { code: '+81', label: 'Japan (+81)' },
  { code: '+82', label: 'South Korea (+82)' },
  { code: '+86', label: 'China (+86)' },
  { code: '+49', label: 'Germany (+49)' },
  { code: '+33', label: 'France (+33)' },
  { code: '+39', label: 'Italy (+39)' },
  { code: '+34', label: 'Spain (+34)' },
  { code: '+31', label: 'Netherlands (+31)' },
  { code: '+41', label: 'Switzerland (+41)' },
  { code: '+46', label: 'Sweden (+46)' },
  { code: '+47', label: 'Norway (+47)' },
  { code: '+45', label: 'Denmark (+45)' },
  { code: '+7', label: 'Russia / Kazakhstan (+7)' },
  { code: '+966', label: 'Saudi Arabia (+966)' },
  { code: '+974', label: 'Qatar (+974)' },
  { code: '+968', label: 'Oman (+968)' },
  { code: '+965', label: 'Kuwait (+965)' },
  { code: '+973', label: 'Bahrain (+973)' },
  { code: '+977', label: 'Nepal (+977)' },
  { code: '+880', label: 'Bangladesh (+880)' },
  { code: '+94', label: 'Sri Lanka (+94)' },
  { code: '+960', label: 'Maldives (+960)' },
  { code: '+92', label: 'Pakistan (+92)' },
  { code: '+27', label: 'South Africa (+27)' },
  { code: '+20', label: 'Egypt (+20)' },
  { code: '+234', label: 'Nigeria (+234)' },
  { code: '+254', label: 'Kenya (+254)' },
  { code: '+55', label: 'Brazil (+55)' },
  { code: '+52', label: 'Mexico (+52)' },
  { code: '+54', label: 'Argentina (+54)' },
  { code: '+64', label: 'New Zealand (+64)' },
  { code: '+63', label: 'Philippines (+63)' },
  { code: '+84', label: 'Vietnam (+84)' },
  { code: '+90', label: 'Turkey (+90)' },
  { code: '+30', label: 'Greece (+30)' },
  { code: '+351', label: 'Portugal (+351)' },
  { code: '+353', label: 'Ireland (+353)' },
  { code: '+48', label: 'Poland (+48)' },
  { code: '+43', label: 'Austria (+43)' },
  { code: '+32', label: 'Belgium (+32)' },
].sort((a, b) => a.label.localeCompare(b.label))

export default function GuestForm() {
  const token = useSelector((s) => s.auth.accesstoken)
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL)
  const [countryCodes] = useState(DEFAULT_COUNTRY_CODES)
  const [countrySearch, setCountrySearch] = useState('')
  const [photo, setPhoto] = useState(null)
  const [proofRows, setProofRows] = useState([{ id: Date.now(), docType: '', file: null }])
  const [saving, setSaving] = useState(false)

  // Hack for sticky positioning inside legacy CRM wrapper
  useEffect(() => {
    const wrapper = document.querySelector('.wrapper')
    if (wrapper) wrapper.style.overflow = 'visible'
    return () => {
      if (wrapper) wrapper.style.overflow = ''
    }
  }, [])

  const filteredCountryCodes = useMemo(() => {
    const q = countrySearch.trim().toLowerCase()
    if (!q) return countryCodes
    return countryCodes.filter((c) => c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
  }, [countryCodes, countrySearch])

  function onChange(e) {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  function addProofRow() {
    setProofRows((prev) => [...prev, { id: Date.now() + Math.random(), docType: '', file: null }])
  }

  function updateProofRow(rowId, key, value) {
    setProofRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [key]: value } : r)))
  }

  function removeProofRow(rowId) {
    setProofRows((prev) => prev.length <= 1 ? prev : prev.filter((r) => r.id !== rowId))
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!token) return

    const phoneLocal = form.phone.replace(/[^\d]/g, '').trim()
    if (!form.name.trim() || !phoneLocal) {
      toast.error('Name and phone are required')
      return
    }

    // Only validate proof rows that have partial data (type without file or file without type)
    const hasPartialProof = proofRows.some(
      (r) => (r.docType && !r.file) || (!r.docType && r.file)
    )
    if (hasPartialProof) {
      toast.error('Each proof document row needs both a type and a file')
      return
    }

    const fd = new FormData()
    const phoneFull = `${form.country_code}${phoneLocal}`

    fd.append('name', form.name.trim())
    fd.append('phone', phoneFull)
    fd.append('email', form.email.trim())
    fd.append('gender', form.gender)
    fd.append('nationality', form.nationality.trim())
    fd.append('date_of_birth', form.date_of_birth)
    fd.append('loyalty_tier', form.loyalty_tier)
    fd.append('id_verified', String(!!form.id_verified))
    fd.append('preferences', form.preferences.trim())
    fd.append('country', form.country.trim())
    fd.append('state', form.state.trim())
    fd.append('city', form.city.trim())
    fd.append('district', form.district.trim())
    fd.append('pincode', form.pincode.trim())
    if (photo) fd.append('photo', photo)

    // Only send rows that have both type and file
    proofRows.forEach((row) => {
      if (row.docType && row.file) {
        fd.append('proof_document_types', row.docType)
        fd.append('proof_documents', row.file)
      }
    })

    try {
      setSaving(true)
      // Don't set Content-Type manually - axios sets it with the correct boundary for FormData
      const res = await postWithAuth('/guests', fd, token)
      toast.success('Customer created successfully')
      navigate(`/guests/${res.data.id}`)
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || 'Failed to create customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="guest-page-header">
        <div className="guest-page-header-icon">
          <i className="fa fa-users"></i>
        </div>
        <div className="guest-page-header-title">
          <h1>Customer Management</h1>
          <p>Add New Customer</p>
        </div>
      </section>

      <section className="content">
        <div className="row guest-create-grid">
          <div className="col-lg-12">
            <div className="panel panel-bd lobidrag guest-form-panel">
              <div className="panel-heading guest-form-heading">
                <h4 className="guest-form-title">Customer registration</h4>
                <p className="guest-form-subtitle">Capture customer identity, contact, and verification details in one place.</p>
              </div>
              <div className="panel-body guest-form-body">
                <form onSubmit={onSubmit}>

                  {/* Primary Details */}
                  <div className="guest-section">
                    <div className="guest-section-title">Primary Details</div>
                    <div className="row">
                      <div className="col-sm-6 form-group">
                        <label>Full Name <span className="text-danger">*</span></label>
                        <input className="form-control guest-input" name="name" value={form.name} onChange={onChange} required placeholder="Enter full name" />
                      </div>
                      <div className="col-sm-3 form-group">
                        <label>Country Code <span className="text-danger">*</span></label>
                        <input
                          className="form-control guest-input guest-search-input"
                          placeholder="Search country code"
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                        />
                        <select className="form-control guest-input guest-select" name="country_code" value={form.country_code} onChange={onChange}>
                          {filteredCountryCodes.map((c) => (
                            <option key={c.code + c.label} value={c.code}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-sm-3 form-group">
                        <label>Phone <span className="text-danger">*</span></label>
                        <input className="form-control guest-input" name="phone" value={form.phone} onChange={onChange} required placeholder="Mobile number" />
                      </div>
                    </div>
                  </div>

                  {/* Identity & Contact */}
                  <div className="guest-section">
                    <div className="guest-section-title">Identity &amp; Contact</div>
                    <div className="row">
                      <div className="col-sm-6 form-group">
                        <label>Email</label>
                        <input className="form-control guest-input" name="email" value={form.email} onChange={onChange} type="email" placeholder="Email address" />
                      </div>
                      <div className="col-sm-6 form-group">
                        <label>Gender</label>
                        <select className="form-control guest-input guest-select" name="gender" value={form.gender} onChange={onChange}>
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
                        <input className="form-control guest-input" name="nationality" value={form.nationality} onChange={onChange} placeholder="e.g. Indian, American" />
                      </div>
                      <div className="col-sm-4 form-group">
                        <label>Date of Birth</label>
                        <input className="form-control guest-input" type="date" name="date_of_birth" value={form.date_of_birth} onChange={onChange} />
                      </div>
                      <div className="col-sm-4 form-group">
                        <label>Loyalty / VIP Tier</label>
                        <select className="form-control guest-input guest-select" name="loyalty_tier" value={form.loyalty_tier || 'Standard'} onChange={onChange}>
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
                        <label>Customer Photo</label>
                        <input className="form-control guest-input guest-file" type="file" accept="image/*"
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
                                <th style={{ width: '30%' }}>Document Type</th>
                                <th>Upload Proof</th>
                                <th style={{ width: '20%' }}>Selected File</th>
                                <th style={{ width: 90 }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {proofRows.map((row) => (
                                <tr key={row.id}>
                                  <td>
                                    <select
                                      className="form-control guest-input guest-select"
                                      value={row.docType}
                                      onChange={(e) => updateProofRow(row.id, 'docType', e.target.value)}
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
                                    <input
                                      className="form-control guest-input guest-file"
                                      type="file"
                                      accept="application/pdf,image/*"
                                      onChange={(e) => updateProofRow(row.id, 'file', e.target.files?.[0] || null)}
                                    />
                                  </td>
                                  <td className="text-muted" style={{ fontSize: 12 }}>{row.file?.name || '-'}</td>
                                  <td>
                                    <button type="button" className="btn btn-xs btn-danger"
                                      disabled={proofRows.length === 1}
                                      onClick={() => removeProofRow(row.id)}>
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <button type="button" className="btn btn-default btn-sm" onClick={addProofRow}>+ Add New Proof</button>
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
                        <input className="form-control guest-input" name="country" value={form.country} onChange={onChange} placeholder="Country" />
                      </div>
                      <div className="col-sm-3 form-group">
                        <label>State</label>
                        <input className="form-control guest-input" name="state" value={form.state} onChange={onChange} placeholder="State" />
                      </div>
                      <div className="col-sm-3 form-group">
                        <label>City</label>
                        <input className="form-control guest-input" name="city" value={form.city} onChange={onChange} placeholder="City" />
                      </div>
                      <div className="col-sm-3 form-group">
                        <label>District</label>
                        <input className="form-control guest-input" name="district" value={form.district} onChange={onChange} placeholder="District" />
                      </div>
                    </div>
                    <div className="row">
                      <div className="col-sm-4 form-group">
                        <label>Pincode</label>
                        <input className="form-control guest-input" name="pincode" value={form.pincode} onChange={onChange} placeholder="Pincode" />
                      </div>
                    </div>
                  </div>

                  {/* Notes & Verification */}
                  <div className="guest-section">
                    <div className="guest-section-title">Notes &amp; Verification</div>
                    <div className="row">
                      <div className="col-sm-12 form-group">
                        <label>Preferences / Notes</label>
                        <textarea className="form-control guest-input" rows={4} name="preferences" value={form.preferences} onChange={onChange}
                          placeholder="Late check-in, smoking preference, dietary notes, etc." />
                      </div>
                    </div>
                    <label className="guest-check">
                      <input type="checkbox" name="id_verified" checked={form.id_verified} onChange={onChange} />
                      <span>&nbsp;ID Verified</span>
                    </label>
                  </div>

                  <div className="guest-actions">
                    <button className="btn btn-add guest-save-btn" disabled={saving} type="submit">
                      <i className="fa fa-save" />
                      {saving ? ' Saving...' : ' Save Customer'}
                    </button>
                    <button className="btn btn-default guest-cancel-btn" type="button" onClick={() => navigate('/guests')}>
                      Cancel
                    </button>
                  </div>

                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
