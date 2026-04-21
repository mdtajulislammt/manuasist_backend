import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AdminOnboardingStep = {
  id: string;
  flowId: string;
  orderIndex: number;
  type: string;
  title: string;
  subtitle: string | null;
  uiConfig: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminActiveFlowPayload = {
  id: string;
  name: string;
  status: string;
  version: number;
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: AdminOnboardingStep[];
};

@Injectable()
export class AdminInternalClientService {
  constructor(private readonly config: ConfigService) { }

  async getActiveFlow(): Promise<{ success: boolean, message: string, data: AdminActiveFlowPayload }> {
    const base = this.config
      .getOrThrow<string>('ADMIN_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('ADMIN_INTERNAL_API_KEY');
    const url = `${base}/internal/onboarding/active-flow`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'x-internal-api-key': key },
      });
    } catch (e) {
      throw new BadGatewayException(
        `Could not reach admin-service: ${String(e)}`,
      );
    }

    if (res.status === 404) {
      throw new NotFoundException('No active onboarding flow is configured');
    }
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(
        `admin-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    const body = (await res.json()) as {
      success?: boolean;
      message?: string;
      data?: AdminActiveFlowPayload;
    };
    if (!body.data || typeof body.data.version !== 'number') {
      throw new BadGatewayException(
        'admin-service active-flow response missing data.version',
      );
    }
    const { data } = body;
    return {
      success: true,
      message: 'Active flow retrieved successfully',
      data: {
        ...data,
        steps: Array.isArray(data.steps) ? data.steps : [],
      } as AdminActiveFlowPayload
    }
  }
}
