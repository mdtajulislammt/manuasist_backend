import { computeDishNai } from '../../../../libs/ai-pipeline/src/nai/compute-nai';
import {
  MEAL_PORTION_OPTIONS,
  MEAL_SLOT_OPTIONS,
  MealSlot,
  type MealLogEntrySummary,
  type MealNutrition,
  type MealNaiImpact,
} from '@contracts/meals';
import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { MealLogEntry } from '../../generated/prisma/client';
import { AiIngestionHomeClientService } from '../home/ai-ingestion-home-client.service';
import { MembershipService } from '../membership/membership.service';
import { PrismaService } from '../prisma.service';
import {
  AiIngestionDishesClientService,
  type IngestionDishPayload,
} from './ai-ingestion-dishes-client.service';
import { MealLogDto } from './dto/meal-log.dto';
import { MealPreviewDto } from './dto/meal-preview.dto';
import { MealNutritionOverrideDto } from './dto/meal-nutrition.dto';

type UserMealContext = {
  calorieTarget: number | null;
  weightGoal: string | null;
  allergies: string[];
};

@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly aiDishes: AiIngestionDishesClientService,
    private readonly aiHome: AiIngestionHomeClientService,
  ) { }

  async getPrefill(userId: string, dishId: string) {
    await this.membership.assertPremiumAccess(userId);
    const now = new Date();
    const defaultMealSlot = this.defaultMealSlot(now);
    const defaultPortionFactor = 1.0;

    const [dish, todayMeals, userContext, scanBaselineNai] = await Promise.all([
      this.aiDishes.getDishForMealPrefill(userId, dishId),
      this.getTodayMeals(userId),
      this.loadUserMealContext(userId),
      this.getScanBaselineNai(userId),
    ]);

    const defaultNutrition = this.scaleNutrition(
      dish.baseNutrition,
      defaultPortionFactor,
    );
    const currentDailyNai = this.computeDailyNai(todayMeals, scanBaselineNai);
    const naiScore = this.computeMealNai(dish, defaultNutrition, userContext);
    const naiImpact = this.computeNaiImpact(
      todayMeals,
      { calories: defaultNutrition.calories, naiScore },
      currentDailyNai,
    );

    return {
      success: true,
      message: 'Meal prefill retrieved',
      data: {
        dish: {
          dishId: dish.dishId,
          scanId: dish.scanId,
          name: dish.name,
          imageUrl: dish.imageUrl,
          tags: dish.tags,
          description: dish.description,
          category: dish.category,
          baseNaiScore: dish.baseNaiScore,
          scoreLabel: dish.scoreLabel ?? `${dish.baseNaiScore}% match`,
          caloriesLabel: `${defaultNutrition.calories} kcal`,
          isBookmarked: dish.isBookmarked,
        },
        baseNutrition: dish.baseNutrition,
        portionOptions: MEAL_PORTION_OPTIONS,
        mealSlotOptions: MEAL_SLOT_OPTIONS,
        defaultMealSlot,
        defaultPortionFactor,
        defaultNutrition,
        defaultLoggedAt: now.toISOString(),
        defaultNaiPreview: {
          naiScore,
          naiImpact,
        },
        portionCaloriesHint: `Approx. ${defaultNutrition.calories} calories for this portion.`,
        todayContext: {
          loggedMealCount: todayMeals.length,
          currentDailyCalories: this.sumCalories(todayMeals),
          currentDailyNai,
        },
      },
    };
  }

  async preview(userId: string, dto: MealPreviewDto) {
    await this.membership.assertPremiumAccess(userId);
    const computed = await this.computeMealState(userId, dto);

    return {
      success: true,
      message: 'Meal preview generated',
      data: {
        nutrition: computed.nutrition,
        naiScore: computed.naiScore,
        naiImpact: computed.naiImpact,
      },
    };
  }

  async logToday(userId: string, dto: MealLogDto) {
    await this.membership.assertPremiumAccess(userId);
    const computed = await this.computeMealState(userId, dto);
    const loggedAt = dto.loggedAt ? new Date(dto.loggedAt) : new Date();
    const mealDate = this.toMealDate(loggedAt);
    const isAdjusted = this.hasNutritionOverrides(dto.nutrition);

    const entry = await this.prisma.mealLogEntry.create({
      data: {
        userId,
        dishId: dto.dishId,
        scanId: computed.dish.scanId,
        mealDate,
        mealSlot: dto.mealSlot,
        portionFactor: dto.portionFactor,
        calories: computed.nutrition.calories,
        proteinG: computed.nutrition.proteinG,
        carbG: computed.nutrition.carbG,
        fatG: computed.nutrition.fatG,
        naiScore: computed.naiScore,
        isAdjusted,
        loggedAt,
      },
    });

    const todayMeals = await this.getTodayMeals(userId, mealDate);

    return {
      success: true,
      message: 'Meal logged for today',
      data: {
        entry: this.mapEntrySummary(entry),
        dailyTotals: {
          calories: this.sumCalories(todayMeals),
          dailyNai: this.computeDailyNai(todayMeals, null),
          mealCount: todayMeals.length,
        },
      },
    };
  }

  async getToday(userId: string) {
    await this.membership.assertPremiumAccess(userId);
    const mealDate = this.toMealDate(new Date());
    const meals = await this.getTodayMeals(userId, mealDate);
    const slots = Object.values(MealSlot);

    const bySlot = slots.reduce(
      (acc, slot) => {
        acc[slot] = {
          slot,
          items: meals
            .filter((meal) => meal.mealSlot === slot)
            .map((meal) => this.mapEntrySummary(meal)),
        };
        return acc;
      },
      {} as Record<
        MealSlot,
        { slot: MealSlot; items: MealLogEntrySummary[] }
      >,
    );

    return {
      success: true,
      message: "Today's meals retrieved",
      data: {
        date: mealDate.toISOString().slice(0, 10),
        totals: {
          calories: this.sumCalories(meals),
          dailyNai: this.computeDailyNai(meals, null),
          mealCount: meals.length,
        },
        bySlot,
      },
    };
  }

  async getTodayMealStats(userId: string) {
    const mealDate = this.toMealDate(new Date());
    return this.getMealStatsForDate(userId, mealDate);
  }

  async getYesterdayMealStats(userId: string) {
    const now = new Date();
    const yesterday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    return this.getMealStatsForDate(userId, yesterday);
  }

  async getMealsInRange(userId: string, from: Date, to: Date) {
    const fromDate = this.toMealDate(from);
    const toDate = this.toMealDate(to);
    return this.prisma.mealLogEntry.findMany({
      where: {
        userId,
        mealDate: {
          gte: fromDate,
          lt: toDate,
        },
      },
      orderBy: [{ mealDate: 'asc' }, { loggedAt: 'asc' }],
    });
  }

  private async getMealStatsForDate(userId: string, mealDate: Date) {
    const meals = await this.getTodayMeals(userId, mealDate);
    const scanBaselineNai = await this.getScanBaselineNai(userId);

    return {
      meals,
      calories: this.sumCalories(meals),
      dailyNai: this.computeDailyNai(meals, scanBaselineNai),
      mealCount: meals.length,
    };
  }

  private async computeMealState(userId: string, dto: MealPreviewDto) {
    const [dish, todayMeals, userContext] = await Promise.all([
      this.aiDishes.getDishForMealPrefill(userId, dto.dishId),
      this.getTodayMeals(userId),
      this.loadUserMealContext(userId),
    ]);

    const scaled = this.scaleNutrition(dish.baseNutrition, dto.portionFactor);
    const nutrition = this.applyNutritionOverrides(scaled, dto.nutrition);
    const naiScore = this.computeMealNai(dish, nutrition, userContext);
    const scanBaselineNai = await this.getScanBaselineNai(userId);
    const currentDailyNai = this.computeDailyNai(todayMeals, scanBaselineNai);
    const naiImpact = this.computeNaiImpact(
      todayMeals,
      { calories: nutrition.calories, naiScore },
      currentDailyNai,
    );

    return {
      dish,
      nutrition,
      naiScore,
      naiImpact,
    };
  }

  private async loadUserMealContext(userId: string): Promise<UserMealContext> {
    const [preferences, answers] = await Promise.all([
      this.prisma.preferences.findUnique({ where: { userId } }),
      this.prisma.userOnboardingAnswer.findMany({ where: { userId } }),
    ]);

    return {
      calorieTarget: preferences?.calorieTarget ?? null,
      weightGoal: preferences?.weightGoal ?? null,
      allergies: this.extractAllergies(answers),
    };
  }

  private async getScanBaselineNai(userId: string): Promise<number | null> {
    try {
      const summary = await this.aiHome.getHomeSummary(userId, 'daily');
      return summary.latestScore;
    } catch {
      return null;
    }
  }

  private async getTodayMeals(userId: string, mealDate = this.toMealDate(new Date())) {
    return this.prisma.mealLogEntry.findMany({
      where: { userId, mealDate },
      orderBy: { loggedAt: 'asc' },
    });
  }

  private scaleNutrition(
    base: MealNutrition,
    portionFactor: number,
  ): MealNutrition {
    return {
      calories: Math.round(base.calories * portionFactor),
      proteinG: this.scaleMacro(base.proteinG, portionFactor),
      carbG: this.scaleMacro(base.carbG, portionFactor),
      fatG: this.scaleMacro(base.fatG, portionFactor),
    };
  }

  private scaleMacro(value: number | null, factor: number): number | null {
    if (value === null) {
      return null;
    }
    return Math.round(value * factor * 10) / 10;
  }

  private applyNutritionOverrides(
    scaled: MealNutrition,
    overrides?: MealNutritionOverrideDto,
  ): MealNutrition {
    if (!overrides) {
      return scaled;
    }
    return {
      calories: overrides.calories ?? scaled.calories,
      proteinG: overrides.proteinG ?? scaled.proteinG,
      carbG: overrides.carbG ?? scaled.carbG,
      fatG: overrides.fatG ?? scaled.fatG,
    };
  }

  private hasNutritionOverrides(overrides?: MealNutritionOverrideDto): boolean {
    if (!overrides) {
      return false;
    }
    return (
      overrides.calories !== undefined ||
      overrides.proteinG !== undefined ||
      overrides.carbG !== undefined ||
      overrides.fatG !== undefined
    );
  }

  private computeMealNai(
    dish: IngestionDishPayload,
    nutrition: MealNutrition,
    context: UserMealContext,
  ): number {
    return computeDishNai({
      dietScore: dish.dietScore,
      nutritionConfidence: dish.nutritionConfidence,
      calories: nutrition.calories,
      calorieTarget: context.calorieTarget,
      weightGoal: context.weightGoal,
      category: dish.category as 'RECOMMENDED' | 'CAUTION' | 'AVOID',
      allergenFlags: dish.allergenFlags,
      allergies: context.allergies,
    }).naiScore;
  }

  private computeDailyNai(
    meals: Array<{ calories: number; naiScore: number }>,
    scanBaselineNai: number | null,
  ): number | null {
    if (meals.length === 0) {
      return scanBaselineNai;
    }
    const totalCalories = this.sumCalories(meals);
    if (totalCalories <= 0) {
      return scanBaselineNai;
    }
    const weighted = meals.reduce(
      (sum, meal) => sum + meal.naiScore * meal.calories,
      0,
    );
    return Math.round(weighted / totalCalories);
  }

  private computeNaiImpact(
    existingMeals: Array<{ calories: number; naiScore: number }>,
    previewMeal: { calories: number; naiScore: number },
    currentDailyNai: number | null,
  ): MealNaiImpact {
    const projectedDailyNai = this.computeDailyNai(
      [...existingMeals, previewMeal],
      currentDailyNai,
    );
    const deltaPoints =
      projectedDailyNai !== null && currentDailyNai !== null
        ? projectedDailyNai - currentDailyNai
        : previewMeal.naiScore;

    return {
      deltaPoints,
      projectedDailyNai,
      currentDailyNai,
      label: `${deltaPoints >= 0 ? '+' : ''}${deltaPoints} points`,
    };
  }

  private sumCalories(meals: Array<{ calories: number }>): number {
    return meals.reduce((sum, meal) => sum + meal.calories, 0);
  }

  private defaultMealSlot(now = new Date()): MealSlot {
    const hour = now.getHours();
    if (hour < 10) {
      return MealSlot.BREAKFAST;
    }
    if (hour < 15) {
      return MealSlot.LUNCH;
    }
    if (hour < 20) {
      return MealSlot.DINNER;
    }
    return MealSlot.SNACKS;
  }

  private toMealDate(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private mapEntrySummary(entry: MealLogEntry): MealLogEntrySummary {
    return {
      id: entry.id,
      dishId: entry.dishId,
      scanId: entry.scanId,
      mealSlot: entry.mealSlot as MealSlot,
      portionFactor: entry.portionFactor,
      nutrition: {
        calories: entry.calories,
        proteinG: entry.proteinG,
        carbG: entry.carbG,
        fatG: entry.fatG,
      },
      naiScore: entry.naiScore,
      isAdjusted: entry.isAdjusted,
      loggedAt: entry.loggedAt.toISOString(),
    };
  }

  private extractAllergies(
    answers: Array<{ value: unknown }>,
  ): string[] {
    const out = new Set<string>();
    for (const row of answers) {
      const v = row.value;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === 'string' && item.trim()) {
            out.add(item.trim());
          }
        }
        continue;
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        if (Array.isArray(o.allergies)) {
          for (const item of o.allergies) {
            if (typeof item === 'string' && item.trim()) {
              out.add(item.trim());
            }
          }
        }
      }
    }
    return [...out];
  }
}
