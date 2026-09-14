import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatStayRange, startOfDay, DAY_MS } from '../../../Functions/dateUtils';

const BAR_HEIGHT = 36;
const BAR_GAP = 10;
const BAR_TOP = 8;
const BOOKING_THEMES = ['theme-rose', 'theme-amber', 'theme-blue', 'theme-emerald', 'theme-cyan', 'theme-orange'];

function normalizeStatus(status) {
  return String(status || '').toLowerCase().replaceAll('-', '_');
}

export function statusLabel(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'checked_in') return 'Checked-in';
  if (normalized === 'checked_out') return 'Checked-out';
  return normalized ? normalized.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Unknown';
}

function bookingThemeClass(booking) {
  const normalized = normalizeStatus(booking.status);
  if (normalized === 'checked_in') return 'theme-emerald';
  if (normalized === 'cancelled' || normalized === 'completed' || normalized === 'checked_out') return 'theme-slate';
  return BOOKING_THEMES[(booking.id || 0) % BOOKING_THEMES.length];
}

function bookingIconClass(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'checked_in') return 'fa-right-to-bracket';
  if (normalized === 'checked_out' || normalized === 'completed') return 'fa-right-from-bracket';
  if (normalized === 'reserved') return 'fa-calendar-check';
  if (normalized === 'cancelled') return 'fa-ban';
  return 'fa-user';
}

function bookingDisplayName(booking) {
  const guest = String(booking.guest_name || 'Guest').trim();
  return `#${booking.id} ${guest}`;
}

export function timelineStyle(checkIn, checkOut, rangeStart, rangeEndExclusive) {
  const start = Math.max(startOfDay(checkIn).getTime(), rangeStart.getTime());
  const end = Math.min(startOfDay(checkOut).getTime(), rangeEndExclusive.getTime());
  const total = rangeEndExclusive.getTime() - rangeStart.getTime();
  const offset = Math.max(0, start - rangeStart.getTime());
  const width = Math.max(DAY_MS * 0.8, end - start);

  return {
    left: `${(offset / total) * 100}%`,
    width: `${(width / total) * 100}%`,
  };
}

export const BookingBar = React.memo(function BookingBar({ booking, rangeStart, rangeEndExclusive, onBookingDragStart, isDragged, initialRoom }) {
  const navigate = useNavigate();

  if (!booking._checkIn || !booking._checkOut) return null;

  const nights = Math.max(1, Math.round((booking._displayCheckOut.getTime() - booking._displayCheckIn.getTime()) / DAY_MS));

  return (
    <button
      type="button"
      className={`booking-board-bar planner-booking-bar ${bookingThemeClass(booking)} ${isDragged ? 'is-dragged' : ''}`}
      style={{
        ...timelineStyle(booking._checkIn, booking._checkOut, rangeStart, rangeEndExclusive),
        top: `${BAR_TOP + booking._lane * (BAR_HEIGHT + BAR_GAP)}px`,
        height: `${BAR_HEIGHT}px`,
        opacity: isDragged ? 0.5 : 1,
        cursor: booking.status === 'reserved' ? 'grab' : 'pointer'
      }}
      onClick={(e) => {
        if (!isDragged) navigate(`/booking/${booking.id}/folio`);
      }}
      onPointerDown={(e) => {
        if (onBookingDragStart) {
          onBookingDragStart(e, booking, initialRoom);
        }
      }}
      title={`${bookingDisplayName(booking)} | ${formatStayRange(booking._displayCheckIn, booking._displayCheckOut)} (${nights} Night${nights !== 1 ? 's' : ''}) | ${booking._usesActualDates ? 'Actual check-in / check-out' : 'Booked stay dates'} | ${statusLabel(booking.status)}`}
    >
      <span className="booking-board-bar-icon planner-booking-icon">
        <i className={`fa-solid ${bookingIconClass(booking.status)}`} />
      </span>
      <span className="booking-board-bar-copy planner-booking-copy">
        <strong>{bookingDisplayName(booking)}</strong>
        <small>
          {formatStayRange(booking._displayCheckIn, booking._displayCheckOut)} | {nights} Night{nights !== 1 ? 's' : ''} | {booking._usesActualDates ? 'Actual' : statusLabel(booking.status)}
        </small>
      </span>
    </button>
  );
});
