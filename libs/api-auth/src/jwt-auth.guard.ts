import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { IS_PUBLIC_KEY } from './constants';
import type { MenuAssistJwtPayload } from './jwt-payload';
import { API_AUTH_OPTIONS, type ApiAuthModuleOptions } from './tokens';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(API_AUTH_OPTIONS) private readonly options: ApiAuthModuleOptions,
  ) {}

  private getJwks() {
    if (!this.jwks) {
      this.jwks = createRemoteJWKSet(new URL(this.options.jwksUri));
    }
    return this.jwks;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: MenuAssistJwtPayload;
    }>();
    const raw = req.headers['authorization'];
    const auth = Array.isArray(raw) ? raw[0] : raw;
    const token =
      typeof auth === 'string' && auth.startsWith('Bearer ')
        ? auth.slice(7)
        : null;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const { payload } = await jwtVerify(token, this.getJwks(), {
      issuer: this.options.issuer,
      audience: this.options.audience,
    });

    req.user = payload as MenuAssistJwtPayload;
    return true;
  }
}
