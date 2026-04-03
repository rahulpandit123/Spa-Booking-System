import { API_BASE_URL, DEFAULT_OUTLET_ID, DEFAULT_OUTLET_TYPE } from './constants';
import { apiFetchJson } from './client';
import { format } from 'date-fns';

const extractList = (res) => {
  if (Array.isArray(res)) return res;
  const list = res?.data?.data?.list ?? res?.data?.list;
  if (Array.isArray(list)) return list;
  // Observed backend shape: data.data.list = { staffs: [...] }
  if (Array.isArray(list?.staffs)) return list.staffs;

  const therapists =
    res?.data?.therapists ??
    res?.therapists ??
    res?.data?.staffs ??
    res?.staffs ??
    null;

  if (Array.isArray(therapists)) return therapists;
  return [];
};

export const apiListTherapists = async ({ token, date }) => {
  // Postman collection uses service_at = "22-03-2026 16:45:00"
  const datePart = format(date, 'dd-MM-yyyy');
  const serviceAt = `${datePart} 16:45:00`;

  const params = new URLSearchParams();
  params.set('outlet', String(DEFAULT_OUTLET_ID));
  params.set('service_at', serviceAt);
  params.set('pagination', '0');
  params.set('panel', 'outlet');
  params.set('outlet_type', String(DEFAULT_OUTLET_TYPE));
  // Don't filter by availability, status, or leave to show all therapists
  // params.set('availability', '1');
  // params.set('services', '1');
  // params.set('status', '1');
  // params.set('leave', '0');

  const url = `${API_BASE_URL}/api/v1/therapists?${params.toString()}`;
  const res = await apiFetchJson({ url, method: 'GET', token });
  return extractList(res);
};

