import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { SpiceLevel, WeightGoal } from '../../generated/prisma/enums';
import {
  ProfileAvatarStorageService,
  type ProfileAvatarUpload,
} from './profile-avatar-storage.service';
import type { AdminActiveFlowPayload } from '../admin-internal/admin-internal-client.service';
import { AdminInternalClientService } from '../admin-internal/admin-internal-client.service';
import { AuthInternalClientService } from '../auth-internal/auth-internal-client.service';
import { PrismaService } from '../prisma.service';
import { PatchPreferencesDto } from './dto/patch-preferences.dto';
import { PatchProfileDto } from './dto/patch-profile.dto';
import { PutOnboardingAnswersDto } from './dto/put-onboarding-answers.dto';

function isSpiceLevel(v: string): v is SpiceLevel {
  return (Object.values(SpiceLevel) as string[]).includes(v);
}

function isWeightGoal(v: string): v is WeightGoal {
  return (Object.values(WeightGoal) as string[]).includes(v);
}

function projectPreferencesFromValue(
  value: unknown,
): Prisma.PreferencesUpdateInput {
  const data: Prisma.PreferencesUpdateInput = {};
  if (value === null || value === undefined) {
    return data;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return data;
  }
  const o = value as Record<string, unknown>;
  if (typeof o.dietType === 'string') {
    data.dietType = o.dietType;
  }
  if (typeof o.calorieTarget === 'number' && Number.isInteger(o.calorieTarget)) {
    data.calorieTarget = o.calorieTarget;
  }
  if (typeof o.spiceLevel === 'string' && isSpiceLevel(o.spiceLevel)) {
    data.spiceLevel = o.spiceLevel;
  }
  if (typeof o.weightGoal === 'string' && isWeightGoal(o.weightGoal)) {
    data.weightGoal = o.weightGoal;
  }
  return data;
}

function mergePreferenceUpdates(
  updates: Prisma.PreferencesUpdateInput[],
): Prisma.PreferencesUpdateInput {
  return updates.reduce((acc, u) => ({ ...acc, ...u }), {});
}

@Injectable()
export class UsersMeService {
  private readonly logger = new Logger(UsersMeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: ProfileAvatarStorageService,
    private readonly admin: AdminInternalClientService,
    private readonly authInternal: AuthInternalClientService,
  ) { }

