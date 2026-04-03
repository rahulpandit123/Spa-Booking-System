import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';

import './TherapistScheduleCalendar.css';

const SLOT_MINUTES = 15;
const SLOT_HEIGHT_PX = 28;
const THERAPIST_WIDTH_PX = 170;
const OVERSCAN_SLOTS = 4;
const OVERSCAN_COLS = 2;

const statusToColors = {
  Confirmed: { bg: '#3B82F6' }, // blue
  'Check-in (In Progress)': { bg: '#EC4899' }, // pink
  Cancelled: { bg: '#9CA3AF' }, // grey
};

const therapistGenderToBorder = (gender) => {
  const g = String(gender ?? '').toLowerCase();
  return g.includes('male') ? '#3B82F6' : '#EC4899';
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const BookingBlock = React.memo(function BookingBlock({
  booking,
  left,
  top,
  width,
  height,
  onClick,
  onPointerDown,
  dragged,
}) {
  const status = booking?.status ?? 'Confirmed';
  const colors = statusToColors[status] ?? statusToColors.Confirmed;
  const border = therapistGenderToBorder(booking?.therapistGender);

  return (
    <div
      className="tsc-booking"
      style={{
        left,
        top,
        width,
        height,
        background: colors.bg,
        borderColor: dragged ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)',
        boxShadow: dragged ? '0 6px 18px rgba(0,0,0,0.2)' : 'none',
      }}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <div className="tsc-booking__topline">
        <span className="tsc-pill" style={{ background: `${border}33` }}>
          T
        </span>
        <span className="tsc-muted" style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {booking?.clientName ?? 'Client'}
        </span>
      </div>
      <div style={{ marginTop: 4, fontWeight: 600 }}>
        {booking?.start ? format(booking.start, 'HH:mm') : '--:--'} -{' '}
        {booking?.end ? format(booking.end, 'HH:mm') : '--:--'}
      </div>
      <div className="tsc-muted" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {booking?.therapistName ?? 'Therapist'}
      </div>
    </div>
  );
});

