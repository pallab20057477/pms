import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { deleteWithAuth, getWithAuth } from '../api'
import { resolveAssetUrl } from '../Functions/assetUrl'
import toast from 'react-hot-toast'
import './GuestListModern.css'

export function renderLoyaltyBadge(tier) {
  const t = String(tier || '').trim().toLowerCase()
  if (t === 'vip') return <span className="loyalty-badge loyalty-vip">VIP</span>
  if (t === 'platinum') return <span className="loyalty-badge loyalty-platinum">Platinum</span>
  if (t === 'gold') return <span className="loyalty-badge loyalty-gold">Gold</span>
  if (t === 'silver') return <span className="loyalty-badge loyalty-silver">Silver</span>
  return <span className="loyalty-badge loyalty-standard">Standard</span>
}

export default function GuestList() {
  const token = useSelector((s) => s.auth.accesstoken)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [idVerified, setIdVerified] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = { page, page_size: pageSize }
      if (query.trim()) params.q = query.trim()
      if (idVerified !== '') params.id_verified = idVerified
      const res = await getWithAuth('/guests', token, { params })
      const body = res.data || {}
      setRows(body.items || [])
      setTotal(Number(body.total || 0))
    } catch (e) {
      console.error('Failed to load guests', e)
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, query, idVerified])

  useEffect(() => {
    load()
  }, [load])

  function onSearchSubmit(e) {
    e.preventDefault()
    setPage(1)
    load()
  }

  async function onDeleteGuest(guest) {
    if (!token) return
    const ok = window.confirm(`Delete customer ${guest.name}? This action cannot be undone.`)
    if (!ok) return
    try {
      await deleteWithAuth(`/guests/${guest.id}`, token)
      toast.success('Customer deleted')
      load()
    } catch (e) {
      console.error(e)
      toast.error(e?.response?.data?.error || 'Failed to delete customer')
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])
  const verifiedCount = useMemo(() => rows.filter((g) => g.id_verified).length, [rows])
  const unverifiedCount = useMemo(() => rows.filter((g) => !g.id_verified).length, [rows])
  const proofCount = useMemo(() => rows.filter((g) => Boolean(g.proof_document)).length, [rows])

  return (
    <>
      <section className="guest-page-header">
        <div className="guest-page-header-icon">
          <i className="fa-solid fa-users"></i>
        </div>
        <div className="guest-page-header-title">
          <h1>Customer Management</h1>
          <p>Customer List</p>
        </div>
      </section>

      <section className="content">
        <div className="row guest-kpi-row">
          <div className="col-sm-6 col-md-3">
            <div className="guest-kpi-card guest-kpi-total">
              <div className="guest-kpi-icon"><i className="fa-solid fa-users" /></div>
              <div>
                <div className="guest-kpi-label">Total Customers</div>
                <div className="guest-kpi-value">{total}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-md-3">
            <div className="guest-kpi-card guest-kpi-verified">
              <div className="guest-kpi-icon"><i className="fa-solid fa-circle-check" /></div>
              <div>
                <div className="guest-kpi-label">ID Verified</div>
                <div className="guest-kpi-value">{verifiedCount}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-md-3">
            <div className="guest-kpi-card guest-kpi-unverified">
              <div className="guest-kpi-icon"><i className="fa-solid fa-circle-xmark" /></div>
              <div>
                <div className="guest-kpi-label">ID Pending</div>
                <div className="guest-kpi-value">{unverifiedCount}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-md-3">
            <div className="guest-kpi-card guest-kpi-proof">
              <div className="guest-kpi-icon"><i className="fa-solid fa-file-contract" /></div>
              <div>
                <div className="guest-kpi-label">With Proof</div>
                <div className="guest-kpi-value">{proofCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag guest-list-panel">
              <div className="panel-heading guest-list-heading">
                <h4 className="guest-list-title">Manage Customers</h4>
                <p className="guest-list-subtitle">Track identity verification, stay history, and profile records.</p>
              </div>
              <div className="panel-body">
                <div className="guest-toolbar">
                  <button type="button" className="btn btn-add guest-add-btn" onClick={() => navigate('/guests/new')}>
                    <i className="fa-solid fa-plus"></i> Add New Customer
                  </button>
                </div>

                <form className="row guest-filter-row" style={{ marginBottom: 12 }} onSubmit={onSearchSubmit}>
                  <div className="col-sm-4">
                    <div className="input-group guest-search-group">
                      <span className="input-group-addon"><i className="fa-solid fa-magnifying-glass"></i></span>
                      <input
                        className="form-control"
                        placeholder="Search by name or phone"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-sm-3">
                    <select className="form-control" value={idVerified} onChange={(e) => { setIdVerified(e.target.value); setPage(1) }}>
                      <option value="">All ID status</option>
                      <option value="true">ID Verified</option>
                      <option value="false">ID Not Verified</option>
                    </select>
                  </div>
                  <div className="col-sm-2">
                    <select className="form-control" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                      <option value={10}>10 / page</option>
                      <option value={20}>20 / page</option>
                      <option value={50}>50 / page</option>
                    </select>
                  </div>
                  <div className="col-sm-2">
                    <button className="btn btn-primary guest-search-btn" type="submit">Search</button>
                  </div>
                </form>

                <div className="table-responsive guest-table-wrap" style={{ paddingRight: 8 }}>
                  <table className="table table-bordered table-hover guest-table mb-0">
                    <thead>
                      <tr>
                        <th style={{ width: 70 }}>Photo</th>
                        <th>Name</th>
                        <th>Contact</th>
                        <th>Nationality</th>
                        <th>Loyalty Tier</th>
                        <th>Proof</th>
                        <th>Stays</th>
                        <th>Last Visit</th>
                        <th style={{ width: 210 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={9} className="text-center" style={{ padding: '24px 0' }}>
                            <i className="fa-solid fa-spinner fa-spin spinning-icon"></i> Loading customers...
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center text-muted" style={{ padding: '18px 0' }}>
                            No customers found.
                          </td>
                        </tr>
                      ) : rows.map((g) => (
                        <tr key={g.id}>
                          <td>
                            {g.photo ? (
                              <img
                                src={resolveAssetUrl(g.photo, 'guests')}
                                alt={g.name}
                                style={{ width: 42, height: 42, borderRadius: 21, objectFit: 'cover' }}
                              />
                            ) : (
                              <div style={{ width: 42, height: 42, borderRadius: 21, background: '#f1f3f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fa-solid fa-user text-muted"></i>
                              </div>
                            )}
                          </td>
                          <td>{g.name}</td>
                          <td>
                            {g.phone}
                            <br/>
                            <span style={{ fontSize: 11, color: '#666' }}>{g.email || ''}</span>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>{g.nationality || '-'}</td>
                          <td>
                            {renderLoyaltyBadge(g.loyalty_tier)}
                          </td>
                          <td>
                            {g.proof_document ? (
                              <div className="guest-proof-wrap">
                                <span className="guest-proof-chip has-proof">Uploaded</span>
                                <a
                                  className="btn btn-xs btn-primary guest-proof-btn"
                                  href={resolveAssetUrl(g.proof_document, 'guests')}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <i className="fa-solid fa-folder-open" /> View Document
                                </a>
                              </div>
                            ) : (
                              <div className="guest-proof-wrap">
                                <span className="guest-proof-chip no-proof">Not Uploaded</span>
                                <button className="btn btn-xs btn-default guest-proof-btn" type="button" disabled>
                                  <i className="fa-solid fa-folder-closed" /> View Document
                                </button>
                              </div>
                            )}
                          </td>
                          <td>{g.total_previous_stays ?? 0}</td>
                          <td>{g.last_visit_date ? new Date(g.last_visit_date).toLocaleDateString('en-GB') : '-'}</td>
                          <td>
                            <button className="guest-action-btn guest-btn-view" onClick={() => navigate(`/guests/${g.id}`)} title="View profile">
                              <i className="fa-solid fa-eye"></i> View
                            </button>
                            <button className="guest-action-btn guest-btn-edit" onClick={() => navigate(`/guests/${g.id}?edit=1`)} title="Edit customer">
                              <i className="fa-solid fa-pen-to-square"></i> Edit
                            </button>
                            <button className="guest-action-btn guest-btn-delete" onClick={() => onDeleteGuest(g)} title="Delete customer">
                              <i className="fa-solid fa-trash"></i> Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-center guest-pagination-wrap" style={{ marginTop: 18 }}>
                  <nav>
                    <ul className="pagination pagination-sm" style={{ margin: 0 }}>
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
