import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminFileClientService } from '../clients/admin-file-client.service';
import { PrismaService } from '../prisma.service';
import {
  buildCaloriesLabel,
  buildDishDescription,
  buildDishTags,
  buildScoreLabel,
  extractAllergenFlags,
  extractDishMacros,
  resolveDishImageUrl,
} from './dish-presentation.util';

@Injectable()
export class DishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminFiles: AdminFileClientService,
  ) {}

  async getDishForMealPrefill(userId: string, dishId: string) {
    const dish = await this.prisma.dish.findFirst({
      where: {
        id: dishId,
        scan: { userId },
      },
      include: {
        scan: {
          select: {
            id: true,
            imageUrl: true,
            storedFileName: true,
          },
        },
      },
    });
    if (!dish) {
      throw new NotFoundException('Dish not found');
    }

    const bookmark = await this.prisma.dishBookmark.findUnique({
      where: {
        userId_dishId: {
          userId,
          dishId,
        },
      },
    });

    const macros = extractDishMacros(dish);
    const baseNaiScore = dish.naiScore ?? dish.dietScore;

    return {
      success: true,
      message: 'Dish retrieved',
      data: {
        dishId: dish.id,
        scanId: dish.scanId,
        name: dish.name,
        category: dish.category,
        tags: buildDishTags(dish),
        description: buildDishDescription(dish),
        imageUrl: resolveDishImageUrl({
          dishImageUrl: dish.imageUrl,
          scanImageUrl: dish.scan.imageUrl,
          scanStoredFileName: dish.scan.storedFileName,
          buildMenuScanPublicUrl: (storedName) =>
            this.adminFiles.buildPublicImageUrl(storedName),
        }),
        baseNutrition: {
          calories: dish.calories,
          proteinG: macros.proteinG,
          carbG: macros.carbG,
          fatG: macros.fatG,
        },
        baseNaiScore,
        scoreLabel: buildScoreLabel(baseNaiScore),
        caloriesLabel: buildCaloriesLabel(dish.calories),
        dietScore: dish.dietScore,
        allergenFlags: extractAllergenFlags(dish.allergenFlags),
        nutritionConfidence: dish.nutritionConfidence,
        isBookmarked: bookmark !== null,
      },
    };
  }
}
