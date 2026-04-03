import { apiFetchFormData, apiFetchJson } from './client';
import { API_BASE_URL, DEFAULT_OUTLET_ID, DEFAULT_OUTLET_TYPE } from './constants';

import logger from '../lib/logger';
import { format } from 'date-fns';

const toDmy = (d) => format(d, 'dd-MM-yyyy');

const extractList = (res) => {
  // Response shape is not provided in the Postman collection, so we normalize defensively.
  if (Array.isArray(res)) return res;
  if (res?.data?.data?.list) {
    const list = res.data.data.list;
    if (Array.isArray(list)) return list;
    if (Array.isArray(list.bookings)) return list.bookings;
  }
  return (
    res?.data?.bookings ??
    res?.data?.items ??
    res?.bookings ??
    res?.items ??
    res?.data ??
    []
  );
};

export const apiListBookingsCalendar = async ({
  date,
  token,
  therapistId,
  status, // "Confirmed" | "Check-in (In Progress)" | "Cancelled" (from collection)
}) => {
  const start = toDmy(date);
  const end = toDmy(date);
  const daterange = `${start} / ${end}`;

  const params = new URLSearchParams();
  params.set('pagination', '1');
  params.set('daterange', daterange);
  params.set('outlet', String(DEFAULT_OUTLET_ID));
  params.set('panel', 'outlet');
  params.set('view_type', 'calendar');
  if (therapistId) params.set('therapist', String(therapistId));
  if (status) params.set('status', status);

  const url = `${API_BASE_URL}/api/v1/bookings/outlet/booking/list?${params.toString()}`;
  const res = await apiFetchJson({ url, method: 'GET', token });
  return extractList(res);
};

// POST /api/v1/bookings/create (form-data with `items` as JSON string)
export const apiCreateBooking = async ({ token, payload }) => {
  const url = `${API_BASE_URL}/api/v1/bookings/create`;

  const form = new FormData();
  form.set('company', String(payload.company ?? 1));
  form.set('outlet', String(payload.outlet ?? DEFAULT_OUTLET_ID));
  form.set('outlet_type', String(payload.outlet_type ?? DEFAULT_OUTLET_TYPE));
  form.set('booking_type', String(payload.booking_type ?? 1));
  form.set('customer', String(payload.customer ?? payload.clientId ?? ''));
  form.set('created_by', String(payload.created_by ?? payload.userId ?? ''));

  // Required by backend: `items` is a JSON array string.
  // Ensure all numeric fields are actually numeric with proper defaults
  const items = (payload.items ?? []).map(item => {
    const result = { ...item };
    // Quantity - must be numeric
    result.quantity = Number(result.quantity ?? 1);
    // Price - must be numeric
    result.price = Number(result.price ?? 0);
    // Service - MUST BE NUMERIC, use service_id as fallback
    const serviceValue = result.service ?? result.service_id ?? 0;
    result.service = Number(serviceValue);
    // Therapist - must be numeric, use therapist_id as fallback
    const therapistValue = result.therapist ?? result.therapist_id ?? 0;
    result.therapist = Number(therapistValue);
    // Duration - must be numeric
    result.duration = Number(result.duration ?? 0);
    return result;
  });
  form.set('items', JSON.stringify(items));
  logger.info('api_create_booking_items', { items });

  if (payload.currency) form.set('currency', payload.currency);
  if (payload.source) form.set('source', payload.source);
  if (payload.payment_type) form.set('payment_type', payload.payment_type);
  if (payload.service_at) form.set('service_at', payload.service_at);
  if (payload.note != null) form.set('note', payload.note);
  if (payload.membership != null) form.set('membership', String(payload.membership));

  form.set('panel', payload.panel ?? 'outlet');
  form.set('type', payload.type ?? 'manual');

  logger.info('api_create_booking_request', { customer: payload.customer, items: payload.items?.length });
  const res = await apiFetchFormData({ url, token, method: 'POST', formData: form });
  return res;
};

