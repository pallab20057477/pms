import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useDebounce } from '../../Functions/useDebounce';
import { useBookingData } from './hooks/useBookingData';
import { useTimelineDates } from './hooks/useTimelineDates';
import { useDragSelection } from './hooks/useDragSelection';
import { useBookingDrag } from './hooks/useBookingDrag';
import { BoardHeader } from './components/BoardHeader';
import { TimelineHeader } from './components/TimelineHeader';
import { RoomRow } from './components/RoomRow';
import { ConfirmationPopover } from './components/ConfirmationPopover';
import { parseDate, overlapsRange, toInputDate, startOfDay, addDays, clampRange, DAY_MS } from '../../Functions/dateUtils';
import '../BookingBoard.css';

function normalizeStatus(status) {
  return String(status || '').toLowerCase().replaceAll('-', '_');
}

function resolveBookingRange(booking) {
  const plannedCheckIn = parseDate(booking.check_in_date);
  const plannedCheckOut = parseDate(booking.check_out_date);
  const actualCheckIn = booking.actual_check_in_at ? new Date(booking.actual_check_in_at) : null;
  const actualCheckOut = booking.actual_check_out_at ? new Date(booking.actual_check_out_at) : null;

  const timelineStart = actualCheckIn ? startOfDay(actualCheckIn) : plannedCheckIn;
  let timelineEnd = plannedCheckOut;

  if (actualCheckOut) {
    timelineEnd = startOfDay(actualCheckOut);
  }

  const displayStart = actualCheckIn ? startOfDay(actualCheckIn) : plannedCheckIn;
  const displayEnd = actualCheckOut
    ? addDays(startOfDay(actualCheckOut), -1)
    : addDays(plannedCheckOut, -1);

  return {
    timelineStart,
    timelineEnd,
    displayStart,
    displayEnd,
    usesActualDates: Boolean(actualCheckIn || actualCheckOut),
  };
}

function layoutRoomBookings(items) {
  const laneEnds = [];
  return items.map((booking) => {
    const bookingRange = resolveBookingRange(booking);
    const checkIn = bookingRange.timelineStart;
    const checkOut = bookingRange.timelineEnd;
    let laneIndex = laneEnds.findIndex((laneEnd) => checkIn && laneEnd <= checkIn.getTime());

    if (laneIndex === -1) {
      laneIndex = laneEnds.length;
      laneEnds.push(checkOut ? checkOut.getTime() : Number.MAX_SAFE_INTEGER);
    } else {
      laneEnds[laneIndex] = checkOut ? checkOut.getTime() : Number.MAX_SAFE_INTEGER;
    }

    return {
      ...booking,
      _checkIn: checkIn,
      _checkOut: checkOut,
      _displayCheckIn: bookingRange.displayStart,
      _displayCheckOut: bookingRange.displayEnd,
      _usesActualDates: bookingRange.usesActualDates,
      _lane: laneIndex,
    };
  });
}

function matchesRoomQuery(room, roomBookings, query) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return true;

  const roomTypeName = typeof room.room_type === 'object' ? (room.room_type?.name || '') : String(room.room_type || '');
  const roomFields = [room.room_number, roomTypeName, room.status];
  const bookingFields = roomBookings.flatMap((booking) => [booking.guest_name, booking.booking_code, booking.status]);
  return [...roomFields, ...bookingFields].some((value) => String(value || '').toLowerCase().includes(term));
}

