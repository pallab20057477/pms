import React from 'react';
import { BookingBar, statusLabel, timelineStyle } from './BookingBar';
import { toInputDate, isWeekend, DAY_MS, addDays } from '../../../Functions/dateUtils';

const BAR_HEIGHT = 36;
const BAR_GAP = 10;
const BAR_TOP = 8;

function normalizeStatus(status) {
  return String(status || '').toLowerCase().replaceAll('-', '_');
}

function roomStatusClass(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'available') return 'available';
  if (normalized === 'occupied') return 'occupied';
  if (normalized === 'reserved') return 'reserved';
  if (normalized === 'maintenance') return 'maintenance';
  if (normalized === 'dirty') return 'dirty';
  return 'default';
}

function roomMetaText(room, roomEntry) {
  const stayCount = roomEntry?.items?.length || 0;
  const type = (typeof room.room_type === 'object' ? room.room_type?.name : room.room_type) || 'Room';
  if (!stayCount) return type;
  return `${type} | ${stayCount} stay${stayCount > 1 ? 's' : ''}`;
}

export const RoomRow = React.memo(function RoomRow({
  room,
  roomEntry,
  days,
  daysCount,
  dayGridStyle,
  today,
  rangeStart,
  rangeEndExclusive,
  selectionRange,
  selectionRoom,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
  cancelSelection,
  inSelection,
  draggedBooking,
  dragCurrentRange,
  dragCurrentRoom,
  onBookingDragStart
}) {
  const roomId = room.id || String(room.room_number);
  const isSelectedRoom = selectionRoom === roomId;
  const effectiveLaneCount = roomEntry.laneCount + (isSelectedRoom && selectionRange ? 1 : 0);

  return (
    <div className="booking-board-grid booking-board-row planner-grid-row">
      <div className="booking-board-room-cell planner-room-cell">
        <div className="booking-board-room-main">
          <strong>{room.room_number || 'Room'}</strong>
          <span>{roomMetaText(room, roomEntry)}</span>
        </div>
        <div className="planner-room-side">
          <div className={`booking-board-room-status ${roomStatusClass(room.status)}`}>
            <i className="fa-solid fa-circle" style={{ fontSize: '6px' }} />
            <span>{statusLabel(room.status)}</span>
          </div>
          {roomEntry.items.length ? (
            <span className="planner-room-booking-count">{roomEntry.items.length}</span>
          ) : null}
        </div>
      </div>

      <div
        className="booking-board-track planner-track"
        style={{
          position: 'relative',
          minHeight: `${Math.max(68, BAR_TOP + effectiveLaneCount * (BAR_HEIGHT + BAR_GAP))}px`,
          width: `${daysCount * 64}px`,
          minWidth: `${daysCount * 64}px`,
          flexShrink: 0
        }}
        onPointerLeave={cancelSelection} // Cancel drag if leaving track area completely
      >
        <div className="booking-board-track-grid" style={dayGridStyle}>
          {days.map((day) => {
            const selected = inSelection(day);
            return (
              <div
                key={`${roomId}-${day.toISOString()}`}
                data-date={toInputDate(day)}
                onPointerDown={(e) => {
                  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err) {}
                  onPointerDown(day, roomId);
                }}
                onPointerEnter={() => onPointerEnter(day, roomId)}
                onPointerUp={() => onPointerUp(day, roomId)}
                className={[
                  'booking-board-track-day',
                  'planner-track-day',
                  toInputDate(day) === toInputDate(today) ? 'is-today' : '',
                  isWeekend(day) ? 'is-weekend' : '',
                  isSelectedRoom && selected ? 'is-selected' : '',
                ].filter(Boolean).join(' ')}
              />
            );
          })}
        </div>

        {roomEntry.items.map((booking) => (
          <BookingBar
            key={booking.id}
            booking={booking}
            rangeStart={rangeStart}
            rangeEndExclusive={rangeEndExclusive}
            onBookingDragStart={onBookingDragStart}
            isDragged={draggedBooking?.id === booking.id}
            initialRoom={roomId}
          />
        ))}

        {isSelectedRoom && selectionRange && (
          <div
            style={{
              ...timelineStyle(selectionRange.start, addDays(selectionRange.end, 1), rangeStart, rangeEndExclusive),
              position: 'absolute',
              top: `${BAR_TOP + roomEntry.laneCount * (BAR_HEIGHT + BAR_GAP)}px`,
              height: `${BAR_HEIGHT}px`,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '2px dashed #3b82f6',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1d4ed8',
              fontWeight: '600',
              fontSize: '13px',
              pointerEvents: 'none',
              zIndex: 10,
              boxSizing: 'border-box',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)',
              whiteSpace: 'nowrap',
              overflow: 'hidden'
            }}
          >
            {Math.max(1, Math.round((selectionRange.end.getTime() - selectionRange.start.getTime()) / DAY_MS) + 1)} Nights
          </div>
        )}

        {/* Render Ghost Bar for Dragged Booking */}
        {dragCurrentRoom === roomId && dragCurrentRange && draggedBooking && (
          <div
            className={`booking-board-bar planner-booking-bar is-ghost ${normalizeStatus(draggedBooking.status)}`}
            style={{
              ...timelineStyle(dragCurrentRange.start, addDays(dragCurrentRange.start, dragCurrentRange.duration / DAY_MS), rangeStart, rangeEndExclusive),
              top: `${BAR_TOP + (draggedBooking._lane || 0) * (BAR_HEIGHT + BAR_GAP)}px`,
              height: `${BAR_HEIGHT}px`,
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
              opacity: 0.8
            }}
          >
            <span className="booking-board-bar-icon planner-booking-icon">
               <i className="fa-solid fa-arrows-up-down-left-right" />
            </span>
            <span className="booking-board-bar-title planner-booking-title" style={{ paddingLeft: '24px' }}>
              Moving: {draggedBooking.guest_name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  if (prev.roomEntry !== next.roomEntry) return false;
  if (prev.daysCount !== next.daysCount) return false;
  
  const prevIsSelected = prev.selectionRoom === (prev.room.id || String(prev.room.room_number));
  const nextIsSelected = next.selectionRoom === (next.room.id || String(next.room.room_number));
  if (prevIsSelected !== nextIsSelected) return false;
  if (nextIsSelected && (prev.selectionRange !== next.selectionRange)) return false;

  const prevIsDragTarget = prev.dragCurrentRoom === (prev.room.id || String(prev.room.room_number));
  const nextIsDragTarget = next.dragCurrentRoom === (next.room.id || String(next.room.room_number));
  if (prevIsDragTarget !== nextIsDragTarget) return false;
  if (nextIsDragTarget && (prev.dragCurrentRange !== next.dragCurrentRange)) return false;

  const hasDraggedBookingChange = prev.roomEntry.items.some(b => prev.draggedBooking?.id === b.id || next.draggedBooking?.id === b.id);
  if (hasDraggedBookingChange && (prev.draggedBooking?.id !== next.draggedBooking?.id)) return false;

  return true;
});
