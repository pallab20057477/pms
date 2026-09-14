import React, { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { getWithAuth, postWithAuth, deleteWithAuth } from '../api'
import { resolveAssetUrl } from '../Functions/assetUrl'
import { setActiveHotel, login as loginAction } from '../Redux/authSlice'
import toast from 'react-hot-toast'
import './HotelListModern.css'

export default function HotelList() {
  const token = useSelector(s => s.auth.accesstoken)
  const activeHotelId = useSelector(s => s.auth.activeHotelId)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [hotelToDelete, setHotelToDelete] = useState(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const res = await getWithAuth('/hotels', token)
        const data = res.data && res.data.data ? res.data.data : res.data
        if (mounted) setHotels(data || [])
      } catch (e) {
        console.error('Failed to load hotels', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    if (token) load()
    return () => { mounted = false }
  }, [token])



  async function switchHotel(hotel) {
    if (!token) return
    try {
      const r = await postWithAuth('/hotels/switch', {hotel_id: hotel.id}, token)
      const body = r.data
      if (body && body.token) {
        dispatch(loginAction({ token: body.token, activeHotelId: hotel.id }))
        dispatch(setActiveHotel(hotel))
        toast.success('Switched to ' + hotel.name)
      }
    } catch (err) {
      console.error('Switch hotel failed', err)
      toast.error('Failed to switch hotel')
    }
  }

  // open confirmation modal
  function deleteHotel(hotel){
    setHotelToDelete(hotel)
    setShowDeleteModal(true)
  }

  function closeDeleteModal(){
    setShowDeleteModal(false)
    setHotelToDelete(null)
  }

  async function confirmDelete(){
    if(!hotelToDelete) return
    try{
      const r = await deleteWithAuth(`/hotels/${hotelToDelete.id}`, token)
      if(r.status === 200){
        setHotels(prev => prev.filter(h=>h.id!==hotelToDelete.id))
        toast.success('Deleted')
      } else {
        toast.error(r.data?.error || 'Failed to delete')
      }
    }catch(e){ console.error(e); toast.error('Failed to delete hotel') }
    closeDeleteModal()
  }

  // simple client-side search + pagination
  const perPage = 9
  const filtered = hotels.filter(h => (h.name || '').toLowerCase().includes(query.toLowerCase()) || (h.city || '').toLowerCase().includes(query.toLowerCase()))
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageItems = filtered.slice((page-1)*perPage, page*perPage)
  const activeCount = hotels.filter(h => String(h.status || '').toLowerCase() === 'active').length
  const inactiveCount = hotels.length - activeCount

  return (
    <>
      <section className="hotel-page-header">
        <div className="hotel-page-header-icon">
          <i className="fa-solid fa-building"></i>
        </div>
        <div className="hotel-page-header-title">
          <h1>Hotel Management</h1>
          <p>Hotel List</p>
        </div>
      </section>

      <section className="content">
        <div className="hotel-stats-ribbon">
          <div className="stat-block">
            <span className="stat-val">{hotels.length}</span>
            <span className="stat-label">Total Properties</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-block">
            <span className="stat-val stat-active">{activeCount}</span>
            <span className="stat-label">Live / Active</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-block">
            <span className="stat-val stat-inactive">{inactiveCount}</span>
            <span className="stat-label">Offline</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-block">
            <span className="stat-val stat-filtered">{filtered.length}</span>
            <span className="stat-label">Search Results</span>
          </div>
        </div>

        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag hotel-list-panel">
              <div className="panel-heading hotel-list-heading">
                <h4 className="hotel-list-title">Manage Hotels</h4>
                <p className="hotel-list-subtitle">Review, switch, and maintain hotel properties</p>
              </div>
              <div className="panel-body">
                <div className="hotel-toolbar">
                  <button type="button" className="btn btn-add hotel-add-btn" onClick={() => navigate('/hotels/new')}>
                    <i className="fa-solid fa-plus"></i> Add New Hotel
                  </button>

                  <div className="hotel-search-box">
                    <i className="fa-solid fa-magnifying-glass"></i>
                    <input
                      className="form-control"
                      placeholder="Search by hotel name or city"
                      value={query}
                      onChange={e=>{setQuery(e.target.value); setPage(1)}}
                    />
                    {query ? (
                      <button type="button" className="hotel-search-clear" onClick={()=>{setQuery(''); setPage(1)}} aria-label="Clear search">
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    ) : null}
                  </div>
                </div>

                {loading ? (
                  <div className="text-center hotel-loader-wrap">
                    <i className="fa-solid fa-spinner fa-spin spinning-icon"></i> Loading hotels...
                  </div>
                ) : (
                  <div className="table-responsive hotel-table-wrap">
                    <table className="table table-bordered table-hover hotel-table mb-0">
                      <thead>
                        <tr>
                          <th style={{width:80}}>Logo</th>
                          <th>Name</th>
                          <th>City</th>
                          <th>Tax</th>
                          <th>Address</th>
                          <th style={{width:220}}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center text-muted hotel-empty-cell">
                              No hotels found. Try adjusting search or add a new hotel.
                            </td>
                          </tr>
                        ) : pageItems.map(h => (
                          <tr key={h.id}>
                            <td>
                              <div className="hotel-logo-thumb">
                                {h.logo ? <img src={resolveAssetUrl(h.logo, 'hotels')} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor:'#f8f9fa' }} /> : <div className="bg-light" style={{ width: '100%', height: '100%' }} />}
                              </div>
                            </td>
                            <td>
                              <strong>{h.name}</strong>
                              <div className="badge-group">
                                <span className={`hotel-status-badge ${String(h.status || '').toLowerCase() === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                                  {String(h.status || 'inactive').toUpperCase()}
                                </span>
                                {h.property_type && (
                                  <span className="hotel-property-badge">
                                    <i className="fa-solid fa-building"></i> {h.property_type}
                                  </span>
                                )}
                                {h.star_rating > 0 && (
                                  <span className="hotel-star-badge">
                                    {h.star_rating} <i className="fa-solid fa-star"></i>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>{h.city || '-'}</td>
                            <td>
                              {h.tax_percent > 0
                                ? <span>{h.tax_type ? `${h.tax_type} ` : ''}{h.tax_percent}%</span>
                                : '-'
                              }
                            </td>
                            <td className="hotel-address-col">{h.address1 || '-'}</td>
                            <td className="hotel-action-col">
                              <button className="hotel-action-btn hotel-btn-switch" style={{ marginRight: 6 }} onClick={() => switchHotel(h)} disabled={activeHotelId === h.id} title="Switch">
                                <i className="fa-solid fa-right-left" /> {activeHotelId === h.id ? 'Active' : 'Switch'}
                              </button>
                              <button className="hotel-action-btn hotel-btn-view" style={{ marginRight: 6 }} onClick={() => navigate(`/hotels/${h.id}`)} title="View">
                                <i className="fa-solid fa-eye" /> View
                              </button>
                              <button className="hotel-action-btn hotel-btn-edit" style={{ marginRight: 6 }} onClick={() => navigate(`/hotels/${h.id}/edit`)} title="Edit">
                                <i className="fa-solid fa-pen-to-square" /> Edit
                              </button>
                              <button className="hotel-action-btn hotel-btn-delete" onClick={() => deleteHotel(h)} title="Delete">
                                <i className="fa-solid fa-trash" /> Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="text-center hotel-pagination-wrap">
                  <nav>
                    <ul className="pagination pagination-sm" style={{ margin: 0 }}>
                      <li className={page===1 ? 'disabled' : ''}><button className="page-link" onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button></li>
                      {Array.from({length:totalPages}).map((_,i)=> (
                        <li key={i} className={page===i+1 ? 'active' : ''}><button className="page-link" onClick={()=>setPage(i+1)}>{i+1}</button></li>
                      ))}
                      <li className={page===totalPages ? 'disabled' : ''}><button className="page-link" onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button></li>
                    </ul>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </div>
        {showDeleteModal && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2000,
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16
              }}
              onClick={closeDeleteModal}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 380,
                  backgroundColor: '#fff',
                  borderRadius: 8,
                  boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                  overflow: 'hidden'
                }}
                onClick={(e)=>e.stopPropagation()}
              >
                <div style={{padding: '16px 18px', borderBottom: '1px solid #e9ecef', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <h4 style={{margin:0, fontSize:18}}>Confirm Delete</h4>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={closeDeleteModal}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: 24,
                      lineHeight: 1,
                      color: '#6c757d'
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{padding: 18}}>
                  <p style={{margin: 0}}>Delete <strong>{hotelToDelete?.name}</strong>? This action cannot be undone.</p>
                </div>
                <div style={{padding: '0 18px 18px', display:'flex', justifyContent:'flex-end', gap: 10}}>
                  <button className="btn btn-default" onClick={closeDeleteModal}>Cancel</button>
                  <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
                </div>
              </div>
            </div>
          )}
      </section>
    </>
  )
}
