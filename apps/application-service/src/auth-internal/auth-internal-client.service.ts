import {
  BadGatewayException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AuthInternalContactPayload = {
  userId: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
};

export type ContactChangeKind = 'email' | 'phone';

export type ContactChangeRequestPayload = {
  success: boolean;
  message: string;
  status: 'OTP_SENT';
  kind: ContactChangeKind;
  channel: 'email' | 'sms';
  identifier: string;
  expires_in_seconds: number;
  otp?: string;
};

export type ContactChangeVerifyPayload = {
  success: boolean;
  message: string;
  status: 'CONTACT_CHANGE_VERIFIED';
  kind: ContactChangeKind;
  identifier: string;
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
    if (!res.ok) {
      const text = await res.text();
      if (res.status >= 400 && res.status < 500) {
        throw new HttpException(
          this.parseErrorPayload(text, res.status),
          res.status,
        );
      }
      throw new BadGatewayException(
        `auth-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return res.json() as Promise<AuthInternalContactPayload>;
  }

  async requestContactChange(
    userId: string,
    input: { kind: ContactChangeKind; identifier: string },
  ): Promise<ContactChangeRequestPayload> {
    return this.postInternal<ContactChangeRequestPayload>(
      `/internal/auth/users/${userId}/contact-change/request`,
      input,
    );
  }

  async verifyContactChange(
    userId: string,
    input: { kind: ContactChangeKind; identifier: string; otp: string },
  ): Promise<ContactChangeVerifyPayload> {
    return this.postInternal<ContactChangeVerifyPayload>(
      `/internal/auth/users/${userId}/contact-change/verify`,
      input,
    );
  }

  private async postInternal<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const base = this.config
      .getOrThrow<string>('AUTH_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('AUTH_INTERNAL_API_KEY');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-api-key': key,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new BadGatewayException(
        `Could not reach auth-service: ${String(e)}`,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      if (res.status >= 400 && res.status < 500) {
        throw new HttpException(
          this.parseErrorPayload(text, res.status),
          res.status,
        );
      }
      throw new BadGatewayException(
        `auth-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return res.json() as Promise<T>;
  }

  private parseErrorPayload(text: string, status: number) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        message: text || 'auth-service request failed',
        status,
      };
    }
  }
}
