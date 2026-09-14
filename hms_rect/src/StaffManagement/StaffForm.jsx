import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { getWithAuth, postWithAuth, putWithAuth } from '../api'
import { resolveAssetUrl } from '../Functions/assetUrl'
import './StaffFormModern.css'

const INITIAL = {
  name: '',
  role: '',
  country_code: '+91',
  phone: '',
  email: '',
  alt_phone: '',
  alt_email: '',
  family_contact_name: '',
  family_phone: '',
  house_street: '',
  city: '',
  district: '',
  state: '',
  pincode: '',
  country: 'India',
  basic_salary: '',
  allowances: '',
  join_date: '',
  status: true,
  portal_access: true,
  crm_password: '',
  staff_document_type: '',
  staff_document: '',
  notes: '',
}

const COUNTRY_CODES = ['+91', '+1', '+44', '+61', '+971', '+65', '+49', '+81']

const ROLE_OPTIONS = [
  'Housekeeping',
  'Receptionist',
  'Manager',
  'Accountant',
  'Maintenance',
  'Security',
]

const LOGIN_ROLES = new Set(['Receptionist', 'Manager', 'Accountant'])
const DOCUMENT_TYPE_OPTIONS = [
  { value: 'Aadhaar', label: 'Aadhaar' },
  { value: 'PAN', label: 'PAN' },
  { value: 'Passport', label: 'Passport' },
  { value: 'Driving License', label: 'Driving License' },
  { value: 'Employment Contract', label: 'Employment Contract' },
  { value: 'Police Verification', label: 'Police Verification' },
  { value: 'Other', label: 'Other' },
]

