import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});

export const requestLogger = pinoHttp({
  logger,
  // pino-http's default req serializer logs req.headers verbatim, which
  // would otherwise put every request's `Authorization: Bearer <token>`
  // header straight into the logs at the default info level — redacted
  // explicitly here so a JWT never appears in a log line, even at debug
  // level. POST /api/auth/login's password lives in the request body, which
  // pino-http does not log at all by default, so no redact path is needed
  // for it — but if a body logger is ever added, the password field must be
  // redacted too.
  redact: ['req.headers.authorization'],
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
});
