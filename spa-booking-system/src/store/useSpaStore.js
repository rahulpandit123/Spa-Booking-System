import { create } from 'zustand';

import logger from '../lib/logger';

const CACHE_PREFIX = 'spa_booking_cache_bookings_';

const dateStamp = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const safeParse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export const useSpaStore = create((set, get) => ({
  // Auth
  token: null,
  authStatus: 'idle', // idle | logging_in | ready | error
  authError: null,

  // View
  viewDate: new Date(),
  selectedBookingId: null,

  // Data
  therapists: [],
  bookings: [],
  bookingDetailsById: {}, // bookingId -> normalized details/raw

  // UI state
  filters: {
    status: null, // null | "Confirmed" | ...
    searchText: '',
  },

  // Actions
  setToken: (token) => set({ token }),
  setAuthStatus: (authStatus, authError) => {
    set({ authStatus, authError: authError ?? null });
  },
  setViewDate: (viewDate) => {
    const stamp = dateStamp(viewDate);
    const cached = safeParse(localStorage.getItem(`${CACHE_PREFIX}${stamp}`));
    set({
      viewDate,
      selectedBookingId: null,
      bookings: Array.isArray(cached?.bookings) ? cached.bookings : [],
    });
  },
  setTherapists: (therapists) => set({ therapists }),
  setBookings: (bookings) => set({ bookings }),
  upsertBooking: (booking) => {
    const current = get().bookings;
    const idx = current.findIndex((b) => String(b.bookingId) === String(booking.bookingId));
    if (idx >= 0) {
      const next = current.slice();
      next[idx] = booking;
      set({ bookings: next });
    } else {
      set({ bookings: [booking, ...current] });
    }
  },
  removeBooking: (bookingId) => {
    set({ bookings: get().bookings.filter((b) => String(b.bookingId) !== String(bookingId)) });
    set((state) => ({
      bookingDetailsById: Object.fromEntries(
        Object.entries(state.bookingDetailsById).filter(([id]) => String(id) !== String(bookingId)),
      ),
    }));
  },
  saveBookingsCacheForCurrentViewDate: () => {
    const { viewDate, bookings } = get();
    try {
      const stamp = dateStamp(viewDate);
      localStorage.setItem(`${CACHE_PREFIX}${stamp}`, JSON.stringify({ savedAt: Date.now(), bookings }));
      logger.info('cache_bookings_saved', { stamp, count: bookings.length });
    } catch {
      // ignore cache failures
    }
  },
  setSelectedBookingId: (selectedBookingId) => set({ selectedBookingId }),
  setBookingDetails: (bookingId, details) =>
    set((state) => ({
      bookingDetailsById: { ...state.bookingDetailsById, [bookingId]: details },
    })),
  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),
}));

