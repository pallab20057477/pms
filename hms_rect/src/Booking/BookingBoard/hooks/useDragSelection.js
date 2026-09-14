import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { clampRange, startOfDay, addDays } from '../../../Functions/dateUtils';
import { useNavigate } from 'react-router-dom';
import { toInputDate } from '../../../Functions/dateUtils';

export function useDragSelection() {
  const navigate = useNavigate();

  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRoom, setSelectionRoom] = useState(null);
  const [pendingRange, setPendingRange] = useState(null);

  const confirmAndCreate = useCallback((startDate, endDate, room) => {
    const todayStart = startOfDay(new Date());
    if (startDate.getTime() < todayStart.getTime()) {
      toast.error('Cannot create bookings for past dates.');
      return false;
    }
    setPendingRange({ start: startDate, end: endDate, room });
    return true;
  }, []);

  const toCreateBooking = useCallback((startDate, endDate, room) => {
    const checkIn = toInputDate(startDate);
    const checkOut = toInputDate(addDays(endDate, 1));
    const roomParam = room ? `&room_id=${encodeURIComponent(room)}` : '';
    navigate(`/booking/create?check_in=${checkIn}&check_out=${checkOut}${roomParam}`);
  }, [navigate]);

  const selectionRange = clampRange(selectionStart, selectionEnd || selectionStart);

  const onPointerDown = useCallback((day, roomId) => {
    setPendingRange(null);
    setSelectionStart(day);
    setSelectionEnd(day);
    setSelectionRoom(roomId);
    setIsSelecting(true);
  }, []);

  const onPointerEnter = useCallback((day, roomId) => {
    if (isSelecting) {
      setSelectionEnd(day);
    }
  }, [isSelecting]);

  const clearSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
    setSelectionRoom(null);
    setPendingRange(null);
  }, []);

  const onPointerUp = useCallback((day, roomId) => {
    if (!isSelecting) return;
    
    // Finalize selection
    const range = clampRange(selectionStart, day);
    if (range) {
      const success = confirmAndCreate(range.start, range.end, selectionRoom);
      if (!success) {
        clearSelection();
        return;
      }
    }
    
    setIsSelecting(false);
  }, [isSelecting, selectionRoom, selectionStart, confirmAndCreate, clearSelection]);

  // Global pointer up to catch releases outside the grid
  useEffect(() => {
    const handleGlobalPointerUp = (e) => {
      if (isSelecting) {
        // If we release outside any valid cell, just use the current selectionEnd
        if (selectionEnd) {
          onPointerUp(selectionEnd, selectionRoom);
        } else {
          clearSelection();
        }
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, [isSelecting, onPointerUp, selectionEnd, selectionRoom, clearSelection]);

  // Handle pointer leaving the entire board to cancel drag
  const cancelSelection = useCallback(() => {
    if (isSelecting) {
      clearSelection();
    }
  }, [isSelecting, clearSelection]);

  return {
    selectionStart,
    setSelectionStart,
    selectionEnd,
    setSelectionEnd,
    isSelecting,
    setIsSelecting,
    selectionRoom,
    setSelectionRoom,
    pendingRange,
    setPendingRange,
    selectionRange,
    confirmAndCreate,
    toCreateBooking,
    onPointerDown,
    onPointerEnter,
    onPointerUp,
    cancelSelection,
    clearSelection
  };
}
