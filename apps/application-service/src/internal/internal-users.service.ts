import { Injectable } from '@nestjs/common';
import {
  AdminInternalClientService,
  type AdminOnboardingStep,
} from '../admin-internal/admin-internal-client.service';
import { MembershipService } from '../membership/membership.service';
import { PrismaService } from '../prisma.service';
import { extractDietaryRestrictions } from '../users-me/extract-dietary-restrictions.util';

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
    private readonly admin: AdminInternalClientService,
  ) { }

  async getDietaryContext(userId: string) {
    const [preferences, answers, onboardingSteps] = await Promise.all([
      this.prisma.preferences.findUnique({ where: { userId } }),
      this.prisma.userOnboardingAnswer.findMany({
        where: { userId },
        orderBy: { answeredAt: 'asc' },
      }),
      this.loadActiveOnboardingSteps(),
    ]);

    const allergies = extractDietaryRestrictions(answers, onboardingSteps);

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


  private async loadActiveOnboardingSteps(): Promise<AdminOnboardingStep[]> {
    try {
      const flow = await this.admin.getActiveFlow();
      return flow.data.steps;
    } catch {
      // Explicit `{ allergies: [...] }` answers can still be extracted safely.
      // Never treat unknown array answers as allergies when metadata is absent.
      return [];
    }
  }
}
