import { BadGatewayException, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';

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
      AUTH_SERVICE_URL: 'http://127.0.0.1:2646',
      APPLICATION_SERVICE_URL: 'http://127.0.0.1:2647',
      ADMIN_SERVICE_URL: 'http://127.0.0.1:2648',
      AI_INGESTION_SERVICE_URL: 'http://127.0.0.1:2649',
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
    const init: RequestInit & { duplex?: 'half' } = {
      method,
      headers,
    };

    this.attachOutboundRequestBody(req, method, init, headers);

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

  /**
   * `express.json()` only fills `req.body` for JSON. Multipart and other raw
   * bodies must be streamed; otherwise upstream sees headers but no bytes
   * (multer: "Multipart: Unexpected end of form").
   *
   * Always stream when `Content-Type` is multipart: some clients/middleware
   * leave `req.body` as `{}` while the real payload is still on `req` — sending
   * `"{}"` would keep the multipart Content-Type and break busboy.
   */
  private attachOutboundRequestBody(
    req: any,
    method: string,
    init: RequestInit & { duplex?: 'half' },
    headers: Headers,
  ) {
    if (method === 'GET' || method === 'HEAD') {
      return;
    }

    const contentType = this.getIncomingContentType(req);
    if (contentType.includes('multipart/')) {
      if (!req.readableEnded) {
        init.body = Readable.toWeb(req) as BodyInit;
        init.duplex = 'half';
      }
      return;
    }

    if (
      typeof req.body === 'string' ||
      req.body instanceof Uint8Array ||
      Buffer.isBuffer(req.body)
    ) {
      init.body = req.body as BodyInit;
      return;
    }

    if (req.body !== undefined && req.body !== null) {
      init.body = JSON.stringify(req.body);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
      return;
    }

    if (!req.readableEnded) {
      init.body = Readable.toWeb(req) as BodyInit;
      init.duplex = 'half';
    }
  }

  private getIncomingContentType(req: any): string {
    const v = req.headers['content-type'];
    if (typeof v === 'string') {
      return v.toLowerCase();
    }
    if (Array.isArray(v) && typeof v[0] === 'string') {
      return v[0].toLowerCase();
    }
    return '';
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
