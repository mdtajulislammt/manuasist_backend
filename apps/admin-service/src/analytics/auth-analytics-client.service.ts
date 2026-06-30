import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthAnalyticsClientService {
  constructor(private readonly config: ConfigService) {}

  async getTotalUsers(): Promise<number> {
    const body = await this.fetchAuth<{ data?: { pagination?: { total?: number } } }>(
      '/internal/auth/users?page=1&limit=1',
    );
    return body.data?.pagination?.total ?? 0;
  }

  async getUsersByIds(userIds: string[]) {
    const body = await this.fetchAuth<{
      data?: {
        users?: Array<{
          id: string;
          email: string | null;
          phone: string | null;
          fullName: string | null;
          avatarUrl: string | null;
        }>;
      };
    }>('/internal/auth/users/batch', {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
    return body.data?.users ?? [];
  }

  private async fetchAuth<T>(path: string, init?: RequestInit): Promise<T> {
    const base = this.config
      .getOrThrow<string>('AUTH_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('AUTH_INTERNAL_API_KEY');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          'x-internal-api-key': key,
          'content-type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
    } catch (error) {
      throw new BadGatewayException(
        `Could not reach auth-service: ${String(error)}`,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(
        `auth-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return (await res.json()) as T;
  }
}
