import React from 'react';
import { formatYear, toInputDate, formatWeekday, formatDayNumber, isWeekend } from '../../../Functions/dateUtils';

export function TimelineHeader({
  anchorMonth,
  daysCount,
  dayGridStyle,
  monthSegments,
  days,
  today,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
  cancelSelection,
  selectionStart,
  selectionEnd,
  isSelecting,
  inSelection
}) {
  return (
    <div className="booking-board-grid booking-board-grid-head planner-grid-head" style={{ minWidth: 'max-content' }}>
      <div className="booking-board-resource-head planner-resource-head">
        <span>ROOMS</span>
        <strong>{formatYear(anchorMonth)}</strong>
      </div>
      <div className="planner-days-head-wrap" style={{ width: `${daysCount * 64}px`, minWidth: `${daysCount * 64}px`, flexShrink: 0 }} onPointerLeave={cancelSelection}>
        <div className="planner-month-band" style={dayGridStyle}>
          {monthSegments.map((segment) => (
            <div
              className="planner-month-segment"
              key={segment.key}
              style={{ gridColumn: `${segment.offset + 1} / span ${segment.days}`, borderRight: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}
            >
              <div style={{ position: 'sticky', left: '180px', display: 'inline-block', padding: '4px 16px' }}>
                <strong style={{ color: '#2563eb', fontSize: '12px' }}>{segment.label}</strong>
                <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '4px', fontWeight: 600 }}>{segment.year}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="booking-board-days planner-days-head" style={dayGridStyle}>
          {days.map((day) => {
            const isToday = toInputDate(day) === toInputDate(today);
            const selected = inSelection(day);
            return (
              <div
                key={day.toISOString()}
                data-date={toInputDate(day)}
                onPointerDown={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  onPointerDown(day, null);
                }}
                onPointerEnter={() => onPointerEnter(day, null)}
                onPointerUp={() => onPointerUp(day, null)}
                className={[
                  'booking-board-day-head',
                  'planner-day-head',
                  isToday ? 'is-today' : '',
                  isWeekend(day) ? 'is-weekend' : '',
                  selected ? 'is-selected' : '',
                ].filter(Boolean).join(' ')}
              >
                <span>{formatWeekday(day)}</span>
                <strong>{formatDayNumber(day)}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
