import { HttpException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { MealsService } from '../meals/meals.service';
import { DietaryPreferencesResolver } from '../users-me/dietary-preferences.resolver';
import {
  AiHomeSummaryPayload,
  AiIngestionHomeClientService,
} from './ai-ingestion-home-client.service';
import { GetHomeQueryDto } from './dto/get-home-query.dto';

type CalorieDataSource = 'meals' | 'scan_today' | 'scan_latest' | 'none';
type NaiScoreDataSource = 'meals' | 'scan' | 'none';

@Injectable()
export class HomeService {
  constructor(
    private readonly dietary: DietaryPreferencesResolver,
    private readonly aiHome: AiIngestionHomeClientService,
    private readonly meals: MealsService,
  ) {}

  async getHome(userId: string, query: GetHomeQueryDto = {}) {
    try {
      const trackingRange = query.trackingRange ?? 'weekly';
      const [dietary, aiSummary, mealStats, yesterdayMealStats] =
        await Promise.all([
          this.dietary.resolve(userId),
          this.aiHome.getHomeSummary(userId, trackingRange),
          this.meals.getTodayMealStats(userId),
          this.meals.getYesterdayMealStats(userId),
        ]);

      const calorieTarget = dietary.calorieTarget;
      const usesMealLogs = mealStats.mealCount > 0;
      const dailyCalories = usesMealLogs
        ? mealStats.calories
        : aiSummary.todayCalories > 0
          ? aiSummary.todayCalories
          : aiSummary.latestCalories;
      const calorieDataSource = this.resolveCalorieDataSource(
        usesMealLogs,
        aiSummary,
      );
      const todayNaiScore = usesMealLogs
        ? mealStats.dailyNai
        : aiSummary.latestScore;
      const naiScoreDataSource = this.resolveNaiScoreDataSource(
        usesMealLogs,
        aiSummary,
      );
      const dailyProgress = this.percent(dailyCalories, calorieTarget);
      const changeText = usesMealLogs
        ? this.mealChangeText(todayNaiScore, yesterdayMealStats)
        : aiSummary.scoreChangePercent === null
          ? null
          : `${aiSummary.scoreChangePercent >= 0 ? '+' : ''}${aiSummary.scoreChangePercent}% from last scan`;

      return {
        success: true,
        message: 'Home screen retrieved successfully',
        data: {
          calorieTarget,
          calorieTargetSource: dietary.calorieTargetSource,
          dataSource: {
            calories: calorieDataSource,
            naiScore: naiScoreDataSource,
          },
          todayNai: this.todayNai(
            aiSummary,
            dailyCalories,
            calorieTarget,
            todayNaiScore,
            usesMealLogs,
            changeText,
          ),
          naiTracking: {
            selectedRange: aiSummary.trackingRange,
            warning: aiSummary.warning,
            scoreLabel: this.scoreHeadline(todayNaiScore),
            points: aiSummary.chartPoints,
          },
          emptyTodayNai:
            usesMealLogs || aiSummary.hasCompletedScan
              ? null
              : {
                  dailyIntake: {
                    value: 0,
                    target: calorieTarget,
                    progressPercent: 0,
                  },
                },
          nutritionProgress: {
            totalCaloriesNeeded: calorieTarget,
            totalCaloriesConsumed: dailyCalories,
            progressPercent: dailyProgress,
          },
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to get home screen');
    }
  }

  private todayNai(
    summary: AiHomeSummaryPayload,
    dailyCalories: number,
    calorieTarget: number | null,
    score: number | null,
    usesMealLogs: boolean,
    changeText: string | null,
  ) {
    return {
      title: "Today's NAI Score",
      score,
      scoreLabel: score === null ? '- / 100' : `${score} / 100`,
      rating: this.scoreRating(score),
      subtitle: usesMealLogs
        ? "Based on today's logged meals"
        : summary.hasCompletedScan
          ? 'Based on your latest menu scan'
          : 'Scan your first menu',
      changeText,
      dailyIntake: {
        value: dailyCalories,
        target: calorieTarget,
        progressPercent: this.percent(dailyCalories, calorieTarget),
      },
    };
  }

  private resolveCalorieDataSource(
    usesMealLogs: boolean,
    summary: AiHomeSummaryPayload,
  ): CalorieDataSource {
    if (usesMealLogs) {
      return 'meals';
    }
    if (summary.todayCalories > 0) {
      return 'scan_today';
    }
    if (summary.latestCalories > 0) {
      return 'scan_latest';
    }
    return 'none';
  }

  private resolveNaiScoreDataSource(
    usesMealLogs: boolean,
    summary: AiHomeSummaryPayload,
  ): NaiScoreDataSource {
    if (usesMealLogs) {
      return 'meals';
    }
    if (summary.latestScore !== null) {
      return 'scan';
    }
    return 'none';
  }

  private mealChangeText(
    todayScore: number | null,
    yesterdayStats: { mealCount: number; dailyNai: number | null },
  ): string | null {
    if (yesterdayStats.mealCount === 0) {
      return null;
    }
    const yesterdayScore = yesterdayStats.dailyNai;
    if (todayScore === null || yesterdayScore === null || yesterdayScore === 0) {
      return null;
    }
    const pct = Math.round(
      ((todayScore - yesterdayScore) / yesterdayScore) * 100,
    );
    return `${pct >= 0 ? '+' : ''}${pct}% from yesterday`;
  }

  private percent(value: number, target: number | null): number {
    if (target === null || target <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
  }

  private scoreRating(score: number | null): string | null {
    if (score === null) {
      return null;
    }
    if (score >= 80) {
      return 'Excellent';
    }
    if (score >= 65) {
      return 'Good';
    }
    if (score >= 45) {
      return 'Fair';
    }
    return 'Needs attention';
  }

  private scoreHeadline(score: number | null): string {
    const rating = this.scoreRating(score);
    return score === null
      ? 'NAI Score unavailable'
      : `NAI Score: ${score} - ${rating}`;
  }
}
