import { BadRequestException, HttpException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { SpiceLevel, WeightGoal } from '../../generated/prisma/enums';
import type { AdminActiveFlowPayload } from '../admin-internal/admin-internal-client.service';
import { AdminInternalClientService } from '../admin-internal/admin-internal-client.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminInternalClientService,
  ) { }

  async getProfile(userId: string) {
    await this.ensureUserRows(userId);
    const profile = await this.prisma.userProfile.findUniqueOrThrow({
      where: { userId },
    });
    return profile;
  }

  async patchProfile(userId: string, dto: PatchProfileDto) {
    await this.ensureUserRows(userId);
    return this.prisma.userProfile.update({
      where: { userId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
      },
    });
  }

  async getPreferences(userId: string) {
    await this.ensureUserRows(userId);
    return this.prisma.preferences.findUniqueOrThrow({
      where: { userId },
    });
  }

  async patchPreferences(userId: string, dto: PatchPreferencesDto) {
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
    return this.prisma.preferences.update({
      where: { userId },
      data,
    });
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
