import {
  BadGatewayException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type IngestionDishPayload = {
  dishId: string;
  scanId: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  imageUrl: string | null;
  baseNutrition: {
    calories: number;
    proteinG: number | null;
    carbG: number | null;
    fatG: number | null;
  };
  baseNaiScore: number;
  dietScore: number;
  allergenFlags?: Record<string, boolean>;
  nutritionConfidence: number | null;
  isBookmarked: boolean;
};

@Injectable()
export class AiIngestionDishesClientService {
  constructor(private readonly config: ConfigService) {}

  async getDishForMealPrefill(
    userId: string,
    dishId: string,
  ): Promise<IngestionDishPayload> {
    const base = this.config
      .getOrThrow<string>('AI_INGESTION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('INGESTION_INTERNAL_API_KEY');
    let res: Response;
    try {
      res = await fetch(
        `${base}/internal/dishes/${dishId}/users/${userId}`,
        {
          headers: { 'x-internal-api-key': key },
        },
      );
    } catch (error) {
      throw new BadGatewayException(
        `Could not reach ai-ingestion-service: ${String(error)}`,
      );
    }
    if (res.status === 404) {
      throw new NotFoundException('Dish not found');
    }
    if (!res.ok) {
      const text = await res.text();
      if (res.status >= 400 && res.status < 500) {
        throw new HttpException(this.parseErrorPayload(text, res.status), res.status);
      }
      throw new BadGatewayException(
        `ai-ingestion-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    const body = (await res.json()) as {
      data?: IngestionDishPayload;
    };
    if (!body.data) {
      throw new BadGatewayException(
        'ai-ingestion-service dish response missing data',
      );
    }
    return body.data;
  }

  private parseErrorPayload(text: string, status: number) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        message: text || 'ai-ingestion-service request failed',
        status,
      };
    }
  }
}
