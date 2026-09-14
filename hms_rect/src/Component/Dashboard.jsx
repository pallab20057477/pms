import React, {useEffect, useState} from 'react'
import { useSelector } from 'react-redux'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { getWithAuth } from '../api'
import './DashboardModern.css'

ChartJS.register(ArcElement, Tooltip, Legend)

export default function Dashboard(){
  const token = useSelector(s => s.auth.accesstoken)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)

  useEffect(()=>{
    if (!token) return setLoading(false)
    setLoading(true)
    getWithAuth('/dashboard/summary', token)
      .then(res=>{
        setSummary(res.data)
        setError(null)
      })
      .catch(err=>{
        setError(err?.response?.data || err.message)
      })
      .finally(()=>setLoading(false))
  },[token])

  const roomData = summary ? {
    labels: ['Available', 'Occupied', 'Dirty', 'Cleaning', 'Maintenance'],
    datasets: [{
      data: [
        summary.available_rooms || 0, 
        summary.occupied_rooms || 0, 
        summary.dirty_rooms || 0, 
        summary.cleaning_rooms || 0, 
        summary.maintenance_rooms || 0
      ],
      backgroundColor: ['#059669', '#2563EB', '#D97706', '#0891B2', '#DC2626'],
      borderColor: '#ffffff',
      borderWidth: 2,
      hoverOffset: 4,
    }]
  } : null

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          font: { family: 'Inter, sans-serif', size: 12, weight: 500 },
          color: '#334155'
        }
      }
    }
  }

  const totalRooms = Number(summary?.total_rooms || 0)
  const occupiedRooms = Number(summary?.occupied_rooms || 0)
  const occupancyPct = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100) : 0
  
  const today = new Date().toLocaleDateString('en-GB')

  const alertItems = [
    {
      label: 'Dirty Rooms',
      value: Number(summary?.alerts?.dirty_rooms || 0),
      desc: 'Requires immediate housekeeping',
      tone: 'warn',
    },
    {
      label: 'Maintenance',
      value: Number(summary?.alerts?.maintenance_rooms || 0),
      desc: 'Rooms blocked for repair',
      tone: 'danger',
    },
    {
      label: 'Pending Payments',
      value: Number(summary?.alerts?.pending_payments_count || 0),
      desc: `₹${Number(summary?.alerts?.pending_payments_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} outstanding`,
      tone: 'info',
    },
  ]

  return (
    <div className="ota-dashboard-wrapper">
      {/* EXECUTIVE STRIP */}
      <div className="ota-exec-strip">
        <div className="ota-exec-left">
          <h1 className="ota-exec-title">Property Operations Center</h1>
          <p className="ota-exec-subtitle">Live inventory distribution and financial health summary</p>
        </div>
        <div className="ota-exec-right">
          <div className="ota-date-badge">
            <i className="fa-regular fa-calendar" style={{marginRight: '6px'}}></i> {today}
          </div>
        </div>
      </div>

      {loading && (
        <div className="ota-loading-state">
          <i className="fa-solid fa-circle-notch fa-spin"></i> Fetching property metrics...
        </div>
      )}
      
      {error && (
        <div className="ota-error-state">
          <i className="fa-solid fa-circle-exclamation"></i> {typeof error === 'string' ? error : JSON.stringify(error)}
        </div>
      )}

      {summary && (
        <div className="ota-dashboard-content">
          {/* KPI GRID */}
          <div className="ota-kpi-grid">
            <div className="ota-kpi-card">
              <div className="ota-kpi-decorator total"></div>
              <div className="ota-kpi-header">Total Inventory</div>
              <div className="ota-kpi-val">{summary.total_rooms || 0}</div>
              <div className="ota-kpi-footer">Managed units</div>
            </div>
            
            <div className="ota-kpi-card">
              <div className="ota-kpi-decorator available"></div>
              <div className="ota-kpi-header">Sellable Rooms</div>
              <div className="ota-kpi-val">{summary.available_rooms || 0}</div>
              <div className="ota-kpi-footer">Ready for check-in</div>
            </div>
            
            <div className="ota-kpi-card">
              <div className="ota-kpi-decorator occupied"></div>
              <div className="ota-kpi-header">Active Occupancy</div>
              <div className="ota-kpi-val">{summary.occupied_rooms || 0}</div>
              <div className="ota-kpi-footer">{occupancyPct.toFixed(1)}% of total capacity</div>
            </div>
            
            <div className="ota-kpi-card">
              <div className="ota-kpi-decorator revenue"></div>
              <div className="ota-kpi-header">Realized Revenue</div>
              <div className="ota-kpi-val">₹{Number(summary.todays_revenue || 0).toLocaleString('en-IN')}</div>
              <div className="ota-kpi-footer">Gross collection today</div>
            </div>
          </div>

          <div className="ota-dashboard-panels">
            {/* CHART PANEL */}
            <div className="ota-panel ota-panel-chart">
              <div className="ota-panel-head">
                <h2>Inventory Distribution</h2>
              </div>
              <div className="ota-panel-body">
                <div className="ota-chart-wrap">
                  {roomData ? <Doughnut data={roomData} options={chartOptions} /> : <span>No inventory data</span>}
                </div>
              </div>
            </div>

            {/* ACTION CENTER */}
            <div className="ota-panel ota-panel-alerts">
              <div className="ota-panel-head">
                <h2>Action Center</h2>
              </div>
              <div className="ota-panel-body p-0">
                <div className="ota-action-list">
                  {alertItems.map((item, i) => (
                    <div key={i} className="ota-action-item">
                      <div className="ota-action-text">
                        <div className="ota-action-title">{item.label}</div>
                        <div className="ota-action-desc">{item.desc}</div>
                      </div>
                      <div className={`ota-action-count ${item.tone}`}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
