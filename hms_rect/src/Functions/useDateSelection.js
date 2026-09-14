import { useState, useEffect, useCallback, useRef } from 'react';
import { startOfDay, clampRange } from './dateUtils';

export function useDateSelection(onRangeConfirmed) {
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRoom, setSelectionRoom] = useState(null);
  
  // Use ref to avoid stale closures in event listeners
  const stateRef = useRef({
    selectionStart,
    selectionEnd,
    isSelecting,
    onRangeConfirmed
  });

  useEffect(() => {
    stateRef.current = { selectionStart, selectionEnd, isSelecting, onRangeConfirmed };
  }, [selectionStart, selectionEnd, isSelecting, onRangeConfirmed]);

  // Global mouseup handler
  useEffect(() => {
    function handleMouseUp() {
      const { selectionStart, selectionEnd, isSelecting, onRangeConfirmed } = stateRef.current;
      
      if (isSelecting) {
        if (selectionStart && selectionEnd) {
          const range = clampRange(selectionStart, selectionEnd);
          if (range) onRangeConfirmed?.(range.start, range.end, selectionRoom);
        }
        
        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        setSelectionRoom(null);
      }
    }

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []); // Empty deps - uses ref for latest state

  const handleMouseDown = useCallback((date, room) => {
    setSelectionStart(date);
    setSelectionEnd(date);
    setIsSelecting(true);
    setSelectionRoom(room);
  }, []);

  const handleMouseEnter = useCallback((date) => {
    if (stateRef.current.isSelecting) {
      setSelectionEnd(date);
    }
  }, []);

  const handleClick = useCallback((date, room, event) => {
    const { selectionStart } = stateRef.current;
    
    // Shift+click extends selection from previous start
    if (event?.shiftKey && selectionStart) {
      const range = clampRange(selectionStart, date);
      if (range) onRangeConfirmed?.(range.start, range.end, room);
      setSelectionStart(null);
      setSelectionEnd(null);
      setIsSelecting(false);
      setSelectionRoom(null);
      return;
    }

    // Normal click sets single-day selection
    setSelectionStart(date);
    setSelectionEnd(date);
    setIsSelecting(false);
    setSelectionRoom(room);
  }, [onRangeConfirmed]);

  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setIsSelecting(false);
    setSelectionRoom(null);
  }, []);

  const inSelection = useCallback((date) => {
    if (!selectionStart || !selectionEnd) return false;
    const range = clampRange(selectionStart, selectionEnd);
    return range && date >= range.start && date <= range.end;
  }, [selectionStart, selectionEnd]);

  return {
    selectionStart,
    selectionEnd,
    isSelecting,
    selectionRoom,
    handleMouseDown,
    handleMouseEnter,
    handleClick,
    clearSelection,
    inSelection
  };
}
