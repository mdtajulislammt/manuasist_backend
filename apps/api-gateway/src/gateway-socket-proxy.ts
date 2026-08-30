import { Logger } from '@nestjs/common';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Socket as NetSocket } from 'node:net';
import type { Application, Request, Response, NextFunction } from 'express';
import httpProxy from 'http-proxy';

const logger = new Logger('GatewaySocketProxy');

const SOCKET_IO_PATH_PREFIX = '/socket.io';

export function resolveApplicationServiceUrl(): string {
  return process.env.APPLICATION_SERVICE_URL ?? 'http://127.0.0.1:4002';
}

function isSocketIoRequest(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return url === SOCKET_IO_PATH_PREFIX || url.startsWith(`${SOCKET_IO_PATH_PREFIX}/`) || url.startsWith(`${SOCKET_IO_PATH_PREFIX}?`);
}

/**
 * Single shared proxy for Socket.IO HTTP long-polling + WebSocket upgrade.
 * Must preserve `/socket.io` on the outbound path (do not mount under Express
 * path stripping), otherwise upstream handshake breaks under proxies.
 */
export function createSocketIoProxyBridge(): {
  mountHttp: (expressApp: Application) => void;
  attachUpgrade: (httpServer: HttpServer) => void;
} {
  const target = resolveApplicationServiceUrl();
  const proxy = httpProxy.createProxyServer({
    target,
    ws: true,
    changeOrigin: true,
    xfwd: true,
    // Long-lived Socket.IO connections; mobile networks can stall briefly.
    proxyTimeout: 0,
    timeout: 0,
  });

  proxy.on('error', (error, req, res) => {
    logger.error(
      `Socket.IO proxy error for ${req.url ?? 'unknown'}: ${error.message}`,
    );
    const maybeResponse = res as Response | NetSocket | undefined;
    if (
      maybeResponse &&
      'writeHead' in maybeResponse &&
      typeof maybeResponse.writeHead === 'function'
    ) {
      const response = maybeResponse as Response;
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'text/plain' });
        response.end('Bad Gateway');
      }
      return;
    }
    if (maybeResponse && 'destroy' in maybeResponse) {
      maybeResponse.destroy();
    }
  });

  proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
    socket.setKeepAlive(true, 15_000);
    socket.setNoDelay(true);
  });

  const mountHttp = (expressApp: Application) => {
    // Do not use `app.use('/socket.io', …)` — Express strips the mount path
    // from `req.url`, and http-proxy forwards the stripped URL upstream.
    expressApp.use((req: Request, res: Response, next: NextFunction) => {
      if (!isSocketIoRequest(req.originalUrl || req.url)) {
        next();
        return;
      }
      proxy.web(req, res, { target });
    });
    logger.log(`Socket.IO HTTP proxy: ${SOCKET_IO_PATH_PREFIX} -> ${target}`);
  };

  const attachUpgrade = (httpServer: HttpServer) => {
    httpServer.on(
      'upgrade',
      (req: IncomingMessage, socket: NetSocket, head: Buffer) => {
        if (!isSocketIoRequest(req.url)) {
          return;
        }
        socket.setKeepAlive(true, 15_000);
        socket.setNoDelay(true);
        proxy.ws(req, socket, head, { target });
      },
    );
    logger.log(
      `Socket.IO WebSocket proxy: ${SOCKET_IO_PATH_PREFIX} -> ${target}`,
    );
  };

  return { mountHttp, attachUpgrade };
}
