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

function hasJoseCode(
  error: unknown,
): error is { code: string; message?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

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

    let payload: unknown;
    try {
      const verified = await jwtVerify(token, this.getJwks(), {
        issuer: this.options.issuer,
        audience: this.options.audience,
      });
      payload = verified.payload;
    } catch (error) {
      if (hasJoseCode(error) && error.code === 'ERR_JWT_EXPIRED') {
        throw new UnauthorizedException('Token expired');
      }
      if (
        hasJoseCode(error) &&
        (error.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' ||
          error.code === 'ERR_JWT_INVALID')
      ) {
        throw new UnauthorizedException('Invalid bearer token');
      }
      throw new UnauthorizedException('Token verification failed');
    }

    req.user = payload as MenuAssistJwtPayload;
    return true;
  }
}
