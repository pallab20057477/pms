import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { getWithAuth } from '../api'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import './Dashboard.css'

ChartJS.register(ArcElement, Tooltip, Legend)

// Simple SVG icons
const IcoBuilding = () => <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd"/></svg>
const IcoDoor    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 0v12h10V4H5z" clipRule="evenodd"/><circle cx="13" cy="10" r="1"/></svg>
const IcoBed     = () => <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path d="M2 11V6a2 2 0 012-2h1v3h10V4h1a2 2 0 012 2v5H2z"/><path d="M1 12h18v3a1 1 0 01-1 1H2a1 1 0 01-1-1v-3z"/></svg>
const IcoWallet  = () => <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" clipRule="evenodd"/><path fillRule="evenodd" d="M2 9v5a2 2 0 002 2h12a2 2 0 002-2V9H2zm12 3a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>
const IcoPlus    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd"/></svg>
const IcoRefresh = () => <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/></svg>
const IcoRight   = () => <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
const IcoSmile   = () => <svg viewBox="0 0 20 20" fill="currentColor" width="28" height="28" style={{opacity:0.25}}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd"/></svg>

export default function Dashboard() {
  const navigate = useNavigate()
  const token = useSelector(s => s.auth.accesstoken)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const res = await getWithAuth('dashboard/summary', token)
      const body = res.data
      // Backend wraps in {data: ...} when cached, direct otherwise
      setData(body?.data ?? body)
    } catch (e) {
      console.error('Dashboard load failed:', e)
    }
  }

  useEffect(() => {
    let t
    if (token) {
      setLoading(true)
      load().then(() => setLoading(false))
      t = setInterval(load, 60000) // refresh every 60s
    }
    return () => clearInterval(t)
  }, [token])

  // Chart
  const chartData = useMemo(() => ({
    labels: ['Available', 'Occupied', 'Dirty', 'Cleaning', 'Maintenance'],
    datasets: [{
      data: [
        Number(data?.available_rooms || 0),
        Number(data?.occupied_rooms || 0),
        Number(data?.dirty_rooms || 0),
        Number(data?.cleaning_rooms || 0),
        Number(data?.maintenance_rooms || 0),
      ],
      backgroundColor: ['#16A34A', '#2563EB', '#D97706', '#0EA5E9', '#DC2626'],
      borderWidth: 2,
      borderColor: '#fff',
      hoverOffset: 3,
    }],
  }), [data])

  const chartOpts = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 7,
          font: { family: 'Inter, sans-serif', size: 12, weight: '500' },
          color: '#64748B',
          padding: 14,
        },
      },
      tooltip: {
        backgroundColor: '#0F172A',
        padding: 10,
        titleFont: { size: 12, weight: '600' },
        bodyFont: { size: 12 },
        cornerRadius: 4,
      },
    },
  }), [])

  const today = new Date().toLocaleDateString('en-GB')

  if (loading) {
    return (
      <div className="dash">
        <div className="dash-loading">
          <div className="dash-spin" />
          Loading dashboard…
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="dash">
        <div className="dash-loading">
          Unable to load data. Check your connection and refresh.
        </div>
      </div>
    )
  }

  const checkinsCount  = Array.isArray(data.checkins) ? data.checkins.length : 0
  const checkoutsCount = Array.isArray(data.checkouts) ? data.checkouts.length : 0
  const pendingAmt     = Number(data.alerts?.pending_payments_amount || 0)
  const dirtyList      = Array.isArray(data.dirty_rooms_list) ? data.dirty_rooms_list : []

  return (
    <div className="dash">

      {/* Header */}
      <div className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <p>Today's operations overview</p>
        </div>
        <div className="dash-actions">
          <span className="dash-date">{today}</span>
          <button className="dash-btn dash-btn-secondary" onClick={load} title="Refresh metrics">
            <IcoRefresh /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dash-kpis">
        <div className="dash-kpi">
          <div className="dash-kpi-info">
            <div className="dash-kpi-label">Total Rooms</div>
            <h2 className="dash-kpi-val">{Number(data.total_rooms || 0)}</h2>
            <div className="dash-kpi-sub">Managed inventory</div>
          </div>
          <div className="dash-kpi-icon rooms"><IcoBuilding /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-info">
            <div className="dash-kpi-label">Available</div>
            <h2 className="dash-kpi-val">{Number(data.available_rooms || 0)}</h2>
            <div className="dash-kpi-sub ok">Ready for check-in</div>
          </div>
          <div className="dash-kpi-icon avail"><IcoDoor /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-info">
            <div className="dash-kpi-label">Occupied</div>
            <h2 className="dash-kpi-val">{Number(data.occupied_rooms || 0)}</h2>
            <div className="dash-kpi-sub info">In-house guests</div>
          </div>
          <div className="dash-kpi-icon occ"><IcoBed /></div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-info">
            <div className="dash-kpi-label">Today's Revenue</div>
            <h2 className="dash-kpi-val">₹{Number(data.todays_revenue || 0).toLocaleString('en-IN')}</h2>
            <div className="dash-kpi-sub">Collected today</div>
          </div>
          <div className="dash-kpi-icon rev"><IcoWallet /></div>
        </div>
      </div>

      {/* Two-column content */}
      <div className="dash-grid">

        {/* Left - Chart + front office */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="dash-panel">
            <div className="dash-panel-head">
              <h3 className="dash-panel-title">Room Status</h3>
              <button className="dash-panel-action" onClick={load}>
                <IcoRefresh /> Refresh
              </button>
            </div>
            <div className="dash-chart-wrap">
              <div style={{ width: '100%', maxWidth: 360, height: 200 }}>
                <Doughnut data={chartData} options={chartOpts} />
              </div>
            </div>
          </div>

          <div className="dash-panel">
            <div className="dash-panel-head">
              <h3 className="dash-panel-title">Front Office</h3>
            </div>
            <table className="dash-table">
              <tbody>
                <tr>
                  <td>Expected check-ins</td>
                  <td className="right fw">{checkinsCount}</td>
                </tr>
                <tr>
                  <td>Expected check-outs</td>
                  <td className="right fw">{checkoutsCount}</td>
                </tr>
                <tr>
                  <td>Housekeeping queue</td>
                  <td className="right fw">{Number(data.dirty_rooms || 0) + Number(data.cleaning_rooms || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right - Actions + dirty rooms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="dash-panel">
            <div className="dash-panel-head">
              <h3 className="dash-panel-title">Pending Actions</h3>
            </div>
            <div className="dash-action-list">
              <div className="dash-action-item" onClick={() => navigate('/housekeeping/dirty')}>
                <div className="dash-action-info">
                  <h4>Dirty Rooms</h4>
                  <p>Needs housekeeping</p>
                </div>
                <span className="dash-action-count warn">{Number(data.alerts?.dirty_rooms || 0)}</span>
              </div>
              <div className="dash-action-item" onClick={() => navigate('/rooms/maintenance')}>
                <div className="dash-action-info">
                  <h4>Under Maintenance</h4>
                  <p>Blocked for repair</p>
                </div>
                <span className="dash-action-count danger">{Number(data.alerts?.maintenance_rooms || 0)}</span>
              </div>
              <div className="dash-action-item" onClick={() => navigate('/folio/running')}>
                <div className="dash-action-info">
                  <h4>Pending Payments</h4>
                  <p>Outstanding balance</p>
                </div>
                <span className="dash-action-count info">₹{pendingAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="dash-panel">
            <div className="dash-panel-head">
              <h3 className="dash-panel-title">Dirty Rooms</h3>
            </div>
            {dirtyList.length > 0 ? (
              <>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Type</th>
                      <th className="right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dirtyList.slice(0, 5).map(rm => (
                      <tr key={rm.id}>
                        <td className="fw">{rm.room_number}</td>
                        <td className="muted">{typeof rm.room_type === 'object' ? (rm.room_type?.name || '-') : (rm.room_type || '-')}</td>
                        <td className="right">
                          <span className="dash-dot dirty" />
                          Dirty
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dirtyList.length > 5 && (
                  <div className="dash-panel-foot" onClick={() => navigate('/housekeeping/dirty')}>
                    View all {dirtyList.length} rooms <IcoRight />
                  </div>
                )}
              </>
            ) : (
              <div className="dash-empty">
                <IcoSmile />
                <p>All rooms are clean</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
