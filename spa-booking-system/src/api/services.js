import { API_BASE_URL, DEFAULT_OUTLET_ID, DEFAULT_OUTLET_TYPE } from './constants';
import { apiFetchJson } from './client';

const extract = (res) => {
  if (!res) return [];
  // Observed backend shape:
  // res.data.data.list = { category: [...] }
  const cat = res?.data?.data?.list?.category;
  if (Array.isArray(cat)) return cat;
  if (Array.isArray(res?.data?.categories)) return res.data.categories;
  if (Array.isArray(res?.categories)) return res.categories;
  // Fallback: if list itself is already an array, use it.
  if (Array.isArray(res?.data?.list)) return res.data.list;
  return [];
};

export const apiListServiceCategories = async ({ token }) => {
  const params = new URLSearchParams();
  params.set('outlet_type', String(DEFAULT_OUTLET_TYPE));
  params.set('outlet', String(DEFAULT_OUTLET_ID));
  params.set('pagination', '0');
  params.set('panel', 'outlet');

  const url = `${API_BASE_URL}/api/v1/service-category?${params.toString()}`;
  const res = await apiFetchJson({ url, method: 'GET', token });
  return extract(res);
};