export default function StaffForm() {
  const token = useSelector((s) => s.auth.accesstoken)
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [documents, setDocuments] = useState(null)
  const [currentPhoto, setCurrentPhoto] = useState('')
  const [form, setForm] = useState(() => ({
    ...INITIAL,
    join_date: new Date().toISOString().slice(0, 10),
  }))

  const allowsPortalLogin = useMemo(() => LOGIN_ROLES.has(String(form.role || '').trim()), [form.role])

  const grossSalary = useMemo(() => {
    const basic = Number(form.basic_salary || 0)
    const allowance = Number(form.allowances || 0)
    return basic + allowance
  }, [form.basic_salary, form.allowances])

  function splitPhone(raw) {
    // Professional E.164 phone parser: splits country code and phone, handles +91, +1, etc.
    const text = String(raw || '').replace(/\s+/g, '').trim();
    // If no plus, treat as local number
    if (!text.startsWith('+')) return { country_code: '+91', phone: text };

    // Try to match +<countrycode><number> (E.164)
    // Accepts country codes up to 4 digits, phone at least 6 digits
    const m = text.match(/^(\+\d{1,4})(\d{6,})$/);
    if (m) return { country_code: m[1], phone: m[2] };

    // Try to match +<countrycode>-<number> or +<countrycode> <number>
    const m2 = text.match(/^(\+\d{1,4})[-\s](\d{6,})$/);
    if (m2) return { country_code: m2[1], phone: m2[2] };

    // Fallback: if only country code, no number
    const cc = text.match(/^(\+\d{1,4})$/);
    if (cc) return { country_code: cc[1], phone: '' };

    // Fallback: treat as local
    return { country_code: '+91', phone: text.replace(/^\+/, '') };
  }

  const load = useCallback(async () => {
    if (!isEdit || !token) return
    setLoading(true)
    try {
      const res = await getWithAuth(`/staff/${id}`, token)
      const staff = res?.data?.data?.staff
      if (!staff) throw new Error('Staff not found')
      let country_code = staff.country_code;
      let phone = staff.phone;
      // Fallback to splitPhone only if country_code is missing
      if (!country_code || country_code.trim() === '') {
        const phoneParts = splitPhone(staff.phone || '');
        country_code = phoneParts.country_code;
        phone = phoneParts.phone;
      }
      setForm({
        name: staff.name || '',
        role: staff.role || '',
        country_code: country_code || '+91',
        phone: phone || '',
        email: staff.email || '',
        alt_phone: staff.alt_phone || '',
        alt_email: staff.alt_email || '',
        family_contact_name: staff.family_contact_name || '',
        family_phone: staff.family_phone || '',
        house_street: staff.house_street || '',
        city: staff.city || '',
        district: staff.district || '',
        state: staff.state || '',
        pincode: staff.pincode || '',
        country: staff.country || 'India',
        basic_salary: staff.basic_salary !== undefined && staff.basic_salary !== null ? String(staff.basic_salary) : '',
        allowances: staff.allowances !== undefined && staff.allowances !== null ? String(staff.allowances) : '',
        join_date: staff.join_date || new Date().toISOString().slice(0, 10),
        status: !!staff.status,
        portal_access: staff.portal_access !== undefined ? !!staff.portal_access : !!staff.status,
        crm_password: '',
        staff_document_type: staff.staff_document_type || '',
        staff_document: staff.staff_document || '',
        notes: staff.notes || '',
      })
      setCurrentPhoto(staff.photo || '')
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || 'Failed to load staff profile')
      navigate('/staff')
    } finally {
      setLoading(false)
    }
  }, [isEdit, token, id, navigate])

  useEffect(() => {
    load()
  }, [load])

  function onChange(e) {
    const { name, value, type, checked } = e.target
    setForm((prev) => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value }
      if (name === 'role' && !LOGIN_ROLES.has(String(value || '').trim())) {
        next.portal_access = false
        next.crm_password = ''
      }
      if (name === 'role' && LOGIN_ROLES.has(String(value || '').trim()) && prev.portal_access === false) {
        next.portal_access = true
      }
      return next
    })
  }

  function formatIndianDate(ymd) {
    if (!ymd) return ''
    const d = new Date(ymd)
    if (Number.isNaN(d.getTime())) return ymd
    return d.toLocaleDateString('en-GB')
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!token) return

    if (!form.name.trim() || !form.role.trim() || !form.phone.trim() || !form.join_date.trim() || !form.basic_salary.trim()) {
      toast.error('Please fill all required fields')
      return
    }
    if (documents && !form.staff_document_type.trim()) {
      toast.error('Please select document type before upload')
      return
    }

    // Normalize phone input to avoid repeated country codes
    let { country_code, phone } = splitPhone(`${form.country_code}${form.phone}`)
    country_code = country_code || '+91'
    phone = String(phone).replace(/\D/g, '') // Remove all non-digit characters
    phone = phone.replace(/^0+/, '') // Remove leading zeros
    // Enforce minimum phone length (e.g., 6 digits)
    if (phone.length < 6) {
      toast.error('Please enter a valid phone number (at least 6 digits, no leading zeros)')
      return
    }
    const fd = new FormData()
    const employmentStatus = form.status ? 'Working' : 'Inactive'

    fd.append('name', form.name.trim())
    fd.append('role', form.role.trim())
    fd.append('phone', phone.trim())
    fd.append('email', form.email.trim())
    fd.append('country_code', country_code)
    fd.append('alt_phone', form.alt_phone.trim())
    fd.append('alt_email', form.alt_email.trim())
    fd.append('family_contact_name', form.family_contact_name.trim())
    fd.append('family_phone', form.family_phone.trim())
    fd.append('house_street', form.house_street.trim())
    fd.append('city', form.city.trim())
    fd.append('district', form.district.trim())
    fd.append('state', form.state.trim())
    fd.append('pincode', form.pincode.trim())
    fd.append('country', form.country.trim())
    fd.append('basic_salary', String(Number(form.basic_salary || 0)))
    fd.append('allowances', String(Number(form.allowances || 0)))
    fd.append('gross_salary', String(grossSalary))
    fd.append('employment_status', employmentStatus)
    fd.append('portal_access', String(allowsPortalLogin ? form.portal_access : false))
    if (allowsPortalLogin && form.crm_password.trim()) {
      fd.append('crm_password', form.crm_password)
    }
    fd.append('staff_document_type', form.staff_document_type)
    fd.append('join_date', form.join_date.trim())
    fd.append('status', String(form.status))
    fd.append('notes', form.notes.trim())
    if (photo) fd.append('photo', photo)
    if (documents) fd.append('document', documents)

    try {
      setSaving(true)
      if (isEdit) {
        await putWithAuth(`/staff/${id}`, fd, token, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success('Staff updated successfully')
        navigate(`/staff/${id}`)
      } else {
        const res = await postWithAuth('/staff', fd, token, { headers: { 'Content-Type': 'multipart/form-data' } })
        const createdId = res?.data?.data?.id
        toast.success('Staff created successfully')
        navigate(createdId ? `/staff/${createdId}` : '/staff')
      }
    } catch (err) {
      console.error(err)
      toast.error(err?.response?.data?.error || (isEdit ? 'Failed to update staff' : 'Failed to create staff'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className={`glyphicon ${isEdit ? 'glyphicon-user' : 'glyphicon-plus'}`}></i>
        </div>
        <div className="header-title">
          <h1>Staff Management</h1>
          <small>{isEdit ? 'Edit Staff' : 'Professional Staff Onboarding'}</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag staff-form-panel">
              <div className="panel-heading staff-form-heading">
                <div>
                  <h4 className="staff-form-title">{isEdit ? 'Update Staff Profile' : 'Staff Onboarding'}</h4>
                  <p className="staff-form-subtitle">Capture profile, contact, payroll, and status details in one form.</p>
                </div>
              </div>
              <div className="panel-body">
                {loading ? (
                  <div className="text-center" style={{ padding: '24px 0' }}>
                    <i className="glyphicon glyphicon-refresh staff-form-spin"></i> Loading profile...
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="staff-form-layout">
                    <div className="staff-form-section">
                    <h4 className="staff-form-section-title">Personal &amp; Profile Details</h4>
                    <div className="row">
                      <div className="col-sm-6 form-group">
                        <label>Full Name *</label>
                        <input className="form-control staff-form-input" name="name" value={form.name} onChange={onChange} required placeholder="Staff Name" />
                      </div>
                      <div className="col-sm-6 form-group">
                        <label>Role *</label>
                        <select className="form-control staff-form-input" name="role" value={form.role} onChange={onChange} required>
                          <option value="">Select role</option>
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-sm-2 form-group">
                        <label>Code *</label>
                        <select className="form-control staff-form-input" name="country_code" value={form.country_code} onChange={onChange}>
                          {COUNTRY_CODES.map((code) => (
                            <option key={code} value={code}>{code}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-sm-4 form-group">
                        <label>Phone *</label>
                        <input className="form-control staff-form-input" name="phone" value={form.phone} onChange={onChange} required placeholder="Primary Contact" />
                      </div>
                      <div className="col-sm-6 form-group">
                        <label>Email *</label>
                        <input className="form-control staff-form-input" type="email" name="email" value={form.email} onChange={onChange} placeholder="Official Email" required />
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-sm-6 form-group">
                        <label>Alt Phone</label>
                        <input className="form-control staff-form-input" name="alt_phone" value={form.alt_phone} onChange={onChange} />
                      </div>
                      <div className="col-sm-6 form-group">
                        <label>Alt Email</label>
                        <input className="form-control staff-form-input" type="email" name="alt_email" value={form.alt_email} onChange={onChange} />
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-sm-6 form-group">
                        <label>Family Contact Name</label>
                        <input className="form-control staff-form-input" name="family_contact_name" value={form.family_contact_name} onChange={onChange} />
                      </div>
                      <div className="col-sm-6 form-group">
                        <label>Family Phone</label>
                        <input className="form-control staff-form-input" name="family_phone" value={form.family_phone} onChange={onChange} />
                      </div>
                    </div>

                    </div>

                    <div className="staff-form-section">
                    <h4 className="staff-form-section-title">Address Details</h4>
                    <div className="row">
                      <div className="col-sm-12 form-group">
                        <label>House No / Street / Area *</label>
                        <input className="form-control staff-form-input" name="house_street" value={form.house_street} onChange={onChange} required />
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-sm-4 form-group">
                        <label>City *</label>
                        <input className="form-control staff-form-input" name="city" value={form.city} onChange={onChange} required />
                      </div>
                      <div className="col-sm-4 form-group">
                        <label>District *</label>
                        <input className="form-control staff-form-input" name="district" value={form.district} onChange={onChange} required />
                      </div>
                      <div className="col-sm-4 form-group">
                        <label>State *</label>
                        <input className="form-control staff-form-input" name="state" value={form.state} onChange={onChange} required />
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-sm-4 form-group">
                        <label>Pincode *</label>
                        <input className="form-control staff-form-input" name="pincode" value={form.pincode} onChange={onChange} required />
                      </div>
                      <div className="col-sm-4 form-group">
                        <label>Country *</label>
                        <input className="form-control staff-form-input" name="country" value={form.country} onChange={onChange} required />
                      </div>
                      <div className="col-sm-4 form-group">
                        <label>Profile Photo</label>
                        <input className="form-control staff-form-input" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
                        {(photo || currentPhoto) && (
                          <div style={{ marginTop: 10 }}>
                            <img src={photo ? URL.createObjectURL(photo) : resolveAssetUrl(currentPhoto)} alt="Preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd' }} />
                          </div>
                        )}
                      </div>
                    </div>

                    </div>

                    <div className="staff-form-section">
                    <h4 className="staff-form-section-title">Payroll &amp; Salary</h4>
                    <div className="row">
                      <div className="col-sm-4 form-group">
                        <label style={{ display: 'block' }}>Gross Salary</label>
                        <div className="form-control staff-form-highlight">₹{grossSalary.toFixed(2)}</div>
                      </div>
                      <div className="col-sm-4 form-group">
                        <label>Basic Salary (Monthly) *</label>
                        <div className="input-group">
                          <span className="input-group-addon">₹</span>
                          <input className="form-control staff-form-input" type="number" min="0" name="basic_salary" value={form.basic_salary} onChange={onChange} required />
                        </div>
                      </div>
                      <div className="col-sm-4 form-group">
                        <label>Joining Date *</label>
                        <input className="form-control staff-form-input" type="date" name="join_date" value={form.join_date} onChange={onChange} required />
                        <small className="text-muted">{formatIndianDate(form.join_date)}</small>
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-sm-12 form-group">
                        <label>Additional Allowances (HRA, Travel, etc.)</label>
                        <input className="form-control staff-form-input" type="number" min="0" name="allowances" value={form.allowances} onChange={onChange} />
                      </div>
                    </div>

                    </div>

                    <div className="staff-form-section">
                    <h4 className="staff-form-section-title">Security, Documents &amp; Status</h4>
                    <div className="staff-form-note">
                      {allowsPortalLogin ? 'This role can receive CRM login access.' : 'This role does not use CRM login. No password is required.'}
                    </div>
                    <div className="row">
                      {allowsPortalLogin ? (
                        <div className="col-sm-4 form-group">
                          <label>CRM Login Password</label>
                          <input className="form-control staff-form-input" type="password" name="crm_password" value={form.crm_password} onChange={onChange} placeholder="Set CRM login password" required={allowsPortalLogin} />
                        </div>
                      ) : (
                        <div className="col-sm-4 form-group">
                          <label>CRM Login Password</label>
                          <div className="form-control staff-form-highlight">Not required for this role</div>
                        </div>
                      )}
                      <div className="col-sm-4 form-group">
                        <label>Employment Status</label>
                        <select className="form-control staff-form-input" name="status" value={String(form.status)} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value === 'true' }))}>
                          <option value="true">Working</option>
                          <option value="false">Inactive</option>
                        </select>
                      </div>
                      <div className="col-sm-4 form-group">
                        <label style={{ display: 'block' }}>CRM Portal Access</label>
                        <label style={{ cursor: allowsPortalLogin ? 'pointer' : 'not-allowed', marginTop: 6, opacity: allowsPortalLogin ? 1 : 0.55 }}>
                          <input
                            type="checkbox"
                            checked={allowsPortalLogin ? form.portal_access : false}
                            disabled={!allowsPortalLogin}
                            onChange={(e) => setForm((prev) => ({ ...prev, portal_access: e.target.checked }))}
                            style={{ marginRight: 8 }}
                          />
                          Active (Allow Login)
                        </label>
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-sm-6 form-group">
                        <label>Staff Documents (ID Proof, Contracts)</label>
                        {/* Show existing document link if editing and staff has a document */}
                        {isEdit && form.staff_document_type && form.staff_document_type !== '' && (form.staff_document || (typeof form.staff_document === 'string' && form.staff_document.trim() !== '')) && (
                          <div style={{ marginBottom: 6 }}>
                            <a
                              href={resolveAssetUrl(form.staff_document, 'staff_docs')}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-block', marginBottom: 4 }}
                            >
                              View Current Document
                            </a>
                          </div>
                        )}
                        <input className="form-control staff-form-input" type="file" onChange={(e) => setDocuments(e.target.files?.[0] || null)} />
                      </div>
                      <div className="col-sm-6 form-group">
                        <label>Document Type</label>
                        <select className="form-control staff-form-input" name="staff_document_type" value={form.staff_document_type} onChange={onChange}>
                          <option value="">Select document type</option>
                          {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <small className="text-muted">Choose type for uploaded file records.</small>
                      </div>
                    </div>

                    {(photo || currentPhoto) && (
                      <div className="row" style={{ marginBottom: 10 }}>
                        <div className="col-sm-12">
                          <div style={{ width: 88, height: 88, borderRadius: 44, overflow: 'hidden', border: '1px solid #ddd' }}>
                            <img
                              src={photo ? URL.createObjectURL(photo) : resolveAssetUrl(currentPhoto, 'staff')}
                              alt="Preview"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="row">
                      <div className="col-sm-12 form-group">
                        <label>Notes</label>
                        <textarea className="form-control staff-form-input" rows={4} name="notes" value={form.notes} onChange={onChange} placeholder="Skills, shift preferences, remarks" />
                      </div>
                    </div>

                    </div>

                    <div className="staff-form-actions">
                      <button className="btn btn-success" disabled={saving} type="submit">
                        {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Staff'}
                      </button>
                      <button className="btn btn-warning" type="button" onClick={() => navigate(isEdit ? `/staff/${id}` : '/staff')}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
