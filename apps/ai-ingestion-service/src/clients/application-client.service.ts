import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
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
    intolerances: string[];
    cuisinePreferences: string[];
    healthObjectives: string[];
    nutritionTargets: Record<string, string | number | boolean>;
  };
};

type ScanNotificationType = 'processing' | 'ready' | 'failed';

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
        intolerances: ctx.data.intolerances ?? [],
        cuisinePreferences: ctx.data.cuisinePreferences ?? [],
        healthObjectives: ctx.data.healthObjectives ?? [],
        nutritionTargets: ctx.data.nutritionTargets ?? {},
      };
    } catch (e) {
      this.logger.warn(
        `Could not load dietary context for ${userId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {};
    }
  }

  async assertCanCreateScan(userId: string) {
    return this.getInternal(`/internal/users/${userId}/scan-access`);
  }

  async consumeScanCredit(userId: string) {
    return this.postInternal(`/internal/users/${userId}/scan-credit/consume`);
  }

  async assertPremiumAccess(userId: string) {
    return this.getInternal(`/internal/users/${userId}/premium-access`);
  }

  async notifyScanProcessing(userId: string, scanId: string) {
    await this.notifyScanEventBestEffort('processing', userId, scanId);
  }

  async notifyScanReady(userId: string, scanId: string) {
    await this.notifyScanEventBestEffort('ready', userId, scanId);
  }

  async notifyScanFailed(userId: string, scanId: string, error: string) {
    await this.notifyScanEventBestEffort('failed', userId, scanId, error);
  }

  private async fetchDietaryContext(userId: string): Promise<DietaryContextResponse> {
    return this.getInternal<DietaryContextResponse>(
      `/internal/users/${userId}/dietary-context`,
    );
  }

  private async getInternal<T = unknown>(path: string): Promise<T> {
    const base = this.config
      .getOrThrow<string>('APPLICATION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('APPLICATION_INTERNAL_API_KEY');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        headers: { 'x-internal-api-key': key },
      });
    } catch (e) {
      throw new BadGatewayException(
        `Could not reach application-service: ${String(e)}`,
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
        `application-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return res.json() as Promise<T>;
  }

  private async postInternal<T = unknown>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const base = this.config
      .getOrThrow<string>('APPLICATION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('APPLICATION_INTERNAL_API_KEY');
    const headers: Record<string, string> = { 'x-internal-api-key': key };
    if (body) {
      headers['content-type'] = 'application/json';
    }
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new BadGatewayException(
        `Could not reach application-service: ${String(e)}`,
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
        `application-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return res.json() as Promise<T>;
  }

  private async notifyScanEventBestEffort(
    type: ScanNotificationType,
    userId: string,
    scanId: string,
    error?: string,
  ) {
    try {
      await this.postInternal('/internal/notifications/scan-event', {
        type,
        userId,
        scanId,
        ...(error ? { error } : {}),
      });
    } catch (e) {
      this.logger.warn(
        `Could not create ${type} notification for scan ${scanId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  private parseErrorPayload(text: string, status: number) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        message: text || 'application-service request failed',
        status,
      };
    }
  }
}
