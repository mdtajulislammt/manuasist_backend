import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export type DietaryContextPayload = {
  userId: string;
  preferences: {
    dietType: string | null;
    calorieTarget: number | null;
    spiceLevel: string | null;
    weightGoal: string | null;
  } | null;
  onboardingAnswers: Array<{
    stepKey: string;
    flowVersion: number;
    value: unknown;
  }>;
  allergies: string[];
};

@Injectable()
export class InternalUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getDietaryContext(userId: string) {
    const [preferences, answers] = await Promise.all([
      this.prisma.preferences.findUnique({ where: { userId } }),
      this.prisma.userOnboardingAnswer.findMany({
        where: { userId },
        orderBy: { answeredAt: 'asc' },
      }),
    ]);

    const allergies = this.extractAllergies(answers);

    const data: DietaryContextPayload = {
      userId,
      preferences: preferences
        ? {
            dietType: preferences.dietType,
            calorieTarget: preferences.calorieTarget,
            spiceLevel: preferences.spiceLevel,
            weightGoal: preferences.weightGoal,
          }
        : null,
      onboardingAnswers: answers.map((a) => ({
        stepKey: a.stepKey,
        flowVersion: a.flowVersion,
        value: a.value,
      })),
      allergies,
    };

    return {
      success: true,
      message: 'Dietary context retrieved',
      data,
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
        if (typeof o.defaultValues === 'object' && Array.isArray(o.defaultValues)) {
          for (const item of o.defaultValues) {
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
