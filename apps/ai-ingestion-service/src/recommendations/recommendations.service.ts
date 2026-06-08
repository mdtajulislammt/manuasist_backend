import { HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DishCategory, MenuScanStatus } from '../../generated/prisma/enums';
import {
  buildDishDescription,
  buildDishTags,
  type DishPresentationSource,
} from '../dishes/dish-presentation.util';
import { ApplicationClientService } from '../clients/application-client.service';
import { PrismaService } from '../prisma.service';
import {
  GetScanRecommendationsQueryDto,
  RecommendationCategoryFilter,
  RecommendationSort,
} from './dto/get-scan-recommendations-query.dto';

type DishCardSource = DishPresentationSource;

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
      imageUrl: dish.imageUrl,
      category: dish.category,
      naiScore: score,
      scoreLabel: `${score}% match`,
      caloriesLabel: `${dish.calories} kcal`,
      tags: buildDishTags(dish),
      description: buildDishDescription(dish),
      isBookmarked: bookmarkedDishIds.has(dish.id),
    };
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
}
