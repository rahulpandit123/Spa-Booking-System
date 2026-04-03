import { apiFetchJson } from './client';
import {
  API_BASE_URL,
  LOGIN_EMAIL,
  LOGIN_KEY_PASS,
  LOGIN_PASSWORD,
} from './constants';
import logger from '../lib/logger';

const TOKEN_KEY = 'spa_booking_token';
const LOGIN_DATE_KEY = 'spa_booking_login_date'; // YYYY-MM-DD
const USER_ID_KEY = 'spa_booking_user_id';

const todayStamp = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const readTokenCache = () => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const loginDate = localStorage.getItem(LOGIN_DATE_KEY);
    if (!token || !loginDate) return null;
    if (loginDate !== todayStamp()) return null;
    return token;
  } catch {
    return null;
  }
};

const writeTokenCache = (token) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(LOGIN_DATE_KEY, todayStamp());
  } catch {
    // ignore
  }
};

export const getCachedUserId = () => {
  try {
    const loginDate = localStorage.getItem(LOGIN_DATE_KEY);
    if (loginDate !== todayStamp()) return null;
    const v = localStorage.getItem(USER_ID_KEY);
    if (!v) return null;
    return String(v);
  } catch {
    return null;
  }
};

export const loginOncePerDay = async () => {
  const cached = readTokenCache();
  if (cached) return cached;

  const url = `${API_BASE_URL}/api/v1/login`;
  logger.info('api_login_start', { date: todayStamp() });

  const payload = {
    email: LOGIN_EMAIL,
    password: LOGIN_PASSWORD,
    key_pass: LOGIN_KEY_PASS,
  };

  const res = await apiFetchJson({ url, method: 'POST', body: payload });

  // Normalize token from a few common shapes.
  const token =
    res?.token ||
    res?.data?.token ||
    res?.data?.data?.token?.token ||
    res?.access_token ||
    res?.data?.access_token ||
    res?.jwt;

  if (!token) {
    logger.error('api_login_missing_token', { response: res });
    throw new Error('Login succeeded but token missing in response');
  }

  writeTokenCache(token);
  try {
    const userId = res?.data?.data?.user?.id;
    if (userId != null) localStorage.setItem(USER_ID_KEY, String(userId));
  } catch {
    // ignore
  }
  logger.info('api_login_success');
  return token;
};

