import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
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
import { ProfileContactChangeService } from './profile-contact-change.service';
import { DietaryPreferencesResolver } from './dietary-preferences.resolver';
import {
  mergePreferenceUpdates,
  projectPreferencesFromValue,
  toPreferencesUpdateInput,
} from './project-preferences.util';

@Injectable()
export class UsersMeService {
  private readonly logger = new Logger(UsersMeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: ProfileAvatarStorageService,
    private readonly admin: AdminInternalClientService,
    private readonly authInternal: AuthInternalClientService,
    private readonly contactChange: ProfileContactChangeService,
    private readonly dietary: DietaryPreferencesResolver,
  ) { }

  async getProfile(userId: string) {
    try {
      await this.ensureUserRows(userId);
      const profile = await this.prisma.userProfile.findUniqueOrThrow({
        where: { userId },
      });
      const data = await this.withProfileResponse(profile);
      const pendingVerification =
        await this.contactChange.getPendingForUser(userId);
      return {
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          ...data,
          ...(Object.keys(pendingVerification).length > 0
            ? { pendingVerification }
            : {}),
        },
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
          await this.contactChange.clearPending(userId, 'email');
        } else {
          pendingVerification.email = await this.contactChange.requestOtp(
            userId,
            'email',
            dto.email,
          );
        }
      }
      if (dto.phone) {
        if (dto.phoneOtp) {
          await this.authInternal.verifyContactChange(userId, {
            kind: 'phone',
            identifier: dto.phone,
            otp: dto.phoneOtp,
          });
          await this.contactChange.clearPending(userId, 'phone');
        } else {
          pendingVerification.phone = await this.contactChange.requestOtp(
            userId,
            'phone',
            dto.phone,
          );
        }
      }

      const profile = await this.withProfileResponse(updatedProfile);
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
      const [preferences, resolved] = await Promise.all([
        this.prisma.preferences.findUniqueOrThrow({
          where: { userId },
        }),
        this.dietary.resolve(userId),
      ]);
      return {
        success: true,
        message: 'Preferences retrieved successfully',
        data: {
          ...preferences,
          calorieTarget: resolved.calorieTarget,
          calorieTargetSource: resolved.calorieTargetSource,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get preferences');
    }
  }

  async getActiveFlowWithProgress(userId: string) {
    try {
      await this.ensureUserRows(userId);
      const wrapped = await this.admin.getActiveFlow();
      const flow = wrapped.data;
      const steps = [...(flow.steps ?? [])].sort(
        (a, b) => a.orderIndex - b.orderIndex,
      );

      const answers = await this.prisma.userOnboardingAnswer.findMany({
        where: { userId, flowVersion: flow.version },
      });
      const answersByStepId = new Map(
        answers.map((a) => [a.stepKey, a.value]),
      );
      const answered = new Set(answers.map((a) => a.stepKey));
      const totalSteps = steps.length;
      const stepsWithAnswers = steps.map((step) => {
        const savedValue = answersByStepId.get(step.id);
        return {
          ...step,
          progressPercent: this.computeStepPositionPercent(
            step.orderIndex,
            totalSteps,
          ),
          completed: savedValue !== undefined,
          value: savedValue ?? null,
        };
      });
      const answeredSteps = stepsWithAnswers.filter((s) => s.completed).length;
      const progress = this.computeOnboardingAnswerPercent(steps, answered);

      return {
        success: true,
        message: 'Active flow retrieved successfully',
        data: {
          ...flow,
          steps: stepsWithAnswers,
          progress,
          lastCompletedSteps: answeredSteps,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get active flow');
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
                progressPercent: this.computeStepPositionPercent(
                  next.orderIndex,
                  totalSteps,
                ),
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

      if (dto.calorieTarget === undefined && dto.weightGoal !== undefined) {
        await this.dietary.syncComputedCalorieTargetToPreferences(userId);
      }

      const resolved = await this.dietary.resolve(userId);
      const latestPreferences =
        dto.calorieTarget === undefined && dto.weightGoal !== undefined
          ? await this.prisma.preferences.findUniqueOrThrow({
              where: { userId },
            })
          : updatedPreferences;

      return {
        success: true,
        message: 'Preferences updated successfully',
        data: {
          ...latestPreferences,
          calorieTarget: resolved.calorieTarget,
          calorieTargetSource: resolved.calorieTargetSource,
        },
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
      const touchesBiometrics = dto.answers.some((answer) => {
        const step = flow.data.steps.find((row) => row.id === answer.stepKey);
        const kind =
          step?.uiConfig &&
          typeof step.uiConfig === 'object' &&
          !Array.isArray(step.uiConfig) &&
          typeof (step.uiConfig as Record<string, unknown>).kind === 'string'
            ? String((step.uiConfig as Record<string, unknown>).kind)
            : null;
        return kind === 'multi_slider';
      });

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
            data: toPreferencesUpdateInput(prefMerged),
          });
        }
        await this.maybeCompleteOnboarding(userId, flow.data, dto.flowVersion, tx);
      });

      if (
        prefMerged.calorieTarget === undefined &&
        (touchesBiometrics || prefMerged.weightGoal !== undefined)
      ) {
        await this.dietary.syncComputedCalorieTargetToPreferences(userId);
      }

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
    const config = uiConfig as {
      required?: boolean;
      selection?: { required?: boolean };
    };
    if (config.selection && typeof config.selection.required === 'boolean') {
      return config.selection.required;
    }
    return config.required !== false;
  }

  private computeStepPositionPercent(
    orderIndex: number,
    totalSteps: number,
  ): number {
    if (totalSteps === 0) {
      return 100;
    }
    return Math.min(
      100,
      Math.round(((orderIndex + 1) / totalSteps) * 100),
    );
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

  private computeOnboardingAnswerPercent(
    steps: Array<{ id: string }>,
    answeredStepKeys: Set<string>,
  ): number {
    const totalSteps = steps.length;
    if (totalSteps === 0) {
      return 100;
    }
    const answeredSteps = steps.filter((s) => answeredStepKeys.has(s.id)).length;
    return Math.min(100, Math.round((answeredSteps / totalSteps) * 100));
  }

  private async resolveProfileCompletePercent(userId: string): Promise<number> {
    try {
      const wrapped = await this.admin.getActiveFlow();
      const flow = wrapped.data;
      const steps = flow.steps ?? [];
      const answers = await this.prisma.userOnboardingAnswer.findMany({
        where: { userId, flowVersion: flow.version },
        select: { stepKey: true },
      });
      const answered = new Set(answers.map((a) => a.stepKey));
      return this.computeOnboardingAnswerPercent(steps, answered);
    } catch (e) {
      this.logger.warn(
        `Profile completion lookup failed for user ${userId}: ${String(e)}`,
      );
      return 0;
    }
  }

  private async withProfileResponse(
    profile: Prisma.UserProfileGetPayload<Record<string, never>>,
  ) {
    const [contactProfile, profileCompletePercent] = await Promise.all([
      this.withContact(profile),
      this.resolveProfileCompletePercent(profile.userId),
    ]);
    return {
      ...contactProfile,
      profileCompletePercent,
    };
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
