import { useState, useEffect, useRef, useCallback } from 'react';
import { getWithAuth } from '../../../api';
import toast from 'react-hot-toast';
import { toInputDate } from '../../../Functions/dateUtils';

export const BOARD_PAGE_SIZE = 200;

export async function fetchBookingsPage(token, page = 1, statusFilter = 'all', startDate = null, endDate = null, abortSignal = null) {
  // Build status filter - exclude cancelled by default for calendar view
  const statuses = statusFilter === 'all'
    ? ['reserved', 'checked_in', 'checked_out', 'completed']
    : [statusFilter];

  const params = {
    page,
    page_size: BOARD_PAGE_SIZE,
    status: statuses.join(',')
  };
  
  if (startDate) params.overlap_from = toInputDate(startDate);
  if (endDate) params.overlap_to = toInputDate(endDate);

  const response = await getWithAuth('/bookings', token, {
    params,
    signal: abortSignal
  });
  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const total = Number(response.data?.total || 0);
  const pageCount = total > 0 ? Math.ceil(total / BOARD_PAGE_SIZE) : 0;
  return { items, total, pageCount };
}

export function useBookingData(token, page, statusFilter, rangeStart, rangeEndExclusive) {
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(0);
  const [totalBookings, setTotalBookings] = useState(0);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const abortControllerRef = useRef(null);

  const refreshBookings = useCallback(() => {
    setRefreshCounter(c => c + 1);
  }, []);

  useEffect(() => {
    if (!token) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function loadBoard() {
      setLoading(true);
      try {
        const [roomResponse, bookingPage] = await Promise.all([
          getWithAuth('/rooms', token),
          fetchBookingsPage(token, page, statusFilter, rangeStart, rangeEndExclusive, controller.signal),
        ]);

        if (controller.signal.aborted) return;

        const roomData = roomResponse.data?.data ? roomResponse.data.data : roomResponse.data;

        setRooms(Array.isArray(roomData) ? roomData : []);
        setBookings(Array.isArray(bookingPage.items) ? bookingPage.items : []);
        setTotalBookings(bookingPage.total || 0);
        setPageCount(bookingPage.pageCount || 0);
      } catch (error) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.message?.includes('aborted') || error.message?.includes('canceled')) {
          return;
        }
        console.error('Calendar load error:', error);
        toast.error('Failed to load front desk calendar');
        setRooms([]);
        setBookings([]);
        setTotalBookings(0);
        setPageCount(0);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadBoard();

    return () => {
      controller.abort();
    };
  }, [token, page, statusFilter, rangeStart, rangeEndExclusive, refreshCounter]);

  return { rooms, bookings, loading, pageCount, totalBookings, refreshBookings };
}
