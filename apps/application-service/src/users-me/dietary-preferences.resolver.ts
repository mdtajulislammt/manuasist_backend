import { Injectable } from '@nestjs/common';
import { WeightGoal } from '../../generated/prisma/enums';
import {
  AdminActiveFlowPayload,
  AdminInternalClientService,
} from '../admin-internal/admin-internal-client.service';
import { PrismaService } from '../prisma.service';
import {
  computeCalorieTargetFromBiometrics,
  extractBiometricsFromOnboarding,
} from './compute-calorie-target.util';
import {
  mergePreferenceUpdates,
  projectPreferencesFromValue,
  type ProjectedPreferences,
} from './project-preferences.util';

export type CalorieTargetSource =
  | 'preferences'
  | 'onboarding_answer'
  | 'computed'
  | null;

export type ResolvedDietaryPreferences = {
  calorieTarget: number | null;
  calorieTargetSource: CalorieTargetSource;
  weightGoal: WeightGoal | null;
  dietType: string | null;
};

type ResolutionContext = {
  preferences: {
    calorieTarget: number | null;
    weightGoal: WeightGoal | null;
    dietType: string | null;
  } | null;
  fromAnswers: ProjectedPreferences;
  flowResult: AdminActiveFlowPayload | null;
  answers: Array<{ stepKey: string; value: unknown }>;
  weightGoal: WeightGoal | null;
  dietType: string | null;
};

@Injectable()
export class DietaryPreferencesResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminInternalClientService,
  ) {}

  async resolve(userId: string): Promise<ResolvedDietaryPreferences> {
    const ctx = await this.loadResolutionContext(userId);
    return this.resolveFromContext(ctx);
  }

  /** Recompute calorie target from onboarding biometrics and persist to preferences. */
  async syncComputedCalorieTargetToPreferences(
    userId: string,
  ): Promise<number | null> {
    const ctx = await this.loadResolutionContext(userId);
    const computed = this.computeCalorieTargetFromContext(ctx);
    if (computed === null) {
      return null;
    }

    await this.prisma.preferences.update({
      where: { userId },
      data: { calorieTarget: computed },
    });
    return computed;
  }

  private resolveFromContext(
    ctx: ResolutionContext,
  ): ResolvedDietaryPreferences {
    const { preferences, fromAnswers, weightGoal, dietType } = ctx;

    if (this.isPositiveCalorieTarget(preferences?.calorieTarget)) {
      return {
        calorieTarget: preferences.calorieTarget,
        calorieTargetSource: 'preferences',
        weightGoal,
        dietType,
      };
    }

    if (this.isPositiveCalorieTarget(fromAnswers.calorieTarget)) {
      return {
        calorieTarget: fromAnswers.calorieTarget,
        calorieTargetSource: 'onboarding_answer',
        weightGoal,
        dietType,
      };
    }

    const computed = this.computeCalorieTargetFromContext(ctx);
    if (computed !== null) {
      return {
        calorieTarget: computed,
        calorieTargetSource: 'computed',
        weightGoal,
        dietType,
      };
    }

    return {
      calorieTarget: null,
      calorieTargetSource: null,
      weightGoal,
      dietType,
    };
  }

  private computeCalorieTargetFromContext(
    ctx: ResolutionContext,
  ): number | null {
    if (!ctx.flowResult) {
      return null;
    }

    const biometrics = extractBiometricsFromOnboarding(
      ctx.flowResult,
      ctx.answers,
    );
    if (!biometrics) {
      return null;
    }

    return computeCalorieTargetFromBiometrics({
      ...biometrics,
      weightGoal: ctx.weightGoal,
    });
  }

  private async loadResolutionContext(
    userId: string,
  ): Promise<ResolutionContext> {
    const [preferences, answers, flowResult] = await Promise.all([
      this.prisma.preferences.findUnique({ where: { userId } }),
      this.prisma.userOnboardingAnswer.findMany({
        where: { userId },
        orderBy: { answeredAt: 'asc' },
      }),
      this.loadActiveFlow(),
    ]);

    const answerRows = answers.map((row) => ({
      stepKey: row.stepKey,
      value: row.value,
    }));
    const fromAnswers = this.mergeOnboardingPreferences(
      flowResult?.steps ?? [],
      answerRows,
    );

    const weightGoal = preferences?.weightGoal ?? fromAnswers.weightGoal ?? null;
    const dietType = preferences?.dietType ?? fromAnswers.dietType ?? null;

    return {
      preferences,
      fromAnswers,
      flowResult,
      answers: answerRows,
      weightGoal,
      dietType,
    };
  }

  private isPositiveCalorieTarget(
    value: number | null | undefined,
  ): value is number {
    return typeof value === 'number' && value > 0;
  }

  private mergeOnboardingPreferences(
    steps: AdminActiveFlowPayload['steps'],
    answers: Array<{ stepKey: string; value: unknown }>,
  ): ProjectedPreferences {
    const answerByStep = new Map(answers.map((row) => [row.stepKey, row.value]));
    const ordered = [...steps].sort((a, b) => a.orderIndex - b.orderIndex);
    const updates = ordered.map((step) =>
      projectPreferencesFromValue(answerByStep.get(step.id)),
    );
    return mergePreferenceUpdates(updates);
  }

  private async loadActiveFlow(): Promise<AdminActiveFlowPayload | null> {
    try {
      const wrapped = await this.admin.getActiveFlow();
      return wrapped.data;
    } catch {
      return null;
    }
  }
}
