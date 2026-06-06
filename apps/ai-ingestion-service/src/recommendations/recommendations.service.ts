import { HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DishCategory, MenuScanStatus } from '../../generated/prisma/enums';
import { ApplicationClientService } from '../clients/application-client.service';
import { PrismaService } from '../prisma.service';
import {
  GetScanRecommendationsQueryDto,
  RecommendationCategoryFilter,
  RecommendationSort,
} from './dto/get-scan-recommendations-query.dto';

type JsonRecord = Record<string, unknown>;
type DishCardSource = {
  id: string;
  name: string;
  calories: number;
  dietScore: number;
  naiScore: number | null;
  category: DishCategory;
  allergenFlags: unknown;
  explanation: unknown;
  macros: unknown;
};

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationClient: ApplicationClientService,
  ) { }

  async getScanRecommendations(
    userId: string,
    scanId: string,
    query: GetScanRecommendationsQueryDto = {},
  ) {
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
          items: [],
        },
      };
    }

    const categoryCounts = this.countDishCategories(scan.dishes);
    const bookmarkedDishIds = await this.getBookmarkedDishIds(
      userId,
      scan.dishes.map((dish) => dish.id),
    );
    const items = this.sortDishes(
      this.filterDishesByCategory(scan.dishes, query.category),
      query.sort,
    ).map((dish) => this.mapDishCard(dish, bookmarkedDishIds));

    const summary =
      scan.summary ??
      this.buildSummary(
        scan.naiScore,
        categoryCounts.recommended,
        categoryCounts.avoid,
      );

    return {
      success: true,
      message: 'Recommendations retrieved',
      data: {
        scanId,
        status: scan.status,
        naiScore: scan.naiScore,
        summary,
        items,
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
    const bookmarkedDishIds = await this.getBookmarkedDishIds(
      userId,
      recent.flatMap((scan) => scan.dishes.map((dish) => dish.id)),
    );

    const topPicks = recent.flatMap((scan) =>
      scan.dishes
        .filter((d) => d.category === DishCategory.RECOMMENDED)
        .sort((a, b) => (b.naiScore ?? 0) - (a.naiScore ?? 0))
        .slice(0, 2)
        .map((d) => ({
          scanId: scan.id,
          dishId: d.id,
          name: d.name,
          naiScore: d.naiScore ?? d.dietScore,
          category: d.category,
          isBookmarked: bookmarkedDishIds.has(d.id),
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

  async toggleDishBookmark(userId: string, dishId: string) {
    const dish = await this.prisma.dish.findFirst({
      where: {
        id: dishId,
        scan: { userId },
      },
      select: {
        id: true,
        scanId: true,
        name: true,
      },
    });
    if (!dish) {
      throw new NotFoundException('Dish not found');
    }

    const existing = await this.prisma.dishBookmark.findUnique({
      where: {
        userId_dishId: {
          userId,
          dishId,
        },
      },
    });

    if (existing) {
      await this.prisma.dishBookmark.delete({
        where: { id: existing.id },
      });
      return {
        success: true,
        message: 'Dish bookmark removed',
        data: {
          dishId,
          scanId: dish.scanId,
          name: dish.name,
          isBookmarked: false,
          bookmarkedAt: null,
        },
      };
    }

    const bookmark = await this.prisma.dishBookmark.create({
      data: {
        userId,
        dishId,
        scanId: dish.scanId,
      },
    });

    return {
      success: true,
      message: 'Dish bookmarked',
      data: {
        dishId,
        scanId: dish.scanId,
        name: dish.name,
        isBookmarked: true,
        bookmarkedAt: bookmark.createdAt,
      },
    };
  }

  async getBookmarks(userId: string) {
    try {
      await this.applicationClient.assertPremiumAccess(userId);
      const bookmarks = await this.prisma.dishBookmark.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { dish: true },
      });

      const bookmarkedDishIds = new Set(bookmarks.map((bookmark) => bookmark.dishId));
      const items = bookmarks.map((bookmark) =>
        this.mapDishCard(bookmark.dish, bookmarkedDishIds),
      );

      return {
        success: true,
        message: 'Bookmarks retrieved',
        data: { items },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get bookmarks');
    }
  }

  private filterDishesByCategory<T extends { category: DishCategory }>(
    dishes: T[],
    category?: RecommendationCategoryFilter,
  ): T[] {
    if (!category || category === RecommendationCategoryFilter.ALL) {
      return dishes;
    }
    return dishes.filter((dish) => dish.category === (category as DishCategory));
  }

  private sortDishes<
    T extends { calories: number; dietScore: number; naiScore: number | null },
  >(dishes: T[], sort?: RecommendationSort): T[] {
    const sorted = [...dishes];
    switch (sort) {
      case RecommendationSort.HEALTH_SCORE:
        return sorted.sort((a, b) => b.dietScore - a.dietScore);
      case RecommendationSort.CALORIES:
        return sorted.sort((a, b) => a.calories - b.calories);
      case RecommendationSort.BEST_MATCH:
      default:
        return sorted.sort(
          (a, b) => (b.naiScore ?? b.dietScore) - (a.naiScore ?? a.dietScore),
        );
    }
  }

  private async getBookmarkedDishIds(
    userId: string,
    dishIds: string[],
  ): Promise<Set<string>> {
    if (dishIds.length === 0) {
      return new Set();
    }

    const bookmarks = await this.prisma.dishBookmark.findMany({
      where: {
        userId,
        dishId: { in: dishIds },
      },
      select: { dishId: true },
    });
    return new Set(bookmarks.map((bookmark) => bookmark.dishId));
  }

  private mapDishCard(dish: DishCardSource, bookmarkedDishIds: Set<string>) {
    const score = dish.naiScore ?? dish.dietScore;
    return {
      dishId: dish.id,
      name: dish.name,
      imageUrl: null,
      category: dish.category,
      naiScore: score,
      scoreLabel: `${score}% match`,
      caloriesLabel: `${dish.calories} kcal`,
      tags: this.buildTags(dish),
      description: this.buildDescription(dish),
      isBookmarked: bookmarkedDishIds.has(dish.id),
    };
  }

  private buildTags(dish: DishCardSource): string[] {
    const tags: string[] = [];

    if (dish.category === DishCategory.RECOMMENDED) {
      this.pushUnique(tags, 'Best Match');
    } else if (dish.category === DishCategory.CAUTION) {
      this.pushUnique(tags, 'Review First');
    } else if (dish.category === DishCategory.AVOID) {
      this.pushUnique(tags, 'Avoid');
    }

    const macros = this.asRecord(dish.macros);
    const proteinG = this.numberValue(macros?.proteinG);
    const carbG = this.numberValue(macros?.carbG);
    const fatG = this.numberValue(macros?.fatG);

    if (proteinG !== null && proteinG >= 20) {
      this.pushUnique(tags, 'High Protein');
    } else if (proteinG !== null && proteinG >= 10) {
      this.pushUnique(tags, 'Protein Source');
    }
    if (carbG !== null && carbG <= 20) {
      this.pushUnique(tags, 'Low Carb');
    }
    if (fatG !== null && fatG <= 10) {
      this.pushUnique(tags, 'Low Fat');
    }
    if (dish.calories <= 450) {
      this.pushUnique(tags, 'Light Option');
    }

    const allergenFlags = this.asRecord(dish.allergenFlags);
    const hasAllergenAlert =
      allergenFlags &&
      Object.values(allergenFlags).some((value) => value === true);
    if (hasAllergenAlert) {
      this.pushUnique(tags, 'Allergen Alert');
    }

    return tags.slice(0, 3);
  }

  private buildDescription(dish: DishCardSource): string {
    const explanation = this.asRecord(dish.explanation);
    const summary = this.stringValue(explanation?.summary);
    if (summary) {
      return summary;
    }

    const reasons = this.stringArrayValue(explanation?.reasons);
    if (reasons.length > 0) {
      return reasons[0];
    }

    if (dish.category === DishCategory.RECOMMENDED) {
      return 'A strong match for your dietary profile.';
    }
    if (dish.category === DishCategory.CAUTION) {
      return 'Review this dish before ordering.';
    }
    return 'This dish may not align with your dietary profile.';
  }

  private countDishCategories(dishes: Array<{ category: DishCategory }>) {
    return {
      recommended: dishes.filter(
        (dish) => dish.category === DishCategory.RECOMMENDED,
      ).length,
      avoid: dishes.filter((dish) => dish.category === DishCategory.AVOID)
        .length,
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

  private asRecord(value: unknown): JsonRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as JsonRecord;
  }

  private numberValue(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private stringValue(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private stringArrayValue(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => this.stringValue(item))
      .filter((item): item is string => item !== null);
  }

  private pushUnique(values: string[], value: string) {
    if (!values.includes(value)) {
      values.push(value);
    }
  }
}
