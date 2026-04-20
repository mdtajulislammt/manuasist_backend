import { BadGatewayException, Injectable } from '@nestjs/common';

type UpstreamTarget =
  | 'AUTH_SERVICE_URL'
  | 'APPLICATION_SERVICE_URL'
  | 'ADMIN_SERVICE_URL'
  | 'AI_INGESTION_SERVICE_URL';

@Injectable()
export class GatewayProxyService {
  proxyTo(
    req: any,
    res: any,
    routePrefix: string,
    upstreamEnvKey: UpstreamTarget,
  ) {
    return this.forward(
      req,
      res,
      routePrefix,
      this.resolveUpstream(upstreamEnvKey),
    );
  }

  private resolveUpstream(envKey: UpstreamTarget): string {
    const defaults: Record<UpstreamTarget, string> = {
      AUTH_SERVICE_URL: 'http://127.0.0.1:5001',
      APPLICATION_SERVICE_URL: 'http://127.0.0.1:5002',
      ADMIN_SERVICE_URL: 'http://127.0.0.1:5003',
      AI_INGESTION_SERVICE_URL: 'http://127.0.0.1:5004',
    };
    return process.env[envKey] ?? defaults[envKey];
  }

  private async forward(
    req: any,
    res: any,
    routePrefix: string,
    upstreamBaseUrl: string,
  ) {
    const outboundUrl = this.buildOutboundUrl(
      req.originalUrl,
      routePrefix,
      upstreamBaseUrl,
    );
    const requestId =
      req.header?.('x-request-id') ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const headers = this.buildOutboundHeaders(req, requestId);

    const method = req.method.toUpperCase();
    const init: RequestInit = {
      method,
      headers,
    };

    if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined) {
      if (
        typeof req.body === 'string' ||
        req.body instanceof Uint8Array ||
        Buffer.isBuffer(req.body)
      ) {
        init.body = req.body as BodyInit;
      } else {
        init.body = JSON.stringify(req.body);
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json');
        }
      }
    }

    try {
      const upstreamResponse = await fetch(outboundUrl, init);
      this.applyResponseHeaders(res, upstreamResponse.headers, requestId);

      const payload = Buffer.from(await upstreamResponse.arrayBuffer());
      res.status(upstreamResponse.status).send(payload);
    } catch (error) {
      throw new BadGatewayException(
        `Gateway failed to reach upstream '${upstreamBaseUrl}': ${String(error)}`,
      );
    }
  }

  private buildOutboundUrl(
    originalUrl: string,
    routePrefix: string,
    upstreamBaseUrl: string,
  ): string {
    const normalizedPrefix = routePrefix.endsWith('/')
      ? routePrefix.slice(0, -1)
      : routePrefix;
    const remainder = originalUrl.startsWith(normalizedPrefix)
      ? originalUrl.slice(normalizedPrefix.length)
      : originalUrl;
    const normalizedRemainder = remainder.startsWith('/')
      ? remainder
      : `/${remainder}`;
    return `${upstreamBaseUrl.replace(/\/$/, '')}${normalizedRemainder === '/' ? '' : normalizedRemainder}`;
  }

  private buildOutboundHeaders(req: any, requestId: string): Headers {
    const blockedHeaders = new Set(['host', 'content-length', 'connection']);
    const headers = new Headers();

    for (const [name, value] of Object.entries(req.headers)) {
      const lowerName = name.toLowerCase();
      if (blockedHeaders.has(lowerName)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const each of value) {
          headers.append(name, each);
        }
      } else if (typeof value === 'string') {
        headers.set(name, value);
      }
    }

    headers.set('x-request-id', requestId);
    return headers;
  }

  private applyResponseHeaders(res: any, headers: Headers, requestId: string) {
    const blockedHeaders = new Set([
      'transfer-encoding',
      'content-length',
      'connection',
    ]);
    headers.forEach((value, name) => {
      if (!blockedHeaders.has(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });
    res.setHeader('x-request-id', requestId);
  }
}
