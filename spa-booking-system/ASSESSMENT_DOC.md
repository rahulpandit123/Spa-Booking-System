# Spa Booking System (React) - Assessment Notes

## Architecture Overview
- **Frontend**: React (CRA), single-day therapist booking management UI.
- **State**: Zustand store in `src/store/useSpaStore.js` holds `token`, `therapists`, `bookings`, selected booking, and UI filters.
- **API Layer**:
  - Daily token caching: `src/api/auth.js`
  - API helpers (timeouts + normalized Error objects): `src/api/client.js`
  - Booking endpoints + calendar list: `src/api/bookings.js`
  - Therapists/services/rooms endpoints: `src/api/therapists.js`, `src/api/services.js`, `src/api/rooms.js`
- **Normalization**: `src/lib/normalize.js`
  - Adapts to backend payload nesting like `data.data.list` and `booking_item`
  - Parses AM/PM time strings (e.g. `04:40:00 AM`)
- **UI**:
  - Virtualized therapist calendar: `src/components/calendar/TherapistScheduleCalendar.js`
  - Right-side booking panel: `src/components/panel/BookingDetailsPanel.js`
  - Page orchestration + optimistic updates: `src/pages/BookingCalendarPage.js`

## State Management Explanation
- Zustand store separates **server data** (`therapists`, `bookings`) from **UI state** (`selectedBookingId`, filters, panel state).
- **Local caching**: bookings are persisted per day in `localStorage` via `spa_booking_cache_bookings_${YYYY-MM-DD}`.
- **Real-time feel**: create/edit/reschedule/cancel/status updates use **optimistic UI updates**. If the backend call fails, the UI **rolls back** to the previous booking snapshot.

## Performance Strategy
- Calendar is built to keep DOM bounded under load:
  - **Two-axis virtualization**: renders only visible time slots and visible therapist columns.
  - Uses memoization (`useMemo`) for derived visible bookings.
  - Scroll handling is **throttled with `requestAnimationFrame`** to avoid excessive re-renders.
  - Booking blocks are wrapped in `React.memo`.
- **Code splitting**: `BookingCalendarPage` is lazy-loaded from `src/App.js`.

## Error Handling & Logging
- `src/api/client.js`:
  - Adds request timeouts
  - Logs API failures/timeouts to console
  - Throws real `Error` objects with attached status/payload
- `src/App.js`:
  - Uses `react-error-boundary` to catch rendering exceptions.
- `src/lib/logger.js`:
  - Structured console logs for API errors and user action failures.

## Key Assumptions / Notes
- Calendar is **single-day only** (24h view with 15-minute interval).
- Outlet parameters are defaulted to backend-compatible values (`outlet=1`, `outlet_type=2`) as used in the Postman collection.
- Backend response shapes are normalized defensively (nested `data.data.list` + `booking_item`).
- Booking create/update payloads use backend expectations: `items` passed as a JSON string in `multipart/form-data`.

## Run Locally
- `npm install`
- `npm start`

## Deploy (Vercel/Netlify)
- `npm run build`
- Host the generated `build/` output using CRA static hosting conventions.