export default function BookingBoardProfessional() {
  const token = useSelector((state) => state.auth.accesstoken);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query, 300);

  const {
    anchorDate, setAnchorDate, anchorMonth, today, selectedMonth, selectedYear,
    rangeStart, daysCount, rangeEndExclusive, days, monthSegments, dayGridStyle,
    goToPreviousMonth, goToNextMonth, goToToday
  } = useTimelineDates();

  const {
    selectionStart, selectionEnd, isSelecting, selectionRoom, pendingRange, setPendingRange,
    selectionRange, confirmAndCreate, toCreateBooking,
    onPointerDown, onPointerEnter, onPointerUp, cancelSelection, clearSelection
  } = useDragSelection();

  const { rooms, bookings, loading, pageCount, totalBookings, refreshBookings } = useBookingData(
    token, page, statusFilter, rangeStart, rangeEndExclusive
  );

  const {
    draggedBooking, dragCurrentRange, dragCurrentRoom,
    onBookingDragStart, onBookingDragEnter, onBookingDragEnd, cancelBookingDrag
  } = useBookingDrag(token, refreshBookings);

  const handlePointerEnter = useCallback((day, roomId) => {
    onPointerEnter(day, roomId);
    onBookingDragEnter(day, roomId);
  }, [onPointerEnter, onBookingDragEnter]);

  const handlePointerUp = useCallback((day, roomId) => {
    onPointerUp(day, roomId);
    onBookingDragEnd(day, roomId);
  }, [onPointerUp, onBookingDragEnd]);

  const handlePointerLeaveBoard = useCallback(() => {
    cancelSelection();
    cancelBookingDrag();
  }, [cancelSelection, cancelBookingDrag]);

  const boardScrollRef = useRef(null);

  const scrollTodayIntoView = useCallback((behavior = 'auto') => {
    const scrollContainer = boardScrollRef.current;
    if (!scrollContainer) return;
    const todayKey = toInputDate(today);
    const todayColumn = scrollContainer.querySelector(`[data-date="${todayKey}"]`);
    if (!todayColumn) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const columnRect = todayColumn.getBoundingClientRect();
    const targetLeft = scrollContainer.scrollLeft + columnRect.left - containerRect.left - 120;
    scrollContainer.scrollTo({ left: Math.max(0, targetLeft), behavior });
  }, [today]);

  const sortedRooms = useMemo(() => {
    return [...rooms].sort((left, right) =>
      String(left.room_number || '').localeCompare(String(right.room_number || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
  }, [rooms]);

  const overlappingBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const status = normalizeStatus(booking.status);
      if (status === 'cancelled') return false;
      const checkIn = parseDate(booking.check_in_date);
      const checkOut = parseDate(booking.check_out_date);
      return overlapsRange(checkIn, checkOut, rangeStart, rangeEndExclusive);
    });
  }, [bookings, rangeEndExclusive, rangeStart]);

  const bookingsByRoom = useMemo(() => {
    const grouped = overlappingBookings.reduce((accumulator, booking) => {
      const roomNumber = String(booking.room_number || 'Unassigned');
      accumulator[roomNumber] = accumulator[roomNumber] || [];
      accumulator[roomNumber].push(booking);
      return accumulator;
    }, {});
    return Object.entries(grouped).reduce((accumulator, [roomNumber, items]) => {
      const sortedItems = [...items].sort((left, right) =>
        String(left.check_in_date || '').localeCompare(String(right.check_in_date || ''))
      );
      const arranged = layoutRoomBookings(sortedItems);
      accumulator[roomNumber] = {
        items: arranged,
        laneCount: Math.max(1, ...arranged.map((item) => item._lane + 1)),
      };
      return accumulator;
    }, {});
  }, [overlappingBookings]);

  const visibleRooms = useMemo(() => {
    return sortedRooms.filter((room) => {
      const roomEntry = bookingsByRoom[String(room.room_number || 'Unassigned')] || { items: [] };
      return matchesRoomQuery(room, roomEntry.items, debouncedQuery);
    });
  }, [bookingsByRoom, debouncedQuery, sortedRooms]);

  const arrivalsToday = useMemo(() => {
    const todayKey = toInputDate(today);
    return bookings.filter((booking) => booking.check_in_date === todayKey);
  }, [bookings, today]);

  const departuresToday = useMemo(() => {
    const todayKey = toInputDate(today);
    return bookings.filter((booking) => booking.check_out_date === todayKey);
  }, [bookings, today]);

  const activeVisibleBookings = useMemo(
    () => overlappingBookings.filter((booking) => (statusFilter === 'all' ? true : normalizeStatus(booking.status) === statusFilter)),
    [overlappingBookings, statusFilter]
  );
  const canMoveNextPage = pageCount > 0 ? page < pageCount : bookings.length >= 200;

  const selectedNights = useMemo(() => {
    if (!selectionRange) return 0;
    return Math.max(1, Math.round((addDays(selectionRange.end, 1).getTime() - selectionRange.start.getTime()) / DAY_MS));
  }, [selectionRange]);

  const stayCountsByStatus = useMemo(() => {
    return overlappingBookings.reduce((accumulator, booking) => {
      const normalized = normalizeStatus(booking.status) || 'unknown';
      accumulator[normalized] = (accumulator[normalized] || 0) + 1;
      return accumulator;
    }, {});
  }, [overlappingBookings]);

  const inSelection = useCallback((date) => {
    if (!selectionStart || !selectionEnd) return false;
    const range = clampRange(selectionStart, selectionEnd);
    return range && date >= range.start && date <= range.end;
  }, [selectionStart, selectionEnd]);

  return (
    <div className="content">
      <section className="content booking-board-page">
        <div className="booking-board-shell exact-planner">
          <BoardHeader
            page={page} setPage={setPage}
            pageCount={pageCount} totalBookings={totalBookings} canMoveNextPage={canMoveNextPage}
            showFilters={showFilters} setShowFilters={setShowFilters}
            showMore={showMore} setShowMore={setShowMore}
            query={query} setQuery={setQuery}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            visibleRooms={visibleRooms} activeVisibleBookings={activeVisibleBookings}
            arrivalsToday={arrivalsToday} departuresToday={departuresToday}
            stayCountsByStatus={stayCountsByStatus}
            setAnchorDate={setAnchorDate} selectedYear={selectedYear} selectedMonth={selectedMonth}
            rangeStart={rangeStart} selectionRange={selectionRange} selectedNights={selectedNights}
            scrollTodayIntoView={scrollTodayIntoView}
            goToPreviousMonth={goToPreviousMonth}
            goToNextMonth={goToNextMonth}
            goToToday={goToToday}
          />

          {loading ? (
            <div className="booking-board-loading">
              <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i> Loading calendar board...
            </div>
          ) : (
            <div
              className={`booking-board-surface planner-surface-only ${draggedBooking ? 'is-dragging-booking' : ''}`}
              style={{ position: 'relative', display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}
            >
              <ConfirmationPopover
                pendingRange={pendingRange}
                clearSelection={clearSelection}
                toCreateBooking={toCreateBooking}
              />
              <div className="booking-board-calendar">
                <div className="booking-board-scroll planner-scroll" ref={boardScrollRef}>
                  <TimelineHeader
                    anchorMonth={anchorMonth} daysCount={daysCount} dayGridStyle={dayGridStyle}
                    monthSegments={monthSegments} days={days} today={today}
                    onPointerDown={onPointerDown} onPointerEnter={handlePointerEnter}
                    onPointerUp={handlePointerUp} cancelSelection={handlePointerLeaveBoard}
                    selectionStart={selectionStart} selectionEnd={selectionEnd}
                    isSelecting={isSelecting} inSelection={inSelection}
                  />

                  <div className="booking-board-grid planner-grid" onPointerLeave={handlePointerLeaveBoard}>
                    <div className="booking-board-rows" style={{ minWidth: 'max-content' }}>
                      {visibleRooms.length ? visibleRooms.map((room) => {
                        const roomEntry = bookingsByRoom[String(room.room_number || 'Unassigned')] || { items: [], laneCount: 1 };
                        return (
                          <RoomRow
                            key={room.id || room.room_number}
                            room={room}
                            roomEntry={roomEntry}
                            days={days}
                            daysCount={daysCount}
                            dayGridStyle={dayGridStyle}
                            today={today}
                            rangeStart={rangeStart}
                            rangeEndExclusive={rangeEndExclusive}
                            selectionRange={selectionRange}
                            selectionRoom={selectionRoom}
                            onPointerDown={onPointerDown}
                            onPointerEnter={handlePointerEnter}
                            onPointerUp={handlePointerUp}
                            cancelSelection={cancelSelection}
                            inSelection={inSelection}
                            draggedBooking={draggedBooking}
                            dragCurrentRange={dragCurrentRange}
                            dragCurrentRoom={dragCurrentRoom}
                            onBookingDragStart={onBookingDragStart}
                          />
                        );
                      }) : (
                        <div className="booking-board-empty-state">No rooms match the current filter.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
