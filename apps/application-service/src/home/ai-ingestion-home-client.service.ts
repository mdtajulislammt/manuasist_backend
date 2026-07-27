import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HomeTrackingRange } from './dto/get-home-query.dto';

export type AiHomeChartPoint = {
  label: string;
  date: string;
  score: number | null;
  hasScan: boolean;
};

export type AiHomeSummaryPayload = {
  trackingRange: HomeTrackingRange;
  hasCompletedScan: boolean;
  latestScanId: string | null;
  latestScore: number | null;
  previousScore: number | null;
  scoreChangePercent: number | null;
  todayCalories: number;
  todayScore: number | null;
  latestCalories: number;
  latestScannedAt: string | null;
  chartPoints: AiHomeChartPoint[];
  warning: string | null;
};

@Injectable()
export class AiIngestionHomeClientService {
  constructor(private readonly config: ConfigService) { }

  async getHomeSummary(
    userId: string,
    trackingRange: HomeTrackingRange,
  ): Promise<AiHomeSummaryPayload> {
    const base = this.config
      .getOrThrow<string>('AI_INGESTION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('INGESTION_INTERNAL_API_KEY');
    let res: Response;
    try {
      const params = new URLSearchParams({ trackingRange });
      res = await fetch(
        `${base}/internal/users/${userId}/home-summary?${params.toString()}`,
        {
          headers: { 'x-internal-api-key': key },
        },
      );
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
    const body = (await res.json()) as {
      data?: AiHomeSummaryPayload;
    };
    if (!body.data) {
      throw new BadGatewayException(
        'ai-ingestion-service home summary response missing data',
      );
    }
    return body.data;
  }
}
