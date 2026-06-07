import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  buildDishDescription,
  buildDishTags,
  extractAllergenFlags,
  extractDishMacros,
} from './dish-presentation.util';

@Injectable()
export class DishesService {
  constructor(private readonly prisma: PrismaService) {}

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
        imageUrl: dish.scan.imageUrl ?? null,
        baseNutrition: {
          calories: dish.calories,
          proteinG: macros.proteinG,
          carbG: macros.carbG,
          fatG: macros.fatG,
        },
        baseNaiScore,
        dietScore: dish.dietScore,
        allergenFlags: extractAllergenFlags(dish.allergenFlags),
        nutritionConfidence: dish.nutritionConfidence,
        isBookmarked: bookmark !== null,
      },
    };
  }
}
