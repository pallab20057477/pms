import React from 'react';
import { Link } from 'react-router-dom';
import { MONTH_LABELS, monthAnchor, toInputDate, formatYear } from '../../../Functions/dateUtils';

export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All stays' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'checked_out', label: 'Checked Out' },
  { value: 'reserved', label: 'Reserved' },
];

export function BoardHeader({
  page,
  setPage,
  pageCount,
  canMoveNextPage,
  totalBookings,
  showFilters,
  setShowFilters,
  showMore,
  setShowMore,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  visibleRooms,
  activeVisibleBookings,
  arrivalsToday,
  departuresToday,
  stayCountsByStatus,
  setAnchorDate,
  selectedYear,
  selectedMonth,
  rangeStart,
  selectionRange,
  selectedNights,
  scrollTodayIntoView,
  goToPreviousMonth,
  goToNextMonth,
  goToToday
}) {
  return (
    <div className="planner-board-top planner-top">
      <div className="planner-top-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', padding: '12px 16px', borderBottom: '1px solid var(--bb-border)', background: '#fff' }}>
        <div className="planner-top-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/booking/create" className="planner-add-btn" style={{ padding: '6px 12px', background: '#2563eb', color: 'white', borderRadius: '4px', textDecoration: 'none', fontWeight: 500 }}>
            <i className="fa-solid fa-plus"></i> New Booking
          </Link>
          <button type="button" className="planner-ghost-btn" onClick={goToToday} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white', cursor: 'pointer' }}>
            Today
          </button>
          
          <div className="planner-month-pagination" style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
            <button type="button" className="planner-ghost-btn" onClick={goToPreviousMonth} style={{ padding: '6px 12px', background: 'white', border: 'none', borderRight: '1px solid #e2e8f0', cursor: 'pointer' }}>
              <i className="fa-solid fa-chevron-left"></i> Prev
            </button>
            <div style={{ padding: '0 16px', fontWeight: 'bold', fontSize: '14px', minWidth: '120px', textAlign: 'center', background: '#f8fafc' }}>
              {MONTH_LABELS[selectedMonth]} {selectedYear}
            </div>
            <button type="button" className="planner-ghost-btn" onClick={goToNextMonth} style={{ padding: '6px 12px', background: 'white', border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer' }}>
              Next <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>

          <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }} />

          <button
            type="button"
            style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', background: showFilters ? '#f1f5f9' : 'white', cursor: 'pointer' }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <i className="fa-solid fa-filter"></i> Filters
          </button>
          <button
            type="button"
            style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', background: showMore ? '#f1f5f9' : 'white', cursor: 'pointer' }}
            onClick={() => setShowMore(!showMore)}
          >
            <i className="fa-solid fa-chart-pie"></i> Stats
          </button>
        </div>

        <div className="planner-top-pagination" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
          <span>
            {totalBookings > 0 ? `Total: ${totalBookings} | ` : ''} Page {page} {pageCount > 0 ? `of ${pageCount}` : ''}
          </span>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            style={{ width: '28px', height: '28px', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
          >
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <button
            type="button"
            disabled={!canMoveNextPage}
            onClick={() => setPage(page + 1)}
            style={{ width: '28px', height: '28px', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white', cursor: !canMoveNextPage ? 'not-allowed' : 'pointer', opacity: !canMoveNextPage ? 0.5 : 1 }}
          >
            <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="planner-filters-panel" style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div className="planner-search-wrap" style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px', width: '300px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <i className="fa-solid fa-magnifying-glass" style={{ color: '#94a3b8', marginRight: '8px' }}></i>
            <input
              type="text"
              placeholder="Search rooms, guests, bookings..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '14px', color: '#334155' }}
            />
          </div>

          <div className="planner-status-pills" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, marginRight: '4px' }}>Filter by Status:</span>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: statusFilter === option.value ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                  background: statusFilter === option.value ? '#eff6ff' : 'white',
                  color: statusFilter === option.value ? '#1d4ed8' : '#64748b',
                  transition: 'all 0.2s'
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showMore && (
        <div className="planner-stats-panel" style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: 'white', padding: '12px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '140px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Rooms View</span>
            <strong style={{ fontSize: '20px', color: '#0f172a' }}>{visibleRooms.length}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', background: 'white', padding: '12px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '140px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Stays View</span>
            <strong style={{ fontSize: '20px', color: '#0f172a' }}>{activeVisibleBookings.length}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', background: 'white', padding: '12px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '140px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Arrivals Today</span>
            <strong style={{ fontSize: '20px', color: '#0f172a' }}>{arrivalsToday.length}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', background: 'white', padding: '12px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '140px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Departures Today</span>
            <strong style={{ fontSize: '20px', color: '#0f172a' }}>{departuresToday.length}</strong>
          </div>
          
          <div style={{ width: '1px', background: '#cbd5e1', margin: '0 8px' }}></div>
          
          {Object.entries(stayCountsByStatus).map(([status, count]) => (
            <div key={status} style={{ display: 'flex', flexDirection: 'column', background: 'white', padding: '12px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '120px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{status.replace('_', ' ')}</span>
              <strong style={{ fontSize: '20px', color: '#0f172a' }}>{count}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
