import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('APPLICATION_INTERNAL_API_KEY');
    if (!expected) {
      throw new UnauthorizedException(
        'APPLICATION_INTERNAL_API_KEY is not configured',
      );
    }
    const req = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const raw = req.headers['x-internal-api-key'];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (typeof header !== 'string' || header !== expected) {
      throw new UnauthorizedException('Invalid internal API key');
    }
    return true;
  }
}
