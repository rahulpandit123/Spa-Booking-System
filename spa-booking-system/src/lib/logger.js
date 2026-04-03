const createLogger = () => {
  const push = (level, event, meta) => {
    const payload = {
      ts: new Date().toISOString(),
      level,
      event,
      ...(meta ? meta : {}),
    };
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](payload);
    return payload;
  };

  return {
    info: (event, meta) => push('info', event, meta),
    warn: (event, meta) => push('warn', event, meta),
    error: (event, meta) => push('error', event, meta),
    user: (event, meta) => push('user', event, meta),
  };
};

const logger = createLogger();
export default logger;

