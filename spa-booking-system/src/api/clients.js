import { API_BASE_URL } from './constants';
import { apiFetchFormData, apiFetchJson } from './client';
import { format } from 'date-fns';

const extractList = (res) => {
  // Observed backend shape: res.data.data.list.users
  const users = res?.data?.data?.list?.users;
  if (Array.isArray(users)) return users;
  return res?.data?.users ?? res?.data?.items ?? res?.users ?? res?.data ?? res ?? [];
};

export const apiListUsers = async ({ token, fromDate, toDate }) => {
  const params = new URLSearchParams();
  params.set('pagination', '1');
  params.set(
    'daterange',
    `${format(fromDate, 'yyyy-MM-dd')} / ${format(toDate, 'yyyy-MM-dd')}`,
  );
  const url = `${API_BASE_URL}/api/v1/users?${params.toString()}`;
  const res = await apiFetchJson({ url, method: 'GET', token });
  return extractList(res);
};

// Used as "client search/creation" fallback.
export const apiCreateClient = async ({ token, payload }) => {
  const url = `${API_BASE_URL}/api/v1/users/create`;
  const form = new FormData();
  form.set('name', payload.name ?? '');
  form.set('lastname', payload.lastname ?? '');
  form.set('email', payload.email ?? '');
  form.set('contact_number', payload.contact_number ?? payload.contactNumber ?? '');
  form.set('gender', payload.gender ?? 'male');
  form.set('status', String(payload.status ?? 1));
  form.set('membership', String(payload.membership ?? 1));

  const res = await apiFetchFormData({ url, token, method: 'POST', formData: form });
  return res;
};

