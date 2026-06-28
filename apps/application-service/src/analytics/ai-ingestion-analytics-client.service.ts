import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnalyticsScan } from './utils/daily-metrics.util';

export type IngestionBatchDish = {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  category: string;
};

@Injectable()
export class AiIngestionAnalyticsClientService {
  constructor(private readonly config: ConfigService) {}

  async getCompletedScans(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<AnalyticsScan[]> {
    const base = this.baseUrl();
    const key = this.apiKey();
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    let res: Response;
    try {
      res = await fetch(
        `${base}/internal/users/${userId}/completed-scans?${params.toString()}`,
        { headers: { 'x-internal-api-key': key } },
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
      data?: Array<{
        id: string;
        scanTime: string;
        naiScore: number | null;
        dishes: Array<{
          id: string;
          name: string;
          calories: number;
          proteinG: number;
          carbG: number;
          fatG: number;
          category: string;
        }>;
      }>;
    };
    return (body.data ?? []).map((scan) => ({
      id: scan.id,
      scanTime: new Date(scan.scanTime),
      naiScore: scan.naiScore,
      dishes: scan.dishes.map((dish) => ({
        id: dish.id,
        name: dish.name,
        calories: dish.calories,
        proteinG: dish.proteinG,
        carbG: dish.carbG,
        fatG: dish.fatG,
        category: dish.category,
      })),
    }));
  }

  async getDishesBatch(
    userId: string,
    dishIds: string[],
  ): Promise<IngestionBatchDish[]> {
    if (dishIds.length === 0) {
      return [];
    }
    const base = this.baseUrl();
    const key = this.apiKey();
    let res: Response;
    try {
      res = await fetch(`${base}/internal/dishes/batch`, {
        method: 'POST',
        headers: {
          'x-internal-api-key': key,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ userId, dishIds }),
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
    const body = (await res.json()) as { data?: IngestionBatchDish[] };
    return body.data ?? [];
  }

  private baseUrl(): string {
    return this.config
      .getOrThrow<string>('AI_INGESTION_SERVICE_URL')
      .replace(/\/$/, '');
  }

  private apiKey(): string {
    return this.config.getOrThrow<string>('INGESTION_INTERNAL_API_KEY');
  }
}
