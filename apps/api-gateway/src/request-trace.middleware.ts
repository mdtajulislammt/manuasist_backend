import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const logger = new Logger('RequestTrace');

const sensitiveQueryKeys = [
  'access_token',
  'api_key',
  'apikey',
  'authorization',
  'code',
  'key',
  'password',
  'refresh_token',
  'secret',
  'token',
];

export function createRequestTraceMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    const requestId = getOrCreateRequestId(req);

    res.setHeader('x-request-id', requestId);
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const trace = buildTrace(req, res, requestId, durationMs);
      writeTrace(trace);
    });

    next();
  };
}

function getOrCreateRequestId(req: Request): string {
  const existing = req.header('x-request-id');
  const requestId = existing?.trim() || randomUUID();
  req.headers['x-request-id'] = requestId;
  return requestId;
}

function buildTrace(
  req: Request,
  res: Response,
  requestId: string,
  durationMs: number,
) {
  const clientTimeZone = firstHeader(
    req,
    'x-client-timezone',
    'x-timezone',
    'timezone',
    'tz',
  );

  return {
    requestId,
    method: req.method,
    url: sanitizeUrl(req.originalUrl || req.url),
    status: res.statusCode,
    duration: `${durationMs.toFixed(1)} ms`,
    serverTime: formatDate(new Date()),
    clientTimeZone: clientTimeZone || 'Unknown',
    clientTime: clientTimeZone
      ? formatDate(new Date(), clientTimeZone)
      : 'Unknown',
    clientIp: getClientIp(req),
    location: getClientLocation(req),
    userAgent: req.header('user-agent') || 'Unknown',
    language: req.header('accept-language') || 'Unknown',
    referrer: req.header('referer') || req.header('referrer') || 'Unknown',
  };
}

function writeTrace(trace: ReturnType<typeof buildTrace>) {
  const lines = [
    '',
    'Request Trace',
    '-------------',
    `Request ID     : ${trace.requestId}`,
    `Request        : ${trace.method} ${trace.url}`,
    `Status         : ${trace.status}`,
    `Duration       : ${trace.duration}`,
    `Server Time    : ${trace.serverTime}`,
    `Client Timezone: ${trace.clientTimeZone}`,
    `Client Time    : ${trace.clientTime}`,
    `Client IP      : ${trace.clientIp}`,
    `Location       : ${trace.location}`,
    `Language       : ${trace.language}`,
    `User Agent     : ${trace.userAgent}`,
    `Referrer       : ${trace.referrer}`,
  ];

  const message = lines.join('\n');
  if (trace.status >= 500) {
    logger.error(message);
  } else if (trace.status >= 400) {
    logger.warn(message);
  } else {
    logger.log(message);
  }
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, 'http://menu-assist.local');
    for (const key of Array.from(url.searchParams.keys())) {
      if (sensitiveQueryKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return rawUrl;
  }
}

function getClientIp(req: Request): string {
  return (
    firstHeader(req, 'cf-connecting-ip', 'x-real-ip') ||
    firstForwardedFor(req) ||
    req.ip ||
    req.socket.remoteAddress ||
    'Unknown'
  );
}

function getClientLocation(req: Request): string {
  const city = decodeHeader(firstHeader(req, 'cf-ipcity', 'x-vercel-ip-city'));
  const region = decodeHeader(
    firstHeader(req, 'cf-region', 'x-vercel-ip-country-region'),
  );
  const country = decodeHeader(
    firstHeader(req, 'cf-ipcountry', 'x-vercel-ip-country', 'x-country'),
  );
  const parts = [city, region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Unknown';
}

function firstForwardedFor(req: Request): string | undefined {
  const forwarded = firstHeader(req, 'x-forwarded-for');
  return forwarded?.split(',')[0]?.trim();
}

function firstHeader(req: Request, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = req.headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      const first = value.find((item) => item.trim().length > 0);
      if (first) {
        return first;
      }
      continue;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function decodeHeader(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatDate(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      timeZone,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return `Invalid timezone (${timeZone})`;
  }
}
