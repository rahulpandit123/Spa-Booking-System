import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';

import { useSpaStore } from '../store/useSpaStore';
import { getCachedUserId, loginOncePerDay } from '../api/auth';
import { apiListTherapists } from '../api/therapists';
import {
  apiCancelBooking,
  apiCreateBooking,
  apiDeleteBooking,
  apiListBookingsCalendar,
  apiShowBookingDetails,
  apiUpdateBooking,
  apiUpdateBookingStatus,
} from '../api/bookings';
import { apiListRoomsForDate } from '../api/rooms';
import { apiListServiceCategories } from '../api/services';
import { apiListUsers } from '../api/clients';
import { normalizeBooking, normalizeTherapist } from '../lib/normalize';
import logger from '../lib/logger';

import TherapistScheduleCalendar from '../components/calendar/TherapistScheduleCalendar';
import BookingDetailsPanel from '../components/panel/BookingDetailsPanel';

import './BookingCalendarPage.css';

const toDmy = (d) => format(d, 'dd-MM-yyyy');
const toHm = (d) => format(d, 'HH:mm');

const getApiErrorMessage = (err, fallback) => {
  const message = err?.message || err?.payload?.message;
  const validation = err?.payload?.errors;
  if (validation && typeof validation === 'object') {
    const firstKey = Object.keys(validation)[0];
    const firstVal = validation[firstKey];
    const detail = Array.isArray(firstVal) ? firstVal[0] : String(firstVal ?? '');
    if (detail) return `${message || fallback}: ${detail}`;
  }
  return message || fallback;
};

const extractFlatServices = (res) => {
  const categories = Array.isArray(res) ? res : res?.categories ?? res?.data?.categories ?? [];
  const out = [];
  for (const c of categories) {
    const services = c?.services ?? c?.items ?? [];
    for (const s of services) {
      const id = s?.id ?? s?.service_id ?? s?.value;
      if (id == null) continue;
      out.push({
        id,
        name: s?.name ?? s?.title ?? s?.service_name ?? s?.label,
      });
    }
  }
  return out;
};

const getPrimaryItem = (raw) => {
  const items =
    raw?.items ??
    raw?.booking_items ??
    raw?.data?.items ??
    raw?.item ??
    raw?.booking_item ??
    [];

  const list = Array.isArray(items)
    ? items
    : items && typeof items === 'object'
      ? Object.values(items).flatMap((v) => (Array.isArray(v) ? v : v != null ? [v] : []))
      : [];

  return (
    list.find((it) => it?.primary === 1 || it?.primary === true || String(it?.primary) === '1') ?? list[0] ?? null
  );
};

const buildUpdatedItems = ({ raw, updates, fallback }) => {
  const items =
    raw?.items ??
    raw?.booking_items ??
    raw?.data?.items ??
    raw?.item ??
    raw?.booking_item ??
    [];

  const list = Array.isArray(items)
    ? items
    : items && typeof items === 'object'
      ? Object.values(items).flatMap((v) => (Array.isArray(v) ? v : v != null ? [v] : []))
      : [];

  const primary =
    list.find((it) => it?.primary === 1 || it?.primary === true || String(it?.primary) === '1') ?? list[0];

  if (!primary) return fallback;

  const nextStartTime = updates.start ? toHm(updates.start) : null;
  const nextEndTime = updates.end ? toHm(updates.end) : null;

  const durationMinutes = updates.durationMinutes ?? null;
  const nextTherapistId = updates.therapistId ?? null;
  const nextServiceId = updates.serviceId ?? null;
  const note = updates.note ?? null;

  const nextPrimary = {
    ...primary,
    // Ensure numeric fields are actually numeric
    quantity: Number(primary.quantity ?? 1),
    price: Number(primary.price ?? 77.00),
    ...(nextTherapistId != null ? { therapist: Number(nextTherapistId) || 1, therapist_id: Number(nextTherapistId) || 1 } : null),
    ...(nextServiceId != null ? { service: Number(nextServiceId) || 1, service_id: Number(nextServiceId) || 1 } : null),
    ...(note != null ? { note } : null),
    ...(nextStartTime != null ? { start_time: nextStartTime } : null),
    ...(nextEndTime != null ? { end_time: nextEndTime } : null),
    ...(durationMinutes != null ? { duration: Number(durationMinutes) } : null),
  };

  if (Array.isArray(nextPrimary.room_segments)) {
    nextPrimary.room_segments = nextPrimary.room_segments.map((seg) => {
      const updated = {
        ...seg,
        ...(nextStartTime != null ? { start_time: nextStartTime } : null),
        ...(nextEndTime != null ? { end_time: nextEndTime } : null),
        ...(durationMinutes != null ? { duration: Number(durationMinutes) } : null),
      };
      // Ensure duration is numeric in room_segments
      if (updated.duration != null) {
        updated.duration = Number(updated.duration);
      }
      return updated;
    });
  }

  const result = list.length ? list.map((it) => (it === primary ? nextPrimary : it)) : [nextPrimary];
  
  // Ensure all items have numeric fields properly converted and use correct field names
  return result.map(item => {
    // Determine the service ID - check both service and service_id fields, ensure it's never 0 or falsy
    const serviceValue = (item.service ?? item.service_id ?? 0);
    const finalService = Number(serviceValue) || 1; // Default to 1 if 0 or falsy
    
    // Determine therapist - check both therapist and therapist_id fields, ensure it's never 0 or falsy
    const therapistValue = (item.therapist ?? item.therapist_id ?? 0);
    const finalTherapist = Number(therapistValue) || 1; // Default to 1 if 0 or falsy
    
    return {
      ...item,
      quantity: Number(item.quantity ?? 1),
      price: Number(item.price ?? 77.00),
      service: finalService,
      therapist: finalTherapist,
      duration: Number(item.duration ?? 0),
    };
  });
};

