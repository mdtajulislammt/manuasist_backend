import { HttpException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  AiHomeSummaryPayload,
  AiIngestionHomeClientService,
} from './ai-ingestion-home-client.service';
import { MealsService } from '../meals/meals.service';
import { GetHomeQueryDto } from './dto/get-home-query.dto';

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiHome: AiIngestionHomeClientService,
    private readonly meals: MealsService,
  ) { }

  async getHome(userId: string, query: GetHomeQueryDto = {}) {
    try {
      const trackingRange = query.trackingRange ?? 'weekly';
      const [profile, preferences, aiSummary, mealStats] = await Promise.all([
        this.prisma.userProfile.findUnique({ where: { userId } }),
        this.prisma.preferences.findUnique({ where: { userId } }),
        this.aiHome.getHomeSummary(userId, trackingRange),
        this.meals.getTodayMealStats(userId),
      ]);

      const displayName = this.displayName(profile?.fullName);
      const calorieTarget = preferences?.calorieTarget ?? 1050;
      const usesMealLogs = mealStats.mealCount > 0;
      const dailyCalories = usesMealLogs
        ? mealStats.calories
        : aiSummary.todayCalories > 0
          ? aiSummary.todayCalories
          : aiSummary.latestCalories;
      const dailyProgress = this.percent(dailyCalories, calorieTarget);
      const todayNaiScore = usesMealLogs
        ? mealStats.dailyNai
        : aiSummary.latestScore;

      return {
        success: true,
        message: 'Home screen retrieved successfully',
        data: {
          // header: {
          //   greeting: this.greeting(),
          //   title: `Hello ${displayName}`,
          //   avatarUrl: profile?.avatarUrl ?? null,
          //   notificationCount: 0,
          // },
          todayNai: this.todayNai(
            aiSummary,
            dailyCalories,
            calorieTarget,
            todayNaiScore,
            usesMealLogs,
          ),
          naiTracking: {
            selectedRange: aiSummary.trackingRange,
            warning: aiSummary.warning,
            scoreLabel: this.scoreHeadline(aiSummary.latestScore),
            points: aiSummary.chartPoints,
          },
          emptyTodayNai: aiSummary.hasCompletedScan
            ? null
            : {
              dailyIntake: {
                value: 0,
                target: calorieTarget,
                progressPercent: 0,
              },
            },
          nutritionProgress: {
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
    calorieTarget: number,
    score: number | null,
    usesMealLogs: boolean,
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
      changeText:
        summary.scoreChangePercent === null
          ? null
          : `${summary.scoreChangePercent >= 0 ? '+' : ''}${summary.scoreChangePercent}% from last scan`,
      dailyIntake: {
        value: dailyCalories,
        target: calorieTarget,
        progressPercent: this.percent(dailyCalories, calorieTarget),
      },
    };
  }

  private displayName(fullName: string | null | undefined): string {
    const clean = fullName?.trim();
    if (!clean) {
      return 'there';
    }
    return clean.split(/\s+/)[0] ?? clean;
  }

  private greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Good morning!';
    }
    if (hour < 18) {
      return 'Good afternoon!';
    }
    return 'Good evening!';
  }

  private percent(value: number, target: number): number {
    if (target <= 0) {
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
