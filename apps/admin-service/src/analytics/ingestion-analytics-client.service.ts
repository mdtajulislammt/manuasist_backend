import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type IngestionDashboardPayload = {
  totalScans: number;
  topUsers: Array<{
    userId: string;
    scanCount: number;
    avgNaiScore: number | null;
  }>;
};

@Injectable()
export class IngestionAnalyticsClientService {
  constructor(private readonly config: ConfigService) {}

  async getDashboard(topUsersLimit = 10): Promise<IngestionDashboardPayload> {
    const params = new URLSearchParams({
      topUsersLimit: String(topUsersLimit),
    });
    const body = await this.fetchIngestion<{ data?: IngestionDashboardPayload }>(
      `/internal/analytics/dashboard?${params.toString()}`,
    );
    if (!body.data) {
      throw new BadGatewayException(
        'ai-ingestion-service dashboard response missing data',
      );
    }
    return body.data;
  }

  private async fetchIngestion<T>(path: string): Promise<T> {
    const base = this.config
      .getOrThrow<string>('AI_INGESTION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('INGESTION_INTERNAL_API_KEY');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        headers: { 'x-internal-api-key': key },
      });
    } catch (error) {
      throw new BadGatewayException(
        `Could not reach ai-ingestion-service: ${String(error)}`,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(
        `ai-ingestion-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return (await res.json()) as T;
  }
}
