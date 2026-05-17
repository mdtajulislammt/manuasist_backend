import { Injectable } from '@nestjs/common';
import {
  detectCuisineTags,
  mergeCuisineCounts,
} from '../../../../libs/ai-pipeline/src';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

type CuisineRow = { tag: string; count: number };
type AllergenRow = { allergen: string; count: number };

@Injectable()
export class PatternsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPatternsForUser(userId: string) {
    const row = await this.prisma.userDietPattern.findUnique({
      where: { userId },
    });
    return {
      success: true,
      message: 'Diet patterns retrieved',
      data: row ?? {
        userId,
        scanCount: 0,
        topCuisines: [],
        avgNaiScore: null,
        frequentAllergens: [],
        lastScanAt: null,
      },
    };
  }

  async updateFromCompletedScan(input: {
    userId: string;
    dishNames: string[];
    dishNaiScores: number[];
    allergenFlagsList: Array<Record<string, boolean> | null | undefined>;
    scanNaiScore: number | null;
  }) {
    const existing = await this.prisma.userDietPattern.findUnique({
      where: { userId: input.userId },
    });
    const prevCuisines = (existing?.topCuisines as CuisineRow[] | null) ?? [];
    const newTags = detectCuisineTags(input.dishNames);
    const topCuisines = mergeCuisineCounts(prevCuisines, newTags);

    const allergenMap = new Map<string, number>();
    const prevAllergens = (existing?.frequentAllergens as AllergenRow[] | null) ?? [];
    for (const row of prevAllergens) {
      allergenMap.set(row.allergen, row.count);
    }
    for (const flags of input.allergenFlagsList) {
      if (!flags) continue;
      for (const [k, v] of Object.entries(flags)) {
        if (v) {
          allergenMap.set(k, (allergenMap.get(k) ?? 0) + 1);
        }
      }
    }
    const frequentAllergens = [...allergenMap.entries()]
      .map(([allergen, count]) => ({ allergen, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const prevAvg = existing?.avgNaiScore ?? null;
    const scanNai = input.scanNaiScore ?? 0;
    const scanCount = (existing?.scanCount ?? 0) + 1;
    const avgNaiScore =
      prevAvg == null
        ? scanNai
        : (prevAvg * (scanCount - 1) + scanNai) / scanCount;

    await this.prisma.userDietPattern.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        scanCount: 1,
        topCuisines: topCuisines as unknown as Prisma.InputJsonValue,
        avgNaiScore,
        frequentAllergens: frequentAllergens as unknown as Prisma.InputJsonValue,
        lastScanAt: new Date(),
      },
      update: {
        scanCount,
        topCuisines: topCuisines as unknown as Prisma.InputJsonValue,
        avgNaiScore,
        frequentAllergens: frequentAllergens as unknown as Prisma.InputJsonValue,
        lastScanAt: new Date(),
      },
    });
  }
}