// Update booking: Postman example uses POST /api/v1/bookings/{id}
export const apiUpdateBooking = async ({ token, bookingId, payload }) => {
  const url = `${API_BASE_URL}/api/v1/bookings/${bookingId}`;

  const form = new FormData();
  form.set('company', String(payload.company ?? 1));
  form.set('outlet', String(payload.outlet ?? DEFAULT_OUTLET_ID));
  
  // Ensure items have proper structure with room_segments and all numeric fields
  const items = (payload.items ?? []).map(item => {
    const result = { ...item };
    // Remove room_segments if it's an empty array - the API rejects empty arrays
    if (Array.isArray(result.room_segments) && result.room_segments.length === 0) {
      delete result.room_segments;
    }
    // Quantity - must be numeric
    result.quantity = Number(result.quantity ?? 1);
    // Price - must be numeric
    result.price = Number(result.price ?? 0);
    // Service - MUST BE NUMERIC, use service_id as fallback
    const serviceValue = result.service ?? result.service_id ?? 0;
    result.service = Number(serviceValue);
    // Therapist - must be numeric, use therapist_id as fallback
    const therapistValue = result.therapist ?? result.therapist_id ?? 0;
    result.therapist = Number(therapistValue);
    // Duration - must be numeric
    result.duration = Number(result.duration ?? 0);
    return result;
  });
  logger.info('api_update_booking_items', { items });
  form.set('items', JSON.stringify(items));

  // Customer is required
  const customer = payload.customer ?? payload.clientId;
  if (customer != null && String(customer).trim().length > 0) {
    form.set('customer', String(customer));
  } else if (payload.customerId != null) {
    form.set('customer', String(payload.customerId));
  }

  // Membership is required
  if (payload.membership != null) {
    form.set('membership', String(payload.membership));
  } else if (payload.defaultMembership != null) {
    form.set('membership', String(payload.defaultMembership));
  }

  if (payload.note != null) form.set('note', payload.note);
  if (payload.panel) form.set('panel', payload.panel);
  if (payload.booking_type != null) form.set('booking_type', String(payload.booking_type));
  if (payload.source) form.set('source', payload.source);
  
  // updated_by must be a valid user ID (not 0)
  const updatedBy = payload.updated_by ?? payload.userId;
  if (updatedBy != null && String(updatedBy).trim().length > 0 && updatedBy !== 0 && updatedBy !== '0') {
    form.set('updated_by', String(updatedBy));
  }

  const res = await apiFetchFormData({ url, token, method: 'POST', formData: form });
  return res;
};

export const apiShowBookingDetails = async ({ token, bookingId }) => {
  const url = `${API_BASE_URL}/api/v1/bookings/booking-details/${bookingId}`;
  const res = await apiFetchJson({ url, method: 'GET', token });
  // Unwrap nested data structure if present
  if (res?.data && typeof res.data === 'object') {
    // If data itself has nested data, unwrap further
    if (res.data?.data && typeof res.data.data === 'object' && res.data.data.id) {
      return res.data.data;
    }
    return res.data;
  }
  return res;
};

export const apiCancelBooking = async ({ token, bookingId, cancelType = 'normal' }) => {
  const url = `${API_BASE_URL}/api/v1/bookings/item/cancel`;
  const form = new FormData();
  form.set('company', '1');
  form.set('id', String(bookingId));
  form.set('type', cancelType);
  form.set('panel', 'outlet');
  const res = await apiFetchFormData({ url, token, method: 'POST', formData: form });
  return res;
};

export const apiDeleteBooking = async ({ token, bookingId }) => {
  const url = `${API_BASE_URL}/api/v1/bookings/destroy/${bookingId}`;
  return apiFetchJson({ url, method: 'DELETE', token });
};

export const apiUpdateBookingStatus = async ({ token, bookingId, status }) => {
  const url = `${API_BASE_URL}/api/v1/bookings/update/payment-status`;
  const form = new FormData();
  form.set('company', '1');
  form.set('id', String(bookingId));
  form.set('status', status);
  form.set('panel', 'outlet');
  form.set('outlet_type', String(DEFAULT_OUTLET_TYPE));
  const res = await apiFetchFormData({ url, token, method: 'POST', formData: form });
  return res;
};

