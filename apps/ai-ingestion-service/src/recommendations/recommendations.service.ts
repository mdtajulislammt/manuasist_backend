import { Injectable, NotFoundException } from '@nestjs/common';
import { MenuScanStatus } from '../../generated/prisma/enums';
import { ApplicationClientService } from '../clients/application-client.service';
import { PrismaService } from '../prisma.service';

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationClient: ApplicationClientService,
  ) {}

  async getScanRecommendations(userId: string, scanId: string) {
    await this.applicationClient.assertPremiumAccess(userId);
    const scan = await this.prisma.menuScan.findFirst({
      where: { id: scanId, userId },
      include: { dishes: true },
    });
    if (!scan) {
      throw new NotFoundException('Scan not found');
    }
    if (scan.status !== MenuScanStatus.COMPLETED) {
      return {
        success: true,
        message: 'Scan still processing',
        data: {
          scanId,
          status: scan.status,
          naiScore: scan.naiScore,
          summary: null,
          recommendations: [],
          cautions: [],
          avoid: [],
        },
      };
    }

    const sorted = [...scan.dishes].sort(
      (a, b) => (b.naiScore ?? b.dietScore) - (a.naiScore ?? a.dietScore),
    );
    const mapDish = (d: (typeof sorted)[0], rank: number) => ({
      dishId: d.id,
      rank,
      name: d.name,
      category: d.category,
      naiScore: d.naiScore ?? d.dietScore,
      dietScore: d.dietScore,
      calories: d.calories,
      reasons: (d.explanation as { reasons?: unknown[] } | null)?.reasons ?? [],
    });

    const recommendations = sorted
      .filter((d) => d.category === 'RECOMMENDED')
      .slice(0, 5)
      .map((d, i) => mapDish(d, i + 1));
    const cautions = sorted
      .filter((d) => d.category === 'CAUTION')
      .slice(0, 5)
      .map((d, i) => mapDish(d, i + 1));
    const avoid = sorted
      .filter((d) => d.category === 'AVOID')
      .slice(0, 5)
      .map((d, i) => mapDish(d, i + 1));

    const summary =
      scan.summary ??
      this.buildSummary(scan.naiScore, recommendations.length, avoid.length);

    return {
      success: true,
      message: 'Recommendations retrieved',
      data: {
        scanId,
        status: scan.status,
        naiScore: scan.naiScore,
        naiBreakdown: scan.naiBreakdown,
        summary,
        recommendations,
        cautions,
        avoid,
      },
    };
  }

  async getMyRecommendations(userId: string) {
    await this.applicationClient.assertPremiumAccess(userId);
    const recent = await this.prisma.menuScan.findMany({
      where: { userId, status: MenuScanStatus.COMPLETED },
      orderBy: { scanTime: 'desc' },
      take: 5,
      include: { dishes: true },
    });

    const topPicks = recent.flatMap((scan) =>
      scan.dishes
        .filter((d) => d.category === 'RECOMMENDED')
        .sort((a, b) => (b.naiScore ?? 0) - (a.naiScore ?? 0))
        .slice(0, 2)
        .map((d) => ({
          scanId: scan.id,
          dishId: d.id,
          name: d.name,
          naiScore: d.naiScore ?? d.dietScore,
          category: d.category,
        })),
    );

    const pattern = await this.prisma.userDietPattern.findUnique({
      where: { userId },
    });

    return {
      success: true,
      message: 'Personal recommendations retrieved',
      data: {
        recentScanCount: recent.length,
        avgNaiScore: pattern?.avgNaiScore ?? null,
        topCuisines: pattern?.topCuisines ?? [],
        topPicks: topPicks.slice(0, 10),
      },
    };
  }

  private buildSummary(
    naiScore: number | null,
    recommendedCount: number,
    avoidCount: number,
  ): string {
    if (naiScore == null) {
      return 'Menu analysis complete. Review dish details below.';
    }
    if (naiScore >= 75) {
      return `Strong menu fit (NAI ${naiScore}). ${recommendedCount} dishes align well with your profile.`;
    }
    if (naiScore >= 50) {
      return `Moderate menu fit (NAI ${naiScore}). ${recommendedCount} good options; check cautions.`;
    }
    return `Limited menu fit (NAI ${naiScore}). ${avoidCount} items may conflict with your goals.`;
  }
}
