import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { NutritionFacts } from '../../../../libs/ai-pipeline/src';

@Injectable()
export class NutritionCacheService {
  constructor(private readonly prisma: PrismaService) {}

  static cacheKey(providerId: string, query: string): string {
    return createHash('sha256')
      .update(`${providerId}:${query.toLowerCase().trim()}`)
      .digest('hex');
  }

  async get(
    providerId: string,
    query: string,
  ): Promise<NutritionFacts | null> {
    const queryKey = NutritionCacheService.cacheKey(providerId, query);
    const row = await this.prisma.nutritionCache.findUnique({
      where: { queryKey },
    });
    if (!row || row.expiresAt < new Date()) {
      if (row) {
        await this.prisma.nutritionCache.delete({ where: { id: row.id } });
      }
      return null;
    }
    return row.payload as NutritionFacts;
  }

  async set(
    providerId: string,
    query: string,
    facts: NutritionFacts,
    ttlSeconds: number,
  ): Promise<void> {
    const queryKey = NutritionCacheService.cacheKey(providerId, query);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await this.prisma.nutritionCache.upsert({
      where: { queryKey },
      create: {
        queryKey,
        provider: providerId,
        payload: facts as object,
        expiresAt,
      },
      update: {
        payload: facts as object,
        expiresAt,
      },
    });
  }
}
