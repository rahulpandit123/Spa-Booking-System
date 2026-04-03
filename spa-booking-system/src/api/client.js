import logger from '../lib/logger';

const DEFAULT_TIMEOUT_MS = 30000;

const serializeError = (err) => {
  if (!err) return { message: 'Unknown error' };
  if (err instanceof Error) return { message: err.message, name: err.name, stack: err.stack };
  return { message: String(err) };
};

export const apiFetchJson = async ({ url, method = 'GET', token, body, timeoutMs }) => {
  const controller = new AbortController();
  const finalTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), finalTimeout);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    const maybeJson = text ? (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })() : null;

    if (!res.ok) {
      const errorPayload = maybeJson ?? { message: text || res.statusText };
      logger.error('api_failure', { url, method, status: res.status, error: errorPayload });
      const e = new Error(errorPayload?.message || res.statusText);
      e.status = res.status;
      e.payload = errorPayload;
      throw e;
    }

    return maybeJson ?? text;
  } catch (err) {
    if (err?.name === 'AbortError') {
      logger.error('api_timeout', { url, method, timeoutMs: finalTimeout });
      const e = new Error('Request timeout');
      e.status = 0;
      throw e;
    }
    const e = serializeError(err);
    logger.error('api_error', { url, method, error: e });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const apiFetchFormData = async ({ url, method = 'POST', token, formData, timeoutMs }) => {
  const controller = new AbortController();
  const finalTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), finalTimeout);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/json',
      },
      body: formData,
      signal: controller.signal,
    });

    const text = await res.text();
    const maybeJson = text ? (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })() : null;

    if (!res.ok) {
      const errorPayload = maybeJson ?? { message: text || res.statusText };
      logger.error('api_failure', { url, method, status: res.status, error: errorPayload });
      const e = new Error(errorPayload?.message || res.statusText);
      e.status = res.status;
      e.payload = errorPayload;
      throw e;
    }

    return maybeJson ?? text;
  } catch (err) {
    if (err?.name === 'AbortError') {
      logger.error('api_timeout', { url, method, timeoutMs: finalTimeout });
      const e = new Error('Request timeout');
      e.status = 0;
      throw e;
    }
    const e = serializeError(err);
    logger.error('api_error', { url, method, error: e });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

