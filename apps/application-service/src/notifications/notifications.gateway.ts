import { Inject, Logger, UnauthorizedException } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  API_AUTH_OPTIONS,
  type ApiAuthModuleOptions,
  type MenuAssistJwtPayload,
} from '@menu-assist/api-auth';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Namespace, Socket } from 'socket.io';

type NotificationSocketPayload = {
  id: string;
  type: string;
  title: string;
  body: string;
  icon: string;
  timeLabel: string;
  isRead: boolean;
  data: Record<string, unknown>;
};

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: true, credentials: true },
  // Allow polling fallback when websocket is blocked by a proxy/network.
  transports: ['websocket', 'polling'],
  // Mobile + reverse-proxy: give more room before declaring the client dead.
  pingInterval: 20_000,
  pingTimeout: 60_000,
  connectTimeout: 45_000,
  allowUpgrades: true,
  perMessageDeflate: false,
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  /** Namespaced gateway — Nest injects a Namespace, not the root Server. */
  @WebSocketServer()
  private server?: Namespace;

  private readonly logger = new Logger(NotificationsGateway.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    @Inject(API_AUTH_OPTIONS) private readonly authOptions: ApiAuthModuleOptions,
  ) { }

  async handleConnection(client: Socket) {
    try {
      const payload = await this.verifyClient(client);
      if (!payload.sub) {
        throw new UnauthorizedException('User id missing from token');
      }
      client.data.userId = payload.sub;
      await client.join(this.userRoom(payload.sub));
      this.logger.debug(
        `Notification socket connected for user ${payload.sub} id=${client.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Rejected notification socket: ${error instanceof Error ? error.message : String(error)
        }`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = typeof client.data.userId === 'string' ? client.data.userId : null;
    if (userId) {
      this.logger.debug(
        `Notification socket disconnected for user ${userId} reason=${client.disconnected ? 'client' : 'server'}`,
      );
    }
  }

  emitNotificationCreated(
    userId: string,
    payload: NotificationSocketPayload,
  ): boolean {
    const server = this.server;
    if (!server || !this.hasConnectedUser(userId)) {
      return false;
    }
    server.to(this.userRoom(userId)).emit('notification.created', payload);
    return true;
  }

  emitNotificationRead(userId: string, notificationId: string) {
    if (!this.server) {
      return;
    }
    this.server
      .to(this.userRoom(userId))
      .emit('notification.read', { id: notificationId });
  }

  emitNotificationsReadAll(userId: string) {
    if (!this.server) {
      return;
    }
    this.server.to(this.userRoom(userId)).emit('notifications.read_all');
  }

  private hasConnectedUser(userId: string): boolean {
    if (!this.server) {
      return false;
    }
    const room = this.server.adapter.rooms.get(this.userRoom(userId));
    return Boolean(room?.size);
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private getJwks() {
    if (!this.jwks) {
      this.jwks = createRemoteJWKSet(new URL(this.authOptions.jwksUri));
    }
    return this.jwks;
  }

  private async verifyClient(client: Socket): Promise<MenuAssistJwtPayload> {
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const verified = await jwtVerify(token, this.getJwks(), {
      issuer: this.authOptions.issuer,
      audience: this.authOptions.audience,
    });
    return verified.payload as MenuAssistJwtPayload;
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.startsWith('Bearer ')
        ? authToken.slice(7)
        : authToken.trim();
    }

    const raw = client.handshake.headers.authorization;
    const auth = Array.isArray(raw) ? raw[0] : raw;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    return null;
  }
}
