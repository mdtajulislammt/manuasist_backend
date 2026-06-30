import { Injectable } from '@nestjs/common';
import { MembershipService } from '../membership/membership.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) { }

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

  assertCanCreateScan(userId: string) {
    return this.membership.assertCanCreateScan(userId);
  }

  consumeScanCredit(userId: string) {
    return this.membership.consumeScanCredit(userId);
  }

  assertPremiumAccess(userId: string) {
    return this.membership.assertPremiumAccess(userId);
  }

  async getUserProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    return {
      success: true,
      data: profile,
    };
  }

  async updateUserProfile(userId: string, body: any) {
    const create: { userId: string; fullName?: string; avatarUrl?: string; address?: string } = {
      userId,
    };
    const update: { fullName?: string; avatarUrl?: string; address?: string } = {};

    if (typeof body?.fullName === 'string' && body.fullName.trim()) {
      create.fullName = body.fullName.trim();
      update.fullName = body.fullName.trim();
    }
    if (typeof body?.avatarUrl === 'string' && body.avatarUrl.trim()) {
      create.avatarUrl = body.avatarUrl.trim();
      update.avatarUrl = body.avatarUrl.trim();
    }
    if (typeof body?.address === 'string' && body.address.trim()) {
      create.address = body.address.trim();
      update.address = body.address.trim();
    }

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create,
      update,
    });
    return {
      success: true,
      data: profile,
    };
  }

  async getProfilesByUserIds(userIds: string[]) {
    const profiles = await this.prisma.userProfile.findMany({
      where: {
        userId: { in: userIds },
      },
    });
    return {
      success: true,
      data: profiles,
    };
  }

  async searchUserProfiles(search: string) {
    const profiles = await this.prisma.userProfile.findMany({
      where: {
        fullName: {
          contains: search,
          mode: 'insensitive',
        },
      },
    });
    return {
      success: true,
      data: profiles,
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