export default function BookingCalendarPage() {
  const token = useSpaStore((s) => s.token);
  const viewDate = useSpaStore((s) => s.viewDate);
  const therapists = useSpaStore((s) => s.therapists);
  const bookings = useSpaStore((s) => s.bookings);
  const selectedBookingId = useSpaStore((s) => s.selectedBookingId);
  const bookingDetailsById = useSpaStore((s) => s.bookingDetailsById);
  const filters = useSpaStore((s) => s.filters);

  const setToken = useSpaStore((s) => s.setToken);
  const setAuthStatus = useSpaStore((s) => s.setAuthStatus);
  const setViewDate = useSpaStore((s) => s.setViewDate);
  const setTherapists = useSpaStore((s) => s.setTherapists);
  const setBookings = useSpaStore((s) => s.setBookings);
  const upsertBooking = useSpaStore((s) => s.upsertBooking);
  const removeBooking = useSpaStore((s) => s.removeBooking);
  const setSelectedBookingId = useSpaStore((s) => s.setSelectedBookingId);
  const setBookingDetails = useSpaStore((s) => s.setBookingDetails);
  const setFilters = useSpaStore((s) => s.setFilters);
  const saveBookingsCacheForCurrentViewDate = useSpaStore((s) => s.saveBookingsCacheForCurrentViewDate);

  const [globalError, setGlobalError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notices, setNotices] = useState([]);

  const [servicesFlat, setServicesFlat] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  const pushNotice = useCallback((type, text) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotices((prev) => [...prev, { id, type, text }]);
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    therapistId: '',
    serviceId: '',
    roomId: '',
    requestType: '',
    startTime: '09:00',
    durationMinutes: 60,
    customerId: '',
    note: '',
  });

  const selectedBooking = useMemo(
    () => bookings.find((b) => String(b.bookingId) === String(selectedBookingId)) ?? null,
    [bookings, selectedBookingId]
  );

  const therapistsById = useMemo(() => new Map(therapists.map((t) => [String(t.id), t])), [therapists]);

  useEffect(() => {
    // Load cached bookings on first render.
    setViewDate(new Date());
  }, [setViewDate]);

  // Auth + initial data.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setGlobalError(null);
      setLoading(true);
      try {
        setAuthStatus('logging_in', null);
        const t = await loginOncePerDay();
        if (cancelled) return;
        setToken(t);
        setAuthStatus('ready', null);
      } catch (e) {
        logger.error('auth_failed', { message: e?.message ?? String(e) });
        if (cancelled) return;
        setAuthStatus('error', e?.message ?? String(e));
        setGlobalError('Authentication failed. Please refresh.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [setAuthStatus, setToken]);

  const refreshTherapistsAndBookings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setGlobalError(null);
    try {
      const [therapistsRaw, bookingsRaw, servicesRes] = await Promise.all([
        apiListTherapists({ token, date: viewDate }),
        apiListBookingsCalendar({ token, date: viewDate }),
        apiListServiceCategories({ token }),
      ]);

      const therapistsArray = Array.isArray(therapistsRaw) ? therapistsRaw : [];
      const therapistsNorm = therapistsArray.map(normalizeTherapist).filter((t) => t?.id != null);
      const therapistsMap = new Map(therapistsNorm.map((t) => [String(t.id), t]));

      const normalizedBookings = (bookingsRaw ?? []).map((b) => normalizeBooking({ booking: b, therapistsById: therapistsMap, viewDate }));

      setTherapists(therapistsNorm);
      setBookings(normalizedBookings);
      saveBookingsCacheForCurrentViewDate();

      setServicesFlat(extractFlatServices(servicesRes));
    } catch (e) {
      logger.error('initial_load_failed', { message: e?.message ?? String(e) });
      setGlobalError(`Failed to load therapists/bookings: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [
    token,
    viewDate,
    setBookings,
    setTherapists,
    saveBookingsCacheForCurrentViewDate,
  ]);

  useEffect(() => {
    if (!token) return;
    // Fetch on token ready and view date change.
    refreshTherapistsAndBookings();
  }, [token, viewDate, refreshTherapistsAndBookings]);

  // Load booking details for side panel.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token || !selectedBookingId) return;
      if (bookingDetailsById?.[selectedBookingId]) return;
      try {
        const details = await apiShowBookingDetails({ token, bookingId: selectedBookingId });
        if (cancelled) return;
        setBookingDetails(selectedBookingId, details);
      } catch (e) {
        // Non-blocking: the panel can still show normalized info.
        logger.warn('booking_details_failed', { bookingId: selectedBookingId, message: e?.message ?? String(e) });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [token, selectedBookingId, bookingDetailsById, setBookingDetails]);

  const handleSelectBooking = useCallback(
    async (bookingId) => {
      setSelectedBookingId(bookingId);
    },
    [setSelectedBookingId]
  );

  const handleRescheduleBooking = useCallback(
    async ({ bookingId, therapistId, start, end }) => {
      const existing = bookings.find((b) => String(b.bookingId) === String(bookingId));
      if (!existing) return;

      const prev = existing;
      const nextTherapist = therapistsById.get(String(therapistId));
      const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

      // Optimistic update.
      upsertBooking({
        ...existing,
        therapistId,
        therapistName: nextTherapist?.name ?? existing.therapistName,
        therapistGender: nextTherapist?.gender ?? existing.therapistGender,
        start,
        end,
        durationMinutes,
      });
      saveBookingsCacheForCurrentViewDate();

      const detailsRaw = bookingDetailsById?.[bookingId] ?? existing.raw;

      try {
        const primary = getPrimaryItem(detailsRaw) ?? {};
        const serviceId = Number(existing.serviceId ?? primary?.service ?? primary?.service_id ?? 0);
        const primaryTherapist = Number(primary?.therapist ?? primary?.therapist_id ?? 0);
        const fallback = [
          {
            primary: 1,
            item_number: 1,
            service: serviceId || 1, // Ensure service is never 0, use 1 as default
            therapist: Number(therapistId) || primaryTherapist || 1,
            start_time: toHm(start),
            end_time: toHm(end),
            duration: Number(durationMinutes),
            requested_person: 0,
            price: Number(primary?.price ?? 77.00),
            quantity: Number(primary?.quantity ?? 1),
            service_request: existing.serviceRequest ?? '',
            commission: null,
            customer_name: existing.clientName ?? '',
            room_segments: primary?.room_segments ?? [],
          },
        ];

        const nextItems = buildUpdatedItems({
          raw: detailsRaw,
          updates: { start, end, durationMinutes, therapistId, serviceId: existing.serviceId },
          fallback,
        });

        const customer = 
          existing.customerId ??
          existing.raw?.customer ?? 
          existing.raw?.customer_id ??
          detailsRaw?.customer ?? 
          detailsRaw?.customer_id ??
          detailsRaw?.user_id ??  // Some APIs use user_id
          detailsRaw?.created_by;  // Fallback to created_by

        const membership = 
          existing.raw?.membership ??
          existing.raw?.membership_id ??
          detailsRaw?.membership ?? 
          detailsRaw?.membership_id;
        
        const userId = getCachedUserId() ?? '229061';
        
        if (!customer) {
          throw new Error('Cannot reschedule booking: customer ID not found');
        }

        await apiUpdateBooking({
          token,
          bookingId,
          payload: {
            company: 1,
            outlet: 1,
            items: nextItems,
            customer,
            membership,
            customerId: customer,
            note: existing.note,
            updated_by: userId,
            userId,
            booking_type: 1,
            source: 'WhatsApp',
          },
        });
        
        // Refresh the booking details to ensure side panel shows updated data
        try {
          const updatedDetails = await apiShowBookingDetails({ token, bookingId });
          setBookingDetails(bookingId, updatedDetails);
          
          // Also update the main bookings list with the new data
          const normalizedUpdated = normalizeBooking({ 
            booking: updatedDetails, 
            therapistsById, 
            viewDate 
          });
          upsertBooking(normalizedUpdated);
          saveBookingsCacheForCurrentViewDate();
        } catch (e) {
          logger.warn('booking_details_refresh_failed', { bookingId, message: e?.message ?? String(e) });
        }
        
        pushNotice('success', `Booking ${bookingId} rescheduled.`);
      } catch (e) {
        logger.error('api_reschedule_failed', { bookingId, message: e?.message ?? String(e) });
        // Roll back.
        upsertBooking(prev);
        saveBookingsCacheForCurrentViewDate();
        setGlobalError(getApiErrorMessage(e, 'Failed to reschedule booking'));
        pushNotice('error', `Reschedule failed for ${bookingId}.`);
        return;
      }
    },
    [bookings, bookingDetailsById, pushNotice, saveBookingsCacheForCurrentViewDate, therapistsById, token, upsertBooking, setBookingDetails]
  );

  const handleCancelBooking = useCallback(
    async (bookingId) => {
      const existing = bookings.find((b) => String(b.bookingId) === String(bookingId));
      if (!existing) return;
      const prev = existing;

      upsertBooking({ ...existing, status: 'Cancelled' });
      saveBookingsCacheForCurrentViewDate();

      try {
        await apiCancelBooking({ token, bookingId, cancelType: 'normal' });
        pushNotice('success', `Booking ${bookingId} cancelled.`);
      } catch (e) {
        logger.error('api_cancel_failed', { bookingId, message: e?.message ?? String(e) });
        upsertBooking(prev);
        saveBookingsCacheForCurrentViewDate();
        setGlobalError(getApiErrorMessage(e, 'Failed to cancel booking'));
        pushNotice('error', `Cancel failed for ${bookingId}.`);
        return;
      }
    },
    [bookings, pushNotice, saveBookingsCacheForCurrentViewDate, token, upsertBooking]
  );

  const handleDeleteBooking = useCallback(
    async (bookingId) => {
      const existing = bookings.find((b) => String(b.bookingId) === String(bookingId));
      if (!existing) return;
      const prev = existing;

      removeBooking(bookingId);
      saveBookingsCacheForCurrentViewDate();

      try {
        await apiDeleteBooking({ token, bookingId });
        pushNotice('success', `Booking ${bookingId} deleted.`);
      } catch (e) {
        logger.error('api_delete_failed', { bookingId, message: e?.message ?? String(e) });
        upsertBooking(prev);
        saveBookingsCacheForCurrentViewDate();
        setGlobalError(getApiErrorMessage(e, 'Failed to delete booking'));
        pushNotice('error', `Delete failed for ${bookingId}.`);
        return;
      }
    },
    [bookings, pushNotice, removeBooking, saveBookingsCacheForCurrentViewDate, token, upsertBooking]
  );

  const handleUpdateStatus = useCallback(
    async (bookingId, status) => {
      const existing = bookings.find((b) => String(b.bookingId) === String(bookingId));
      if (!existing) return;
      const prev = existing;

      upsertBooking({ ...existing, status });
      saveBookingsCacheForCurrentViewDate();

      try {
        await apiUpdateBookingStatus({ token, bookingId, status });
        pushNotice('success', `Booking ${bookingId} status changed to ${status}.`);
      } catch (e) {
        logger.error('api_status_failed', { bookingId, status, message: e?.message ?? String(e) });
        upsertBooking(prev);
        saveBookingsCacheForCurrentViewDate();
        setGlobalError(getApiErrorMessage(e, 'Failed to update booking status'));
        pushNotice('error', `Status update failed for ${bookingId}.`);
        return;
      }
    },
    [bookings, pushNotice, saveBookingsCacheForCurrentViewDate, token, upsertBooking]
  );

  const handleUpdateBooking = useCallback(
    async (bookingId, changes) => {
      const existing = bookings.find((b) => String(b.bookingId) === String(bookingId));
      if (!existing) return;

      const prev = existing;
      const nextTherapist = therapistsById.get(String(changes.therapistId));
      const newEnd = existing.start
        ? new Date(existing.start.getTime() + Math.max(0, Number(changes.durationMinutes) || 0) * 60000)
        : existing.end;

      const next = {
        ...existing,
        therapistId: changes.therapistId,
        therapistName: nextTherapist?.name ?? existing.therapistName,
        therapistGender: nextTherapist?.gender ?? existing.therapistGender,
        serviceId: changes.serviceId,
        durationMinutes: Number(changes.durationMinutes) || existing.durationMinutes,
        end: newEnd,
        note: changes.note,
      };

      logger.info('handleUpdateBooking_optimistic_update', {
        bookingId,
        changes,
        nextData: {
          therapistId: next.therapistId,
          serviceId: next.serviceId,
          durationMinutes: next.durationMinutes,
          note: next.note,
        },
      });

      upsertBooking(next);
      saveBookingsCacheForCurrentViewDate();

      const detailsRaw = bookingDetailsById?.[bookingId] ?? existing.raw;
      try {
        // Always try to fetch full details if we don't have customer info
        let fullDetails = detailsRaw;
        const hasCustomer = !!(
          fullDetails?.customer || 
          fullDetails?.customer_id || 
          fullDetails?.customerid
        );
        if (!fullDetails || !hasCustomer) {
          try {
            fullDetails = await apiShowBookingDetails({ token, bookingId });
            logger.info('handleUpdateBooking_fetched_details', { bookingId, fullDetailsKeys: Object.keys(fullDetails ?? {}) });
          } catch (e) {
            logger.warn('handleUpdateBooking_could_not_fetch_details', { bookingId, message: e?.message ?? String(e) });
          }
        }

        const primary = getPrimaryItem(fullDetails) ?? {};
        const durationMinutes = next.durationMinutes;

        logger.info('handleUpdateBooking_extracted_primary', {
          bookingId,
          primaryKeys: Object.keys(primary ?? {}),
          primary: {
            customer: primary?.customer,
            customer_id: primary?.customer_id,
            therapist: primary?.therapist,
            therapist_id: primary?.therapist_id,
            service: primary?.service,
            service_id: primary?.service_id,
            room_segments: primary?.room_segments,
          },
          existingCustomerId: existing.customerId,
          existingRawCustomer: existing.raw?.customer,
          fullDetailsCustomer: fullDetails?.customer,
          fullDetailsCustomerId: fullDetails?.customer_id,
        });

        const serviceId = Number(changes.serviceId ?? existing.serviceId ?? primary?.service ?? primary?.service_id ?? 0);
        const therapistId = Number(changes.therapistId ?? existing.therapistId ?? primary?.therapist ?? primary?.therapist_id ?? 0);
        const fallback = [
          {
            primary: 1,
            item_number: 1,
            service: serviceId || 1, // Ensure service is never 0, use 1 as default
            therapist: therapistId || 1, // Ensure therapist is never 0, use 1 as default
            start_time: existing.start ? toHm(existing.start) : primary?.start_time ?? '00:00',
            end_time: newEnd ? toHm(newEnd) : primary?.end_time ?? '00:00',
            duration: Number(durationMinutes),
            requested_person: 0,
            price: Number(primary?.price ?? 77.00),
            quantity: Number(primary?.quantity ?? 1),
            service_request: existing.serviceRequest ?? '',
            commission: null,
            customer_name: existing.clientName ?? '',
            // Only include room_segments if they have data
            ...(Array.isArray(primary?.room_segments) && primary.room_segments.length > 0
              ? { room_segments: primary.room_segments }
              : {}),
          },
        ];

        const nextItems = buildUpdatedItems({
          raw: fullDetails,
          updates: {
            start: existing.start,
            end: newEnd,
            durationMinutes,
            therapistId: changes.therapistId,
            serviceId: changes.serviceId,
            note: changes.note,
          },
          fallback,
        });

        // Customer ID - try multiple field names since API structure varies
        // Try: existing customerId, then raw customer fields, then fullDetails, then user_id, then created_by
        const customer = 
          existing.customerId ??
          existing.raw?.customer ?? 
          existing.raw?.customer_id ??
          fullDetails?.customer ?? 
          fullDetails?.customer_id ?? 
          fullDetails?.customerid ??
          fullDetails?.customer?.id ??
          fullDetails?.user_id ??  // Some APIs use user_id instead of customer
          fullDetails?.created_by ??  // Fallback to created_by if user_id not available
          primary?.customer ?? 
          primary?.customer_id ??
          primary?.user_id;
        
        logger.info('handleUpdateBooking_customer_extraction', {
          bookingId,
          'existing.customerId': existing.customerId,
          'existing.raw.customer': existing.raw?.customer,
          'existing.raw.customer_id': existing.raw?.customer_id,
          'fullDetails.customer': fullDetails?.customer,
          'fullDetails.customer_id': fullDetails?.customer_id,
          'fullDetails.customerid': fullDetails?.customerid,
          'fullDetails.customer.id': fullDetails?.customer?.id,
          'fullDetails.user_id': fullDetails?.user_id,
          'fullDetails.created_by': fullDetails?.created_by,
          'primary.customer': primary?.customer,
          'primary.customer_id': primary?.customer_id,
          'primary.user_id': primary?.user_id,
          finalCustomer: customer,
          fullDetailsKeys: Object.keys(fullDetails ?? {}),
        });
        
        const membership = 
          existing.raw?.membership ??
          existing.raw?.membership_id ??
          fullDetails?.membership ?? 
          fullDetails?.membership_id ?? 
          primary?.membership;
        
        const userId = getCachedUserId() ?? '229061';
        
        if (!customer) {
          const err = new Error('Cannot update booking: customer ID not found in booking details');
          logger.error('handleUpdateBooking_missing_customer', {
            bookingId,
            fullDetailsKeys: Object.keys(fullDetails ?? {}),
            existingRawKeys: Object.keys(existing.raw ?? {}),
            primaryKeys: Object.keys(primary ?? {}),
            existingCustomerId: existing.customerId,
            fullDetailsCustomerReleated: {
              customer: fullDetails?.customer,
              customer_id: fullDetails?.customer_id,
              customerid: fullDetails?.customerid,
            },
            existingRawCustomerReleated: {
              customer: existing.raw?.customer,
              customer_id: existing.raw?.customer_id,
            },
          });
          throw err;
        }
        
        logger.info('handleUpdateBooking_api_payload', {
          bookingId,
          itemsCount: nextItems.length,
          firstItem: nextItems[0],
          items: nextItems,
          customer,
          membership,
          userId,
          note: changes.note,
        });

        // Validate all required fields are present before calling API
        if (!customer || String(customer).trim() === '') {
          throw new Error(`Cannot update booking: customer ID is ${customer === undefined ? 'undefined' : customer === null ? 'null' : 'empty'}`);
        }
        if (!userId || String(userId).trim() === '') {
          throw new Error(`Cannot update booking: user ID is ${userId === undefined ? 'undefined' : userId === null ? 'null' : 'empty'}`);
        }
        if (nextItems.length === 0) {
          throw new Error('Cannot update booking: no items/services in booking');
        }

        const apiResponse = await apiUpdateBooking({
          token,
          bookingId,
          payload: {
            company: 1,
            outlet: 1,
            items: nextItems,
            customer,
            membership,
            customerId: customer,
            note: changes.note,
            booking_type: 1,
            updated_by: userId,
            userId,
            source: 'WhatsApp',
          },
        });
        
        logger.info('handleUpdateBooking_api_success', { bookingId, apiResponse });
        
        // Refresh the booking details to ensure side panel shows updated data
        try {
          const updatedDetails = await apiShowBookingDetails({ token, bookingId });
          logger.info('booking_details_refreshed', { bookingId, updatedDetails });
          setBookingDetails(bookingId, updatedDetails);
          
          // Also update the main bookings list with the new data
          const normalizedUpdated = normalizeBooking({ 
            booking: updatedDetails, 
            therapistsById, 
            viewDate 
          });
          logger.info('booking_normalized_after_update', { bookingId, normalized: normalizedUpdated });
          upsertBooking(normalizedUpdated);
          saveBookingsCacheForCurrentViewDate();
        } catch (e) {
          logger.warn('booking_details_refresh_failed', { bookingId, message: e?.message ?? String(e) });
        }
        
        pushNotice('success', `Booking ${bookingId} updated.`);
      } catch (e) {
        logger.error('api_update_booking_failed', { 
          bookingId, 
          message: e?.message ?? String(e),
          status: e?.status,
          errors: e?.payload?.errors,
          fullPayload: e?.payload,
        });
        upsertBooking(prev);
        saveBookingsCacheForCurrentViewDate();
        
        // Get detailed error message
        let errorMsg = getApiErrorMessage(e, 'Failed to update booking');
        if (e?.payload?.errors) {
          const errorKeys = Object.keys(e.payload.errors);
          if (errorKeys.length > 0) {
            const firstError = e.payload.errors[errorKeys[0]];
            const details = Array.isArray(firstError) ? firstError.join(', ') : String(firstError);
            errorMsg = `${errorKeys[0]}: ${details}`;
          }
        }
        
        setGlobalError(errorMsg);
        pushNotice('error', `Update failed: ${errorMsg}`);
        return;
      }
    },
    [bookings, bookingDetailsById, pushNotice, saveBookingsCacheForCurrentViewDate, therapistsById, token, upsertBooking, setBookingDetails, viewDate, refreshTherapistsAndBookings]
  );

  const handleCreateBooking = useCallback(
    async () => {
      if (!token) return;
      const therapistId = createForm.therapistId || therapists[0]?.id;
      const serviceId = createForm.serviceId;
      const customerId = createForm.customerId;
      if (!therapistId || !serviceId || !customerId) {
        const missing = [];
        if (!therapistId) missing.push('Therapist');
        if (!serviceId) missing.push('Service');
        if (!customerId) missing.push('Customer');
        setGlobalError(`Please select: ${missing.join(', ')}`);
        return;
      }

      const startDate = new Date(viewDate);
      const [hh, mm] = String(createForm.startTime).split(':').map((x) => Number(x));
      startDate.setHours(hh || 0, mm || 0, 0, 0);
      const endDate = new Date(startDate.getTime() + Number(createForm.durationMinutes) * 60000);

      const durationMinutes = Math.max(0, Number(createForm.durationMinutes) || 0);
      
      // NOTE: Room segments are disabled by default because the room availability API
      // returns room IDs that don't match the booking creation API's room catalog.
      // Rooms can be re-enabled once the backend provides compatible room IDs or a room master list.
      // For now, we always send empty room_segments to create bookings without rooms.
      const room_segments = [];

      const optimisticBooking = {
        bookingId: `tmp-${Date.now()}`,
        therapistId,
        therapistName: therapistsById.get(String(therapistId))?.name ?? 'Therapist',
        therapistGender: therapistsById.get(String(therapistId))?.gender ?? 'female',
        start: startDate,
        end: endDate,
        durationMinutes,
        status: 'Confirmed',
        clientName: clients.find((c) => String(c.id) === String(customerId))?.name ?? 'Client',
        serviceId,
        serviceRequest: createForm.requestType,
        note: createForm.note,
        raw: {},
      };

      // Optimistic add.
      upsertBooking(optimisticBooking);
      saveBookingsCacheForCurrentViewDate();
      setCreateOpen(false);

      const createdBy = getCachedUserId() ?? '229061';

      const buildPayload = (includeRoom) => {
        const baseItem = {
          service: Number(serviceId) || 1, // Ensure service is never 0 or falsy
          start_time: toHm(startDate),
          end_time: toHm(endDate),
          duration: Number(durationMinutes),
          therapist: Number(therapistId) || 1, // Ensure therapist is never 0 or falsy
          requested_person: 0,
          price: 77.00,
          quantity: 1,
          service_request: createForm.requestType ?? '',
          commission: null,
          customer_name: clients.find((c) => String(c.id) === String(customerId))?.name ?? 'Client',
          primary: 1,
          item_number: 1,
        };
        
        // Only include room_segments if we're including room AND have valid room_segments
        if (includeRoom && room_segments.length > 0) {
          baseItem.room_segments = room_segments;
        }
        
        return {
          company: 1,
          outlet: 1,
          outlet_type: 2,
          booking_type: 1,
          customer: customerId,
          created_by: createdBy,
          currency: 'SGD',
          source: 'WhatsApp',
          payment_type: 'payatstore',
          service_at: `${toDmy(viewDate)} ${toHm(startDate)}`,
          note: createForm.note,
          membership: 0,
          panel: 'outlet',
          type: 'manual',
          items: [baseItem],
        };
      };

      const payload = buildPayload(true);

      logger.info('api_create_booking_sending', { 
        customerId, 
        serviceId, 
        therapistId,
        roomId: createForm.roomId,
        durationMinutes,
        hasRoomSegments: room_segments.length > 0,
        items: payload.items 
      });

      try {
        await apiCreateBooking({ token, payload });
        await refreshTherapistsAndBookings();
        pushNotice('success', 'Booking created successfully.');
      } catch (e) {
        logger.error('api_create_failed', { 
          message: e?.message ?? String(e),
          status: e?.status,
          errors: e?.payload?.errors,
        });

        // Roll back tmp booking by removing it (best-effort).
        removeBooking(optimisticBooking.bookingId);
        saveBookingsCacheForCurrentViewDate();
        setGlobalError(getApiErrorMessage(e, 'Create booking failed'));
        pushNotice('error', 'Create booking failed.');
        return;
      }
    },
    [
      createForm,
      clients,
      pushNotice,
      removeBooking,
      refreshTherapistsAndBookings,
      saveBookingsCacheForCurrentViewDate,
      therapists,
      therapistsById,
      token,
      upsertBooking,
      viewDate,
    ]
  );

  // Reset room selection when modal opens
  useEffect(() => {
    if (createOpen) {
      setCreateForm((prev) => ({
        ...prev,
        roomId: '', // Always reset room selection to avoid invalid room IDs
      }));
    }
  }, [createOpen]);

  useEffect(() => {
    let cancelled = false;
    const loadClients = async () => {
      if (!token) return;
      if (clients.length) return;
      setClientsLoading(true);
      try {
        const from = new Date();
        from.setFullYear(from.getFullYear() - 1);
        const to = new Date();
        to.setFullYear(to.getFullYear() + 1);
        const users = await apiListUsers({ token, fromDate: from, toDate: to });
        if (cancelled) return;
        const normalized = (Array.isArray(users) ? users : []).map((u) => ({
          id: u.id,
          name: [u.name, u.lastname].filter(Boolean).join(' ').trim() || u.email || `User ${u.id}`,
          email: u.email,
        }));
        setClients(normalized);
        if (normalized.length > 0) {
          setCreateForm((prev) => (prev.customerId ? prev : { ...prev, customerId: String(normalized[0].id) }));
        }
      } catch (e) {
        logger.error('clients_load_failed', { message: e?.message ?? String(e) });
        setGlobalError(`Failed to load clients: ${e?.message ?? String(e)}`);
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    };
    loadClients();
    return () => {
      cancelled = true;
    };
  }, [token, clients.length]);

  // Load rooms when create modal opens or when date changes
  useEffect(() => {
    let cancelled = false;
    const loadRooms = async () => {
      if (!createOpen || !token) {
        setRooms([]);
        return;
      }
      setRoomsLoading(true);
      try {
        const availableRooms = await apiListRoomsForDate({ token, date: viewDate, durationMinutes: createForm.durationMinutes });
        if (cancelled) return;
        logger.info('rooms_fetched', { count: availableRooms?.length ?? 0, rooms: availableRooms });
        const normalized = (Array.isArray(availableRooms) ? availableRooms : []).map((r) => ({
          id: r.id ?? r.room_id,
          name: r.name ?? r.room_name ?? `Room ${r.id ?? r.room_id}`,
          raw: r,
        }));
        setRooms(normalized);
      } catch (e) {
        logger.warn('rooms_load_failed', { message: e?.message ?? String(e) });
        setRooms([]);
      } finally {
        if (!cancelled) setRoomsLoading(false);
      }
    };
    loadRooms();
    return () => {
      cancelled = true;
    };
  }, [token, createOpen, viewDate, createForm.durationMinutes]);

  const visiblePanelOpen = Boolean(selectedBookingId);

  return (
    <div className="bcp-root">
      <div className="bcp-notice-pad">
        {notices.map((n) => (
          <div key={n.id} className={`bcp-notice bcp-notice--${n.type}`}>
            {n.text}
          </div>
        ))}
      </div>
      <div className="bcp-topbar">
        <div className="bcp-left">
          <input
            className="bcp-search"
            type="text"
            placeholder="Search bookings..."
            value={filters.searchText}
            onChange={(e) => setFilters({ searchText: e.target.value })}
          />
          <select className="bcp-select" value={filters.status ?? ''} onChange={(e) => setFilters({ status: e.target.value || null })}>
            <option value="">All statuses</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Check-in (In Progress)">Check-in (In Progress)</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <div className="bcp-right">
          <button className="bcp-create-btn" type="button" disabled={!therapists.length} onClick={() => setCreateOpen(true)}>
            Create Booking
          </button>
        </div>
      </div>

      {globalError ? <div className="bcp-error">{globalError}</div> : null}
      <div className="bcp-main">
        <div className="bcp-calendar-wrap" style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <TherapistScheduleCalendar
            therapists={therapists}
            bookings={bookings}
            viewDate={viewDate}
            filters={filters}
            onSelectBooking={handleSelectBooking}
            onRescheduleBooking={handleRescheduleBooking}
          />
        </div>

        <BookingDetailsPanel
          booking={selectedBooking}
          therapists={therapists}
          services={servicesFlat}
          open={visiblePanelOpen}
          loading={loading}
          error={null}
          onClose={() => setSelectedBookingId(null)}
          onCancelBooking={handleCancelBooking}
          onDeleteBooking={handleDeleteBooking}
          onUpdateStatus={handleUpdateStatus}
          onUpdateBooking={handleUpdateBooking}
        />
      </div>

      {/* Create modal (basic) */}
      {createOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17,24,39,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <div style={{ width: '100%', maxWidth: 700, maxHeight: '90vh', background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontWeight: 900, fontSize: '18px' }}>Create booking</div>
              <button className="bdp-close" type="button" onClick={() => setCreateOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <label style={{ display: 'block' }}>
                <div className="bdp-field__label">
                  Therapist <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
                </div>
                <select
                  className="bdp-input"
                  value={createForm.therapistId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, therapistId: e.target.value }))}
                >
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'block' }}>
                <div className="bdp-field__label">
                  Service <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
                </div>
                <select
                  className="bdp-input"
                  value={createForm.serviceId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, serviceId: e.target.value }))}
                >
                  <option value="">Select</option>
                  {servicesFlat.length === 0 ? (
                    <option value="" disabled>
                      No services available
                    </option>
                  ) : (
                    servicesFlat.map((s) => (
                      <option key={String(s.id)} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label style={{ display: 'block' }}>
                <div className="bdp-field__label">
                  Start time <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
                </div>
                <input
                  className="bdp-input"
                  type="time"
                  step={900}
                  value={createForm.startTime}
                  onChange={(e) => setCreateForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </label>

              <label style={{ display: 'block' }}>
                <div className="bdp-field__label">
                  Duration (minutes) <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
                </div>
                <input
                  className="bdp-input"
                  type="number"
                  min={15}
                  step={15}
                  value={createForm.durationMinutes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                />
              </label>

              <label style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' }}>
                <div className="bdp-field__label">Room <span style={{ fontSize: '11px', color: '#9ca3af' }}>(disabled - pending backend fix)</span></div>
                <select
                  className="bdp-input"
                  value={createForm.roomId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, roomId: e.target.value }))}
                  disabled={true}
                  style={{ opacity: 0.5 }}
                >
                  <option value="">Rooms currently unavailable</option>
                </select>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: 4 }}>
                  Room assignment is temporarily disabled. Bookings will be created without room selection.
                </div>
              </label>

              <label style={{ display: 'block' }}>
                <div className="bdp-field__label">
                  Customer <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
                </div>
                <input
                  className="bdp-input"
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder={clientsLoading ? 'Loading clients…' : 'Search client by name/email'}
                />
                <select
                  className="bdp-input"
                  style={{ marginTop: 8 }}
                  value={createForm.customerId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, customerId: e.target.value }))}
                  disabled={clientsLoading}
                >
                  <option value="">Select customer</option>
                  {clients
                    .filter((c) => {
                      const q = clientSearch.trim().toLowerCase();
                      if (!q) return true;
                      return `${c.name} ${c.email ?? ''}`.toLowerCase().includes(q);
                    })
                    .slice(0, 50)
                    .map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        {c.name} ({c.id})
                      </option>
                    ))}
                </select>
                <input
                  className="bdp-input"
                  style={{ marginTop: 8 }}
                  type="number"
                  value={createForm.customerId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, customerId: e.target.value }))}
                  placeholder="Or enter customer ID manually"
                />
              </label>

              <label style={{ display: 'block', gridColumn: '1 / -1' }}>
                <div className="bdp-field__label">Request type / notes</div>
                <input
                  className="bdp-input"
                  type="text"
                  value={createForm.requestType}
                  onChange={(e) => setCreateForm((f) => ({ ...f, requestType: e.target.value }))}
                />
              </label>

              <label style={{ display: 'block', gridColumn: '1 / -1' }}>
                <div className="bdp-field__label">Notes</div>
                <textarea
                  className="bdp-input"
                  value={createForm.note}
                  onChange={(e) => setCreateForm((f) => ({ ...f, note: e.target.value }))}
                  rows={3}
                />
              </label>
            </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
              <button className="bdp-btn bdp-btn--ghost" type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button className="bdp-btn" type="button" onClick={handleCreateBooking} disabled={!createForm.customerId || !createForm.serviceId || !createForm.therapistId}>
                Create Booking
              </button>
            </div>
            <div className="bcp-subtle" style={{ marginTop: 12, fontSize: '12px' }}>
              <span style={{ color: '#ef4444', fontWeight: 700 }}>* </span>Mandatory fields. All required to create a booking. Rooms are not available at this time.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

