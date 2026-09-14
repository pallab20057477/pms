import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { startOfDay, toInputDate } from '../../../Functions/dateUtils';
import { patchWithAuth } from '../../../api';
import { useNavigate } from 'react-router-dom';

export function useBookingDrag(token, refreshBookings) {
  const navigate = useNavigate();
  const [draggedBooking, setDraggedBooking] = useState(null);
  const [dragCurrentRange, setDragCurrentRange] = useState(null);
  const [dragCurrentRoom, setDragCurrentRoom] = useState(null);
  const [dragPointerStartX, setDragPointerStartX] = useState(0);

  const onBookingDragStart = useCallback((e, booking, initialRoom) => {
    if (booking.status !== 'reserved') {
      toast.error('Only reserved bookings can be moved directly.');
      return;
    }
    
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId); // Release capture so grid cells get events
    
    setDraggedBooking(booking);
    
    const checkIn = startOfDay(new Date(booking.check_in_date));
    const checkOut = startOfDay(new Date(booking.check_out_date));
    const duration = checkOut.getTime() - checkIn.getTime();
    
    setDragCurrentRange({ start: checkIn, duration });
    setDragCurrentRoom(initialRoom);
  }, []);

  const onBookingDragEnter = useCallback((day, roomId) => {
    if (draggedBooking) {
      setDragCurrentRoom(roomId);
      setDragCurrentRange(prev => ({ ...prev, start: day }));
    }
  }, [draggedBooking]);

  const onBookingDragEnd = useCallback(async (day, roomId) => {
    if (!draggedBooking || !dragCurrentRange) return;

    const newStart = day;
    const newEnd = new Date(day.getTime() + dragCurrentRange.duration);
    const newRoomId = roomId || dragCurrentRoom;

    // Check if it actually moved. If not, treat as a click to open folio
    const oldStart = startOfDay(new Date(draggedBooking.check_in_date));
    const oldRoomId = String(draggedBooking.room_id || draggedBooking.room_number);
    if (newStart.getTime() === oldStart.getTime() && String(newRoomId) === oldRoomId) {
       const bookingId = draggedBooking.id;
       cancelBookingDrag();
       navigate(`/booking/${bookingId}/folio`);
       return;
    }

    const todayStart = startOfDay(new Date());
    if (newStart.getTime() < todayStart.getTime()) {
      toast.error('Cannot move bookings to past dates.');
      cancelBookingDrag();
      return;
    }

    const payload = {
      check_in_date: toInputDate(newStart),
      check_out_date: toInputDate(newEnd),
    };
    
    if (newRoomId && newRoomId !== 'Unassigned') {
      payload.room_id = Number(newRoomId);
    }

    try {
      await patchWithAuth(`/bookings/${draggedBooking.id}`, payload, token);
      toast.success('Booking updated successfully');
      refreshBookings(); // Trigger a re-fetch
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update booking');
    }

    cancelBookingDrag();
  }, [draggedBooking, dragCurrentRange, dragCurrentRoom, token, refreshBookings, navigate]);

  const cancelBookingDrag = useCallback(() => {
    setDraggedBooking(null);
    setDragCurrentRange(null);
    setDragCurrentRoom(null);
  }, []);

  useEffect(() => {
    const handleGlobalPointerUp = (e) => {
      if (draggedBooking) {
        if (dragCurrentRange && dragCurrentRoom) {
          onBookingDragEnd(dragCurrentRange.start, dragCurrentRoom);
        } else {
          cancelBookingDrag();
        }
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, [draggedBooking, dragCurrentRange, dragCurrentRoom, onBookingDragEnd, cancelBookingDrag]);

  return {
    draggedBooking,
    dragCurrentRange,
    dragCurrentRoom,
    onBookingDragStart,
    onBookingDragEnter,
    onBookingDragEnd,
    cancelBookingDrag
  };
}
