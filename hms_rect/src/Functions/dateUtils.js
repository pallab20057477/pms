export const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function getMonthDayCount(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function startOfDay(date) {
  if (!date) return new Date();
  let next;
  if (typeof date === 'string') {
    const dateStr = date.includes('T') ? date.split('T')[0] : date;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      next = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      next = new Date(dateStr);
    }
  } else {
    next = new Date(date.valueOf());
  }
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date, amount) {
  const next = new Date(date.valueOf());
  next.setDate(next.getDate() + amount);
  next.setHours(0, 0, 0, 0); // Fix DST shifts
  return next;
}

export function toInputDate(date) {
  const localDate = startOfDay(date);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDate(value) {
  if (!value) return null;
  const parsed = startOfDay(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function monthAnchor(year, monthIndex) {
  return new Date(year, monthIndex, 1);
}

export function isWeekend(value) {
  const weekday = value.getDay();
  return weekday === 0 || weekday === 6;
}

export function overlapsRange(checkIn, checkOut, rangeStart, rangeEndExclusive) {
  if (!checkIn || !checkOut) return false;
  return checkIn < rangeEndExclusive && checkOut > rangeStart;
}

export function clampRange(a, b) {
  if (!a || !b) return null;
  const start = a.getTime() <= b.getTime() ? a : b;
  const end = a.getTime() <= b.getTime() ? b : a;
  return { start: startOfDay(start), end: startOfDay(end) };
}

export function formatDayNumber(value) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric' }).format(value);
}

export function formatWeekday(value) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(value);
}

export function formatMonthName(value) {
  return new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(value);
}

export function formatShortMonth(value) {
  return new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(value);
}

export function formatYear(value) {
  return new Intl.DateTimeFormat('en-IN', { year: 'numeric' }).format(value);
}

export function formatStayRange(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 'Dates unavailable';
  return `${formatDayNumber(checkIn)} ${formatShortMonth(checkIn)} - ${formatDayNumber(checkOut)} ${formatShortMonth(checkOut)}`;
}
