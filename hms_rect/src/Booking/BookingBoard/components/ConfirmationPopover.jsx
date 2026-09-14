import React from 'react';
import { addDays, formatDayNumber, formatShortMonth, formatYear, DAY_MS } from '../../../Functions/dateUtils';

export function ConfirmationPopover({ pendingRange, clearSelection, toCreateBooking }) {
  if (!pendingRange) return null;

  const departure = addDays(pendingRange.end, 1);
  const nights = Math.max(1, Math.round((departure.getTime() - pendingRange.start.getTime()) / DAY_MS));
  const roomInfo = pendingRange.room ? `Room: ${pendingRange.room}` : 'No room selected';

  return (
    <div className="planner-confirm-popover">
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className="fa-solid fa-calendar-plus" style={{ color: '#2563eb' }}></i>
        <strong style={{ fontSize: '15px', color: '#0f172a' }}>Confirm selection</strong>
      </div>
      <div style={{ marginBottom: 4, fontWeight: 600, color: '#2563eb', fontSize: '14px' }}>{roomInfo}</div>
      <div style={{ marginBottom: 8, fontSize: '13px', color: '#334155' }}>
        <i className="fa-solid fa-arrow-right-to-bracket" style={{ width: '16px', color: '#64748b' }}></i> {`${formatDayNumber(pendingRange.start)} ${formatShortMonth(pendingRange.start)} ${formatYear(pendingRange.start)}`}
        <br />
        <i className="fa-solid fa-arrow-right-from-bracket" style={{ width: '16px', color: '#64748b', marginTop: '4px' }}></i> {`${formatDayNumber(departure)} ${formatShortMonth(departure)} ${formatYear(departure)}`}
      </div>
      <div style={{ marginBottom: 12, color: '#64748b', fontSize: '12px', fontWeight: 500, paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>{`${nights} night${nights > 1 ? 's' : ''}`}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="planner-ghost-btn" onClick={() => clearSelection()}>Cancel</button>
        <button type="button" className="planner-add-btn" onClick={() => { toCreateBooking(pendingRange.start, pendingRange.end, pendingRange.room); clearSelection(); }}>Confirm</button>
      </div>
    </div>
  );
}
