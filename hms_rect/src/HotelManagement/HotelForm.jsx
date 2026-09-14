import React, {useState, useEffect} from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { postWithAuth, getWithAuth, putWithAuth } from '../api'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { setActiveHotel, login as loginAction } from '../Redux/authSlice'
import './HotelFormModern.css'

export default function HotelForm(){
    const token = useSelector(s => s.auth.accesstoken)
    const dispatch = useDispatch()
    const { id } = useParams()
    const navigate = useNavigate()
    const [form, setForm] = useState({
        name:'',
        address1:'',
        address2:'',
        city:'',
        state:'',
        country:'',
        pincode:'',
        phone:'',
        email:'',
        tax_type:'',
        tax_percent:'0',
        gst_number:'',
        pan_number:'',
        description:'',
        property_type:'Hotel',
        star_rating:'3',
        website:''
    })
    const [logo, setLogo] = useState(null)
    const [saving, setSaving] = useState(false)
    const [createdHotel, setCreatedHotel] = useState(null)

    async function submit(e){
        e.preventDefault()
        setSaving(true)
        try{
            const fd = new FormData()
            Object.keys(form).forEach(k=>{ if(form[k] !== undefined) fd.append(k, form[k]) })
            if(logo) fd.append('logo', logo)
            // use relative API via wrapper; do NOT set Content-Type manually for FormData
            let res
            if(id){
                res = await putWithAuth(`/hotels/${id}`, fd, token)
            } else {
                res = await postWithAuth('/hotels', fd, token)
            }
            const body = res.data
            if(res.status===201 || res.status===200){
                if(id){
                    toast.success('Hotel updated')
                    navigate(`/hotels/${id}`)
                } else {
                    setCreatedHotel(body)
                    toast.success('Hotel created')
                }
            } else {
                toast.error(body.error || JSON.stringify(body))
            }
        }catch(e){console.error(e); alert('Failed to create hotel')}
        setSaving(false)
    }

    // load existing hotel when editing
    useEffect(()=>{
        let mounted = true
        async function load(){
            if(!id) return
            try{
                const r = await getWithAuth(`/hotels/${id}`, token)
                const data = r.data && r.data.data ? r.data.data : r.data
                if(mounted && data){
                        setForm({
                            name: data.name || '',
                            address1: data.address1 || '',
                            address2: data.address2 || '',
                            city: data.city || '',
                            state: data.state || '',
                            country: data.country || '',
                            pincode: data.pincode || '',
                            phone: data.phone || '',
                            email: data.email || '',
                            tax_type: data.tax_type || '',
                            tax_percent: data.tax_percent !== undefined && data.tax_percent !== null ? String(data.tax_percent) : '0',
                            gst_number: data.gst_number || '',
                            pan_number: data.pan_number || '',
                            description: data.description || '',
                            property_type: data.property_type || 'Hotel',
                            star_rating: data.star_rating !== undefined ? String(data.star_rating) : '3',
                            website: data.website || ''
                        })
                }
            }catch(err){ console.error('Failed to load hotel', err); toast.error('Failed to load hotel') }
        }
        load()
        return ()=>{ mounted = false }
    }, [id, token])

    const switchToCreated = async () => {
        if(!createdHotel || !token) return
        try{
            const r = await postWithAuth('/hotels/switch', {hotel_id: createdHotel.id}, token)
            const body = r.data
            if(body && body.token){
                    dispatch(loginAction({ token: body.token, activeHotelId: createdHotel.id }))
                    dispatch(setActiveHotel(createdHotel))
                    window.location.href = '/hotels'
                }
        }catch(e){console.error(e); alert('Failed to switch to new hotel')}
    }

     return (
          <>
                <section className="hotel-page-header">
                    <div className="hotel-page-header-icon">
                        <i className="fa-solid fa-building"></i>
                    </div>
                    <div className="hotel-page-header-title">
                        <h1>{createdHotel ? 'Registration Complete' : (id ? 'Edit Hotel Profile' : 'Add New Hotel')}</h1>
                        <p>Hotel Management</p>
                    </div>
                </section>
                <section className="content">
                    <div className="row">
                        <div className="col-sm-12">
                            <div className="panel panel-bd lobidrag hotel-form-panel">
                                {!createdHotel && (
                                    <div className="panel-heading hotel-form-heading">
                                        <div>
                                            <h4 className="hotel-form-title">{id ? 'Update Hotel Profile' : 'Hotel Registration'}</h4>
                                            <p className="hotel-form-subtitle">Capture full identity, contact, and tax settings for this property.</p>
                                        </div>
                                        <button className="btn btn-default hotel-list-btn" onClick={()=>navigate('/hotels')}>
                                            <i className="fa-solid fa-list"></i> Hotel List
                                        </button>
                                    </div>
                                )}
                                
                                <div className="panel-body">
                                    {!createdHotel && (
                                        <form className="hotel-form-layout" onSubmit={submit}>
                                            <div className="hotel-form-topbar">
                                                <span className="label label-primary">{id ? 'Edit Mode' : 'Create Mode'}</span>
                                                <span className="hotel-form-topbar-note">Fields marked with * are required.</span>
                                            </div>

                                            <div className="hotel-form-grid">
                                                <div className="hotel-form-main-col">
                                                    <div className="hotel-form-section">
                                                        <div className="hotel-form-section-title"><i className="fa-solid fa-hotel"></i> Property Details</div>
                                                        <div className="row">
                                                            <div className="col-md-6 form-group">
                                                                <label>Property Name *</label>
                                                                <input type="text" className={`form-control hotel-form-input ${form.name.length > 2 ? 'is-valid' : ''}`} placeholder="Enter Property Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required />
                                                            </div>
                                                            <div className="col-md-3 form-group">
                                                                <label>Property Type *</label>
                                                                <select className="form-control hotel-form-input is-valid" value={form.property_type} onChange={e=>setForm({...form, property_type: e.target.value})} required>
                                                                    <option value="Hotel">Hotel</option>
                                                                    <option value="Resort">Resort</option>
                                                                    <option value="Villa">Villa / Homestay</option>
                                                                    <option value="Hostel">Hostel</option>
                                                                </select>
                                                            </div>
                                                            <div className="col-md-3 form-group">
                                                                <label>Star Rating</label>
                                                                <select className="form-control hotel-form-input is-valid" value={form.star_rating} onChange={e=>setForm({...form, star_rating: e.target.value})}>
                                                                    <option value="5">5 Star (Luxury)</option>
                                                                    <option value="4">4 Star (Premium)</option>
                                                                    <option value="3">3 Star (Standard)</option>
                                                                    <option value="2">2 Star (Budget)</option>
                                                                    <option value="1">1 Star (Basic)</option>
                                                                    <option value="0">Unrated</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Address Line 1 *</label>
                                                            <input type="text" className={`form-control hotel-form-input ${form.address1.length > 4 ? 'is-valid' : ''}`} placeholder="Address Line 1" value={form.address1} onChange={e=>setForm({...form,address1:e.target.value})} required />
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Address Line 2</label>
                                                            <input type="text" className="form-control hotel-form-input" placeholder="Address Line 2" value={form.address2} onChange={e=>setForm({...form,address2:e.target.value})} />
                                                        </div>
                                                        <div className="row">
                                                            <div className="col-md-3 form-group"><label>City *</label><input className={`form-control hotel-form-input ${form.city ? 'is-valid' : ''}`} placeholder="City" value={form.city} onChange={e=>setForm({...form,city:e.target.value})} required /></div>
                                                            <div className="col-md-3 form-group"><label>State *</label><input className={`form-control hotel-form-input ${form.state ? 'is-valid' : ''}`} placeholder="State" value={form.state} onChange={e=>setForm({...form,state:e.target.value})} required /></div>
                                                            <div className="col-md-3 form-group"><label>Country *</label><input className={`form-control hotel-form-input ${form.country ? 'is-valid' : ''}`} placeholder="Country" value={form.country} onChange={e=>setForm({...form,country:e.target.value})} required /></div>
                                                            <div className="col-md-3 form-group"><label>Pincode *</label><input className={`form-control hotel-form-input ${form.pincode ? 'is-valid' : ''}`} placeholder="Pincode" value={form.pincode} onChange={e=>setForm({...form,pincode:e.target.value})} required /></div>
                                                        </div>
                                                    </div>

                                                    <div className="hotel-form-section">
                                                        <div className="hotel-form-section-title"><i className="fa-solid fa-address-book"></i> Contact & Identity</div>
                                                        <div className="row">
                                                            <div className="col-md-6 form-group">
                                                                <label>Contact Phone *</label>
                                                                <input type="tel" className={`form-control hotel-form-input ${form.phone.length >= 10 ? 'is-valid' : ''}`} placeholder="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} required />
                                                            </div>
                                                            <div className="col-md-6 form-group">
                                                                <label>Email *</label>
                                                                <input type="email" className={`form-control hotel-form-input ${form.email.includes('@') ? 'is-valid' : ''}`} placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required />
                                                            </div>
                                                        </div>
                                                        <div className="row">
                                                            <div className="col-md-12 form-group">
                                                                <label>Website URL</label>
                                                                <input type="url" className={`form-control hotel-form-input ${form.website.includes('.') ? 'is-valid' : ''}`} placeholder="https://www.yourhotel.com" value={form.website} onChange={e=>setForm({...form,website:e.target.value})} />
                                                            </div>
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Logo Upload</label>
                                                            <div className="hotel-logo-upload-wrapper">
                                                                <input type="file" id="hotelLogoUpload" name="logo" className="hotel-file-input-hidden" accept="image/*" onChange={e=>setLogo(e.target.files[0])} />
                                                                <label htmlFor="hotelLogoUpload" className={`hotel-file-upload-btn ${logo ? 'has-file' : ''}`}>
                                                                    <i className="fa-solid fa-cloud-arrow-up"></i>
                                                                    <div className="upload-btn-text">
                                                                        <span className="upload-primary-text">{logo ? logo.name : 'Browse files to upload'}</span>
                                                                        <span className="upload-secondary-text">Supports JPG, PNG, WEBP (Max 2MB)</span>
                                                                    </div>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="hotel-form-side-col">
                                                    <div className="hotel-form-sticky-card">
                                                        <div className="hotel-form-section">
                                                            <div className="hotel-form-section-title"><i className="fa-solid fa-file-invoice-dollar"></i> Tax Configuration</div>
                                                            <div className="form-group">
                                                                <label>Tax Type *</label>
                                                                <select className={`form-control hotel-form-input ${form.tax_type ? 'is-valid' : ''}`} value={form.tax_type} onChange={e=>setForm({...form, tax_type: e.target.value})} required>
                                                                    <option value="">Select Tax Type</option>
                                                                    <option value="GST">GST</option>
                                                                    <option value="VAT">VAT</option>
                                                                    <option value="TVA">TVA</option>
                                                                    <option value="Sales Tax">Sales Tax</option>
                                                                    <option value="Service Tax">Service Tax</option>
                                                                    <option value="IVA">IVA</option>
                                                                    <option value="Other">Other</option>
                                                                </select>
                                                            </div>
                                                            <div className="form-group">
                                                                <label>Tax Percentage (%) *</label>
                                                                <input type="number" min="0" step="0.01" className={`form-control hotel-form-input ${form.tax_percent !== '' ? 'is-valid' : ''}`} placeholder="Tax %" value={form.tax_percent} onChange={e=>setForm({...form, tax_percent: e.target.value})} required />
                                                            </div>
                                                            <div className="form-group">
                                                                <label>PAN Number</label>
                                                                <input type="text" className={`form-control hotel-form-input ${form.pan_number ? 'is-valid' : ''}`} placeholder="PAN Number" value={form.pan_number} onChange={e=>setForm({...form,pan_number:e.target.value})} />
                                                            </div>
                                                        </div>

                                                        <div className="hotel-form-section">
                                                            <div className="hotel-form-section-title"><i className="fa-solid fa-align-left"></i> Description</div>
                                                            <div className="form-group">
                                                                <textarea className="form-control hotel-form-input" placeholder="Add a brief description about this property..." rows="5" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}></textarea>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="hotel-form-actions">
                                                <button type="button" className="btn btn-warning" onClick={()=>{ setForm({name:'',address1:'',address2:'',city:'',state:'',country:'',pincode:'',phone:'',email:'',tax_type:'',tax_percent:'0',gst_number:'',pan_number:'',description:'',property_type:'Hotel',star_rating:'3',website:''}); setLogo(null); }}>
                                                    <i className="fa-solid fa-arrow-rotate-left"></i> Reset
                                                </button>
                                                <button type="submit" className="btn btn-success" disabled={saving}>
                                                    {saving ? <><i className="fa-solid fa-spinner fa-spin"></i> Saving...</> : <><i className="fa-solid fa-check"></i> {id ? 'Update Hotel' : 'Save Hotel'}</>}
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {createdHotel && (
                                        <div className="hotel-success-card">
                                            <div className="success-icon-wrap">
                                                <i className="fa-solid fa-check"></i>
                                            </div>
                                            <h2 className="hotel-success-title">Hotel Created Successfully!</h2>
                                            <p className="hotel-success-subtitle">
                                                <strong>{createdHotel.name}</strong> has been successfully registered on the platform. 
                                                You can now switch to this hotel to begin configuring rooms, adjusting pricing, and onboarding your staff.
                                            </p>
                                            <div className="hotel-success-actions">
                                                <button className="btn-switch-hotel" onClick={switchToCreated}>
                                                    <i className="fa-solid fa-right-left"></i> Switch to {createdHotel.name}
                                                </button>
                                                <a className="btn-back-list" href="/hotels">
                                                    Back to Hotel List
                                                </a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
          </>
     )
}

