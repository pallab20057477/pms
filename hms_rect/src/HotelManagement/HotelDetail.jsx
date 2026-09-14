import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux'
import { getWithAuth } from '../api'
import { resolveAssetUrl } from '../Functions/assetUrl'
import toast from 'react-hot-toast'
import './HotelDetailModern.css'

function HotelDetail() {
  const { id } = useParams();
  const token = useSelector(s=>s.auth.accesstoken)
  const navigate = useNavigate()
  const [hotel, setHotel] = useState(null);
  const [loading, setLoading] = useState(true)

  const safe = (value) => {
    if (value === null || value === undefined) return '-'
    const text = String(value).trim()
    return text === '' ? '-' : text
  }

  const formatDateTime = (value) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return safe(value)
    return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  useEffect(() => {
    let mounted = true
    async function fetchHotel(){
      setLoading(true)
      try {
        const res = await getWithAuth(`/hotels/${id}`, token)
        const data = res.data && res.data.data ? res.data.data : res.data
        if(mounted) setHotel(data)
      } catch (error) {
        console.error('Error fetching hotel details:', error);
        toast.error('Failed to load hotel')
      } finally {
        if(mounted) setLoading(false)
      }
    }
    if(token) fetchHotel()
    return ()=>{ mounted = false }
  }, [id, token])

  if (loading) return <div className="p-3 text-center"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>

  if (!hotel) return <div className="p-3 text-center text-muted">Hotel not found</div>

  const cityStateLine = [hotel.city, hotel.state, hotel.pincode].map((v) => String(v || '').trim()).filter(Boolean).join(', ')
  const fullAddressLine = [hotel.address1, hotel.address2].map((v) => String(v || '').trim()).filter(Boolean).join(', ')

  return (
    <div className="extranet-profile">
      <div className="ep-header">
        <div className="ep-header-left">
          <div className="ep-brand-box">
            {hotel.logo ? (
              <img src={resolveAssetUrl(hotel.logo, 'hotels')} alt={hotel.name || 'Hotel logo'} />
            ) : (
              <span className="ep-no-logo">No Logo</span>
            )}
          </div>
          <div className="ep-title-block">
            <h1 className="ep-title">{safe(hotel.name)}</h1>
            <div className="ep-meta-row">
              <span className="ep-meta-tag">{safe(hotel.property_type || 'Property')}</span>
              {hotel.star_rating > 0 && (
                <span className="ep-meta-tag ep-stars">{hotel.star_rating} Stars</span>
              )}
              <span className={`ep-status-tag ${String(hotel.status || '').toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
                {safe(hotel.status).toUpperCase()}
              </span>
            </div>
            <div className="ep-address-row">
              <i className="fa-solid fa-map-marker-alt"></i> {safe(cityStateLine || fullAddressLine)}
            </div>
          </div>
        </div>
        <div className="ep-header-right">
          <button className="ep-btn ep-btn-outline" onClick={() => navigate('/hotels')}>
            Back to List
          </button>
          <button className="ep-btn ep-btn-primary" onClick={() => navigate(`/hotels/${id}/edit`)}>
            Edit Details
          </button>
        </div>
      </div>

      <div className="ep-body">
        <div className="ep-row">
          
          <div className="ep-col ep-col-side">
            <div className="ep-panel">
              <div className="ep-panel-head">System Timeline</div>
              <div className="ep-panel-body">
                <table className="ep-table">
                  <tbody>
                    <tr>
                      <td>Created</td>
                      <td className="ep-val-right">{formatDateTime(hotel.created_at)}</td>
                    </tr>
                    <tr>
                      <td>Updated</td>
                      <td className="ep-val-right">{formatDateTime(hotel.updated_at)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ep-col ep-col-main">
            <div className="ep-panel">
              <div className="ep-panel-head">Contact & Legal</div>
              <div className="ep-panel-body">
                <div className="ep-grid-2">
                  <div className="ep-data-group">
                    <label>Phone Number</label>
                    <div className="ep-data-val">{safe(hotel.phone)}</div>
                  </div>
                  <div className="ep-data-group">
                    <label>Email Address</label>
                    <div className="ep-data-val">{safe(hotel.email)}</div>
                  </div>
                  <div className="ep-data-group">
                    <label>Website</label>
                    <div className="ep-data-val">
                      {hotel.website ? (
                        <a href={hotel.website.startsWith('http') ? hotel.website : `https://${hotel.website}`} target="_blank" rel="noopener noreferrer" className="ep-link">
                          {hotel.website}
                        </a>
                      ) : (
                        '-'
                      )}
                    </div>
                  </div>
                </div>
                <hr className="ep-divider" />
                <div className="ep-grid-3">
                  <div className="ep-data-group">
                    <label>Tax Type</label>
                    <div className="ep-data-val">{safe(hotel.tax_type)}</div>
                  </div>
                  <div className="ep-data-group">
                    <label>Tax Rate</label>
                    <div className="ep-data-val">{Number(hotel.tax_percent || 0).toFixed(2)}%</div>
                  </div>
                  <div className="ep-data-group">
                    <label>GST/Tax ID</label>
                    <div className="ep-data-val">{safe(hotel.gst_number)}</div>
                  </div>
                  <div className="ep-data-group">
                    <label>PAN Number</label>
                    <div className="ep-data-val">{safe(hotel.pan_number)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="ep-panel">
              <div className="ep-panel-head">Full Address</div>
              <div className="ep-panel-body">
                <div className="ep-grid-2">
                  <div className="ep-data-group" style={{gridColumn: '1 / -1'}}>
                    <label>Line 1</label>
                    <div className="ep-data-val">{safe(hotel.address1)}</div>
                  </div>
                  <div className="ep-data-group" style={{gridColumn: '1 / -1'}}>
                    <label>Line 2</label>
                    <div className="ep-data-val">{safe(hotel.address2)}</div>
                  </div>
                  <div className="ep-data-group">
                    <label>City</label>
                    <div className="ep-data-val">{safe(hotel.city)}</div>
                  </div>
                  <div className="ep-data-group">
                    <label>State</label>
                    <div className="ep-data-val">{safe(hotel.state)}</div>
                  </div>
                  <div className="ep-data-group">
                    <label>Country</label>
                    <div className="ep-data-val">{safe(hotel.country)}</div>
                  </div>
                  <div className="ep-data-group">
                    <label>Pincode</label>
                    <div className="ep-data-val">{safe(hotel.pincode)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="ep-panel">
              <div className="ep-panel-head">Property Description</div>
              <div className="ep-panel-body">
                <p className="ep-text-block">{safe(hotel.description)}</p>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}

export default HotelDetail;
