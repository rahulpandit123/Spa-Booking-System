import { API_BASE_URL, DEFAULT_OUTLET_ID } from './constants';
import { apiFetchJson } from './client';
import { format } from 'date-fns';

const extract = (res) => res?.data?.rooms ?? res?.rooms ?? res?.data ?? res ?? [];

export const apiListRoomsForDate = async ({ token, date, durationMinutes = 60 }) => {
  const datePart = format(date, 'dd-MM-yyyy');

  const params = new URLSearchParams();
  params.set('date', datePart);
  params.set('panel', 'outlet');
  params.set('duration', String(durationMinutes));

  const url = `${API_BASE_URL}/api/v1/room-bookings/outlet/${DEFAULT_OUTLET_ID}?${params.toString()}`;
  const res = await apiFetchJson({ url, method: 'GET', token });
  return extract(res);
};