  async getProfile(userId: string) {
    try {
      await this.ensureUserRows(userId);
      const profile = await this.prisma.userProfile.findUniqueOrThrow({
        where: { userId },
      });
      return {
        success: true,
        message: 'Profile retrieved successfully',
        data: await this.withContact(profile),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get profile');
    }
  }

  async patchProfile(
    userId: string,
    dto: PatchProfileDto,
    avatar?: ProfileAvatarUpload,
  ) {
    try {
      await this.ensureUserRows(userId);
      const data: Prisma.UserProfileUpdateInput = {};
      if (dto.fullName !== undefined) {
        data.fullName = dto.fullName;
      }
      if (avatar) {
        const stored = await this.avatars.storeAvatar(avatar);
        data.avatarFileId = stored.avatarFileId;
        data.avatarUrl = stored.avatarUrl;
      }

      const updatedProfile =
        Object.keys(data).length > 0
          ? await this.prisma.userProfile.update({
              where: { userId },
              data,
            })
          : await this.prisma.userProfile.findUniqueOrThrow({
              where: { userId },
            });

      const pendingVerification: Record<string, unknown> = {};
      if (dto.email) {
        if (dto.emailOtp) {
          await this.authInternal.verifyContactChange(userId, {
            kind: 'email',
            identifier: dto.email,
            otp: dto.emailOtp,
          });
        } else {
          pendingVerification.email =
            await this.authInternal.requestContactChange(userId, {
              kind: 'email',
              identifier: dto.email,
            });
        }
      }
      if (dto.phone) {
        if (dto.phoneOtp) {
          await this.authInternal.verifyContactChange(userId, {
            kind: 'phone',
            identifier: dto.phone,
            otp: dto.phoneOtp,
          });
        } else {
          pendingVerification.phone =
            await this.authInternal.requestContactChange(userId, {
              kind: 'phone',
              identifier: dto.phone,
            });
        }
      }

      const profile = await this.withContact(updatedProfile);
      return {
        success: true,
        message:
          Object.keys(pendingVerification).length > 0
            ? 'Profile updated. Contact verification required.'
            : 'Profile updated successfully',
        data: {
          ...profile,
          ...(Object.keys(pendingVerification).length > 0
            ? { pendingVerification }
            : {}),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update profile');
    }
  }

  async getPreferences(userId: string) {
    try {
      await this.ensureUserRows(userId);
      const preferences = await this.prisma.preferences.findUniqueOrThrow({
        where: { userId },
      });
      return {
        success: true,
        message: 'Preferences retrieved successfully',
        data: preferences,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get preferences');
    }
  }

  async getOnboardingProgress(userId: string) {
    try {
      await this.ensureUserRows(userId);
      const wrapped = await this.admin.getActiveFlow();
      const flow = wrapped.data;
      const flowVersion = flow.version;
      const steps = [...(flow.steps ?? [])].sort(
        (a, b) => a.orderIndex - b.orderIndex,
      );

      const answers = await this.prisma.userOnboardingAnswer.findMany({
        where: { userId, flowVersion },
      });
      const answered = new Set(answers.map((a) => a.stepKey));

      const totalSteps = steps.length;
      const answeredSteps = steps.filter((s) => answered.has(s.id)).length;

      const requiredSteps = steps.filter((s) =>
        this.isStepRequired(s.uiConfig),
      );
      const requiredTotal = requiredSteps.length;
      const answeredRequiredSteps = requiredSteps.filter((s) =>
        answered.has(s.id),
      ).length;

      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
      });

      const personalizationPercent =
        totalSteps === 0
          ? 100
          : Math.min(100, Math.round((answeredSteps / totalSteps) * 100));

      const completedStepIds = steps
        .filter((s) => answered.has(s.id))
        .map((s) => s.id);
      const pendingStepIds = steps
        .filter((s) => !answered.has(s.id))
        .map((s) => s.id);

      const next = steps.find((s) => !answered.has(s.id));

      const onboardingCompleted = !!profile?.onboardingCompletedAt;
      const canResume = !onboardingCompleted && next !== undefined;

      return {
        success: true,
        message: 'Onboarding progress retrieved successfully',
        data: {
          flowVersion,
          flowId: flow.id,
          flowName: flow.name,
          totalSteps,
          answeredSteps,
          requiredTotal,
          answeredRequiredSteps,
          personalizationPercent,
          completedStepIds,
          pendingStepIds,
          nextStep: next
            ? {
                id: next.id,
                orderIndex: next.orderIndex,
                type: next.type,
                title: next.title,
                subtitle: next.subtitle,
                uiConfig: next.uiConfig,
              }
            : null,
          onboardingCompleted,
          onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
          canResume,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to get onboarding progress',
      );
    }
  }

  async patchPreferences(userId: string, dto: PatchPreferencesDto) {
    try {
      await this.ensureUserRows(userId);
      const data: Prisma.PreferencesUpdateInput = {};
      if (dto.dietType !== undefined) {
        data.dietType = dto.dietType;
      }
      if (dto.calorieTarget !== undefined) {
        data.calorieTarget = dto.calorieTarget;
      }
      if (dto.spiceLevel !== undefined) {
        data.spiceLevel = dto.spiceLevel;
      }
      if (dto.weightGoal !== undefined) {
        data.weightGoal = dto.weightGoal;
      }
      const updatedPreferences = await this.prisma.preferences.update({
        where: { userId },
        data,
      });
      return {
        success: true,
        message: 'Preferences updated successfully',
        data: updatedPreferences,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update preferences');
    }
  }

  async putOnboardingAnswers(userId: string, dto: PutOnboardingAnswersDto) {
    try {
      const flow = await this.admin.getActiveFlow();
      if (flow.data.version !== dto.flowVersion) {
        throw new BadRequestException(
          `flowVersion ${dto.flowVersion} does not match active flow (${flow.data.version})`,
        );
      }
      const stepIds = new Set(flow.data.steps.map((s) => s.id));
      for (const a of dto.answers) {
        if (!stepIds.has(a.stepKey)) {
          throw new BadRequestException(`Unknown step: ${a.stepKey}`);
        }
      }

      const prefUpdates = dto.answers.map((a) =>
        projectPreferencesFromValue(a.value),
      );
      const prefMerged = mergePreferenceUpdates(prefUpdates);

      await this.prisma.$transaction(async (tx) => {
        await this.ensureUserRowsTx(userId, tx);
        for (const a of dto.answers) {
          await tx.userOnboardingAnswer.upsert({
            where: {
              userId_stepKey: { userId, stepKey: a.stepKey },
            },
            create: {
              userId,
              stepKey: a.stepKey,
              flowVersion: dto.flowVersion,
              value: a.value as Prisma.InputJsonValue,
            },
            update: {
              flowVersion: dto.flowVersion,
              value: a.value as Prisma.InputJsonValue,
              answeredAt: new Date(),
            },
          });
        }
        if (Object.keys(prefMerged).length > 0) {
          await tx.preferences.update({
            where: { userId },
            data: prefMerged,
          });
        }
        await this.maybeCompleteOnboarding(userId, flow.data, dto.flowVersion, tx);
      });

      return { success: true, message: 'Onboarding answers updated successfully' };
    } catch (error) {

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update onboarding answers');
    }
  }

  private isStepRequired(uiConfig: unknown): boolean {
    if (uiConfig === null || uiConfig === undefined) {
      return true;
    }
    if (typeof uiConfig !== 'object' || Array.isArray(uiConfig)) {
      return true;
    }
    const r = (uiConfig as { required?: boolean }).required;
    return r !== false;
  }

  private async maybeCompleteOnboarding(
    userId: string,
    flow: AdminActiveFlowPayload,
    flowVersion: number,
    tx: Prisma.TransactionClient,
  ) {
    const requiredSteps = flow.steps.filter((s) =>
      this.isStepRequired(s.uiConfig),
    );
    const answers = await tx.userOnboardingAnswer.findMany({
      where: { userId, flowVersion },
    });
    const answered = new Set(answers.map((a) => a.stepKey));
    const allDone =
      requiredSteps.length === 0 ||
      requiredSteps.every((s) => answered.has(s.id));
    if (allDone) {
      await tx.userProfile.updateMany({
        where: { userId },
        data: { onboardingCompletedAt: new Date() },
      });
    }
  }

  private async ensureUserRows(userId: string) {
    await this.ensureUserRowsTx(userId, this.prisma);
  }

  private async getUserContactSafe(userId: string) {
    try {
      return await this.authInternal.getUserContact(userId);
    } catch (e) {
      this.logger.warn(
        `Auth contact lookup failed for user ${userId}: ${String(e)}`,
      );
      return {
        userId,
        email: null,
        phone: null,
        emailVerified: false,
        phoneVerified: false,
      };
    }
  }

  private async withContact(
    profile: Prisma.UserProfileGetPayload<Record<string, never>>,
  ) {
    const contact = await this.getUserContactSafe(profile.userId);
    return {
      ...profile,
      avatarUrl: this.avatars.normalizePublicUrl(profile.avatarUrl),
      email: contact.email,
      phone: contact.phone,
      emailVerified: contact.emailVerified,
      phoneVerified: contact.phoneVerified,
    };
  }

  private async ensureUserRowsTx(
    userId: string,
    tx: Prisma.TransactionClient | PrismaService,
  ) {
    await tx.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await tx.preferences.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }
}
