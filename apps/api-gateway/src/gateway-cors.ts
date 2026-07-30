import { Logger } from '@nestjs/common';

const logger = new Logger('GatewayCors');

/** Always allowed, even if CORS_ORIGIN env omits them. */
export const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://10.10.9.82:3000',
  'http://10.10.9.82:3001',
  'http://10.10.9.82:3002',
  'https://menuassistanikstudio-phi.vercel.app',
] as const;

/**
 * Normalize a single origin: trim, strip wrapping quotes, drop trailing slash.
 * Browser `Origin` never includes a trailing slash.
 */
export function normalizeOrigin(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (value.endsWith('/') && value !== 'http://' && value !== 'https://') {
    value = value.replace(/\/+$/, '');
  }
  return value;
}

export function parseCorsOrigins(envValue?: string): string[] {
  const fromEnv = (envValue ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter((origin) => origin.length > 0);

  const merged = new Set<string>([
    ...DEFAULT_CORS_ORIGINS.map(normalizeOrigin),
    ...fromEnv,
  ]);

  const list = Array.from(merged);
  logger.log(`Allowed CORS origins (${list.length}): ${list.join(', ')}`);
  return list;
}

export function isOriginAllowed(
  origin: string | undefined,
  allowlist: string[],
): boolean {
  if (!origin) {
    return true;
  }
  const normalized = normalizeOrigin(origin);
  return allowlist.some((allowed) => allowed === normalized);
}

export function applyCorsHeaders(
  req: { headers?: Record<string, unknown>; header?: (name: string) => string | undefined },
  res: { setHeader: (name: string, value: string) => void },
  allowlist: string[],
): void {
  const rawOrigin =
    (typeof req.header === 'function' ? req.header('origin') : undefined) ??
    (typeof req.headers?.origin === 'string' ? req.headers.origin : undefined);

  if (!rawOrigin || !isOriginAllowed(rawOrigin, allowlist)) {
    return;
  }

  const origin = normalizeOrigin(rawOrigin);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, Origin, X-Requested-With, X-Request-Id',
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  );
  res.setHeader('Access-Control-Expose-Headers', 'x-request-id');
}
