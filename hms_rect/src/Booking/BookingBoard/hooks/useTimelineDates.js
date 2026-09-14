import { useState, useMemo, useCallback } from 'react';
import { monthAnchor, parseDate, toInputDate, startOfDay, getMonthDayCount, addDays, formatShortMonth, formatYear } from '../../../Functions/dateUtils';

export function useTimelineDates(initialDate = new Date()) {
  const [anchorDate, setAnchorDate] = useState(() => {
    const d = startOfDay(initialDate);
    // Anchor to the start of the current month
    d.setDate(1);
    return toInputDate(d);
  });

  const anchor = useMemo(() => parseDate(anchorDate), [anchorDate]);
  const anchorMonth = useMemo(() => monthAnchor(anchor.getFullYear(), anchor.getMonth()), [anchor]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const selectedMonth = anchor.getMonth();
  const selectedYear = anchor.getFullYear();
  const daysCount = 90; // Fixed 90 days window

  const rangeStart = useMemo(() => {
    // Start 3 days before anchor to give a little buffer
    return addDays(anchorMonth, -3);
  }, [anchorMonth]);

  const rangeEndExclusive = useMemo(() => addDays(rangeStart, daysCount), [rangeStart, daysCount]);

  const days = useMemo(() => {
    const list = [];
    let current = rangeStart;
    for (let i = 0; i < daysCount; i++) {
      list.push(current);
      current = addDays(current, 1);
    }
    return list;
  }, [rangeStart, daysCount]);

  const monthSegments = useMemo(() => {
    const segments = [];
    let currentSegment = null;

    days.forEach((day, index) => {
      const month = day.getMonth();
      const year = day.getFullYear();

      if (!currentSegment || currentSegment.month !== month || currentSegment.year !== year) {
        if (currentSegment) segments.push(currentSegment);
        currentSegment = {
          key: `${year}-${month}`,
          month,
          year,
          label: formatShortMonth(day).toUpperCase(),
          offset: index,
          days: 1,
        };
      } else {
        currentSegment.days += 1;
      }
    });

    if (currentSegment) segments.push(currentSegment);
    return segments;
  }, [days]);

  const dayGridStyle = useMemo(() => {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${daysCount}, 1fr)`,
      width: `${daysCount * 64}px`, // Fixed width per day
    };
  }, [daysCount]);

  const goToPreviousMonth = useCallback(() => {
    setAnchorDate((prev) => {
      const d = parseDate(prev);
      d.setMonth(d.getMonth() - 1);
      return toInputDate(d);
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setAnchorDate((prev) => {
      const d = parseDate(prev);
      d.setMonth(d.getMonth() + 1);
      return toInputDate(d);
    });
  }, []);

  const goToToday = useCallback(() => {
    const d = startOfDay(new Date());
    d.setDate(1);
    setAnchorDate(toInputDate(d));
  }, []);

  return {
    anchorDate,
    setAnchorDate,
    anchorMonth,
    today,
    selectedMonth,
    selectedYear,
    rangeStart,
    daysCount,
    rangeEndExclusive,
    days,
    monthSegments,
    dayGridStyle,
    goToPreviousMonth,
    goToNextMonth,
    goToToday
  };
}
