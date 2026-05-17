import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserPreferenceHints } from '../../../../libs/ai-pipeline/src';

export type DietaryContextResponse = {
  success: boolean;
  data: {
    userId: string;
    preferences: {
      dietType: string | null;
      calorieTarget: number | null;
      spiceLevel: string | null;
      weightGoal: string | null;
    } | null;
    onboardingAnswers: Array<{ stepKey: string; flowVersion: number; value: unknown }>;
    allergies: string[];
  };
};

@Injectable()
export class ApplicationClientService {
  private readonly logger = new Logger(ApplicationClientService.name);

  constructor(private readonly config: ConfigService) {}

  async getUserPreferenceHints(userId: string): Promise<UserPreferenceHints> {
    try {
      const ctx = await this.fetchDietaryContext(userId);
      const p = ctx.data.preferences;
      return {
        dietType: p?.dietType ?? null,
        calorieTarget: p?.calorieTarget ?? null,
        spiceLevel: p?.spiceLevel ?? null,
        weightGoal: p?.weightGoal ?? null,
        allergies: ctx.data.allergies ?? [],
      };
    } catch (e) {
      this.logger.warn(
        `Could not load dietary context for ${userId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {};
    }
  }

  private async fetchDietaryContext(userId: string): Promise<DietaryContextResponse> {
    const base = this.config
      .getOrThrow<string>('APPLICATION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('APPLICATION_INTERNAL_API_KEY');
    const url = `${base}/internal/users/${userId}/dietary-context`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'x-internal-api-key': key },
      });
    } catch (e) {
      throw new BadGatewayException(
        `Could not reach application-service: ${String(e)}`,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(
        `application-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return res.json() as Promise<DietaryContextResponse>;
  }
}