export default function TherapistScheduleCalendar({
  therapists,
  bookings,
  viewDate,
  filters,
  onSelectBooking,
  onRescheduleBooking,
}) {
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [scroll, setScroll] = useState({ left: 0, top: 0 });

  const totalSlots = (24 * 60) / SLOT_MINUTES;
  const dayStart = useMemo(() => new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 0, 0, 0, 0), [viewDate]);
  const therapistIdToIndex = useMemo(() => {
    const m = new Map();
    therapists.forEach((t, idx) => {
      if (t?.id != null) m.set(String(t.id), idx);
    });
    return m;
  }, [therapists]);

  const filteredBookings = useMemo(() => {
    const st = filters?.status;
    const q = String(filters?.searchText ?? '').trim().toLowerCase();
    if (!st && !q) return bookings;

    return bookings.filter((b) => {
      if (st && b?.status !== st) return false;
      if (!q) return true;
      const hay = [
        b?.clientName,
        b?.therapistName,
        b?.serviceRequest,
        b?.note,
        b?.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [bookings, filters?.searchText, filters?.status]);

  const bookingsByTherapistIndex = useMemo(() => {
    const arr = new Array(therapists.length);
    for (let i = 0; i < arr.length; i++) arr[i] = [];
    for (const b of filteredBookings) {
      const idx = b?.therapistId != null ? therapistIdToIndex.get(String(b.therapistId)) : null;
      if (idx == null) continue;
      arr[idx].push(b);
    }
    return arr;
  }, [filteredBookings, therapists.length, therapistIdToIndex]);

  const visibleRange = useMemo(() => {
    const slotStart = Math.floor(scroll.top / SLOT_HEIGHT_PX) - OVERSCAN_SLOTS;
    const slotEnd = Math.ceil((scroll.top + viewport.height) / SLOT_HEIGHT_PX) + OVERSCAN_SLOTS;
    const colStart = Math.floor(scroll.left / THERAPIST_WIDTH_PX) - OVERSCAN_COLS;
    const colEnd = Math.ceil((scroll.left + viewport.width) / THERAPIST_WIDTH_PX) + OVERSCAN_COLS;

    const timeStartIndex = clamp(slotStart, 0, totalSlots - 1);
    const timeEndIndex = clamp(slotEnd, 0, totalSlots - 1);
    const therapistStartIndex = clamp(colStart, 0, therapists.length - 1);
    const therapistEndIndex = clamp(colEnd, 0, therapists.length - 1);

    return {
      timeStartIndex,
      timeEndIndex,
      therapistStartIndex,
      therapistEndIndex,
    };
  }, [scroll.top, scroll.left, viewport.height, viewport.width, therapists.length, totalSlots]);

  const visibleBookings = useMemo(() => {
    const { timeStartIndex, timeEndIndex, therapistStartIndex, therapistEndIndex } = visibleRange;
    const visibleStart = dayStart.getTime() + timeStartIndex * SLOT_MINUTES * 60 * 1000;
    const visibleEnd = dayStart.getTime() + (timeEndIndex + 1) * SLOT_MINUTES * 60 * 1000;

    const results = [];
    for (let col = therapistStartIndex; col <= therapistEndIndex; col++) {
      const list = bookingsByTherapistIndex[col] ?? [];
      for (const b of list) {
        const bs = b?.start ? b.start.getTime() : null;
        const be = b?.end ? b.end.getTime() : null;
        if (bs == null || be == null) continue;
        if (bs < visibleEnd && be > visibleStart) results.push(b);
      }
    }
    return results;
  }, [visibleRange, bookingsByTherapistIndex, dayStart]);

  const [drag, setDrag] = useState(null); // { bookingId, original:..., preview:... }
  const dragRef = useRef({ active: false, raf: 0, last: null });
  const scrollRafRef = useRef(0);
  const pendingScrollRef = useRef({ left: 0, top: 0 });

  const onScroll = useCallback((e) => {
    const target = e.target;
    pendingScrollRef.current = { left: target.scrollLeft, top: target.scrollTop };
    if (scrollRafRef.current) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      setScroll(pendingScrollRef.current);
    });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setViewport({ width: r.width, height: r.height });
    };
    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const startDrag = useCallback(
    (booking, therapistIndex, e) => {
      // Left click only
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      if (!booking?.start || !booking?.end) return;

      const startMinutes = (booking.start.getTime() - dayStart.getTime()) / 60000;
      const endMinutes = (booking.end.getTime() - dayStart.getTime()) / 60000;
      const durationMinutes = Math.max(0, Math.round(endMinutes - startMinutes));

      dragRef.current.active = true;
      dragRef.current.last = { clientX: e.clientX, clientY: e.clientY };

      setDrag({
        bookingId: booking.bookingId,
        therapistIndex,
        startMinutes,
        durationMinutes,
        pointerStartX: e.clientX,
        pointerStartY: e.clientY,
        originalStartMinutes: startMinutes,
      });
    },
    [dayStart]
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (ev) => {
      if (!dragRef.current.active) return;
      dragRef.current.last = { clientX: ev.clientX, clientY: ev.clientY };
      if (dragRef.current.raf) return;

      dragRef.current.raf = window.requestAnimationFrame(() => {
        dragRef.current.raf = 0;
        const last = dragRef.current.last;
        if (!last) return;

        const dx = last.clientX - drag.pointerStartX;
        const dy = last.clientY - drag.pointerStartY;

        const therapistDelta = Math.round(dx / THERAPIST_WIDTH_PX);
        const nextTherapistIndex = clamp(drag.therapistIndex + therapistDelta, 0, therapists.length - 1);

        const slotDelta = Math.round(dy / SLOT_HEIGHT_PX);
        const slotDeltaMinutes = slotDelta * SLOT_MINUTES;
        const nextStartMinutes = drag.originalStartMinutes + slotDeltaMinutes;

        // Snap to 15-minute increments.
        const snappedMinutes = Math.round(nextStartMinutes / SLOT_MINUTES) * SLOT_MINUTES;

        setDrag((d) => {
          if (!d) return d;
          return {
            ...d,
            previewTherapistIndex: nextTherapistIndex,
            previewStartMinutes: snappedMinutes,
          };
        });
      });
    };

    const onUp = async () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      if (dragRef.current.raf) cancelAnimationFrame(dragRef.current.raf);
      dragRef.current.raf = 0;

      // Commit reschedule.
      const bookingId = drag.bookingId;
      const nextTherapistIndex = drag.previewTherapistIndex ?? drag.therapistIndex;
      const nextStartMinutes = drag.previewStartMinutes ?? drag.originalStartMinutes;

      const booking = bookings.find((b) => String(b.bookingId) === String(bookingId));
      const nextTherapist = therapists[nextTherapistIndex];
      const start = new Date(dayStart.getTime() + nextStartMinutes * 60000);
      const end = new Date(start.getTime() + drag.durationMinutes * 60000);

      setDrag(null);

      try {
        if (onRescheduleBooking && booking && nextTherapist?.id != null) {
          await onRescheduleBooking({
            bookingId,
            therapistId: nextTherapist.id,
            start,
            end,
          });
        }
      } catch {
        // Parent should handle reverting. Keep calendar stable.
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, bookings, therapists, dayStart, onRescheduleBooking]);

  const visibleTherapists = useMemo(() => {
    const { therapistStartIndex, therapistEndIndex } = visibleRange;
    return therapists.slice(therapistStartIndex, therapistEndIndex + 1);
  }, [therapists, visibleRange]);

  const { therapistStartIndex } = visibleRange;

  const timeSlotsToRender = useMemo(() => {
    const { timeStartIndex, timeEndIndex } = visibleRange;
    const out = [];
    for (let i = timeStartIndex; i <= timeEndIndex; i++) out.push(i);
    return out;
  }, [visibleRange]);

  const hourLabels = useMemo(() => {
    const labels = [];
    for (const slotIdx of timeSlotsToRender) {
      const minutes = slotIdx * SLOT_MINUTES;
      if (minutes % 60 !== 0) continue;
      labels.push(slotIdx);
    }
    return labels;
  }, [timeSlotsToRender]);

  const canvasWidth = therapists.length * THERAPIST_WIDTH_PX;
  const canvasHeight = totalSlots * SLOT_HEIGHT_PX;

  const isDragging = (b) => drag?.bookingId != null && String(b?.bookingId) === String(drag.bookingId);

  return (
    <div className="tsc-root" ref={rootRef} style={{ height: '100%' }}>
      <div className="tsc-time-header">
        <div className="tsc-time-header__label">Time</div>
      </div>
      <div className="tsc-header">
        <div className="tsc-header-inner" style={{ width: canvasWidth, transform: `translateX(-${scroll.left}px)` }}>
          {therapists.map((t, col) => {
            const left = col * THERAPIST_WIDTH_PX;
            const border = therapistGenderToBorder(t.gender);
            return (
              <div
                key={t.id ?? col}
                className="tsc-therapist-label"
                style={{
                  left,
                  width: THERAPIST_WIDTH_PX - 8,
                  border: `1px solid ${border}55`,
                  background: '#ffffff',
                  color: '#111827',
                  position: 'absolute',
                }}
              >
                <span style={{ fontWeight: 800, flexShrink: 0 }}>
                  {t.gender?.toLowerCase().includes('male') ? '♂' : '♀'}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {t.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="tsc-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        aria-label="Therapist calendar scroll area"
      >
        <div className="tsc-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
          {/* grid lines */}
          {timeSlotsToRender.map((slotIdx) => (
            <div key={`h-${slotIdx}`} className="tsc-hline" style={{ top: slotIdx * SLOT_HEIGHT_PX }} />
          ))}
          {Array.from({ length: visibleRange.therapistEndIndex - visibleRange.therapistStartIndex + 1 }).map((_, i) => {
            const col = visibleRange.therapistStartIndex + i;
            return <div key={`v-${col}`} className="tsc-vline" style={{ left: col * THERAPIST_WIDTH_PX }} />;
          })}

          {/* hour labels in left gutter */}
          {hourLabels.map((slotIdx) => {
            const y = slotIdx * SLOT_HEIGHT_PX;
            return (
              <div
                key={`t-${slotIdx}`}
                className="tsc-time-label"
                style={{ top: y + SLOT_HEIGHT_PX / 2 }}
              >
                {format(new Date(dayStart.getTime() + slotIdx * SLOT_MINUTES * 60000), 'HH:mm')}
              </div>
            );
          })}

          {/* bookings */}
          {visibleBookings.map((b) => {
            const therapistIndex = therapistIdToIndex.get(String(b.therapistId));
            if (therapistIndex == null) return null;

            const bs = b.start?.getTime();
            const be = b.end?.getTime();
            if (bs == null || be == null) return null;

            let start = b.start;
            let end = b.end;
            if (isDragging(b)) {
              const previewStart = drag.previewStartMinutes ?? drag.originalStartMinutes;
              start = new Date(dayStart.getTime() + previewStart * 60000);
              end = new Date(start.getTime() + drag.durationMinutes * 60000);
            }

            const startMinutes = (start.getTime() - dayStart.getTime()) / 60000;
            const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
            const top = (startMinutes / SLOT_MINUTES) * SLOT_HEIGHT_PX;
            const height = Math.max(18, (durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT_PX);
            const left = therapistIndex * THERAPIST_WIDTH_PX + 6;
            const width = THERAPIST_WIDTH_PX - 12;

            const dragged = isDragging(b);

            return (
              <BookingBlock
                key={String(b.bookingId)}
                booking={b}
                left={left}
                top={top}
                width={width}
                height={height}
                dragged={dragged}
                onClick={() => onSelectBooking?.(b.bookingId)}
                onPointerDown={(ev) => {
                  // Convert therapistIndex relative to full list.
                  startDrag(b, therapistIndex, ev);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

