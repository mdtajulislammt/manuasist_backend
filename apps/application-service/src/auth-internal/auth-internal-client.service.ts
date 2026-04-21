import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AuthInternalContactPayload = {
  userId: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
};

@Injectable()
export class AuthInternalClientService {
  constructor(private readonly config: ConfigService) {}

  async getUserContact(userId: string): Promise<AuthInternalContactPayload> {
    const base = this.config
      .getOrThrow<string>('AUTH_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('AUTH_INTERNAL_API_KEY');
    const url = `${base}/internal/auth/users/${userId}/contact`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'x-internal-api-key': key },
      });
    } catch (e) {
      throw new BadGatewayException(
        `Could not reach auth-service: ${String(e)}`,
      );
    }
    if (res.status === 401) {
      throw new UnauthorizedException('Invalid auth internal API key');
    }
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(
        `auth-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return res.json() as Promise<AuthInternalContactPayload>;
  }
}
