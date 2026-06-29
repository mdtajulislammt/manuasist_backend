import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { OnboardingFlowStatus, Prisma } from '../../generated/prisma/client';
import type { OnboardingStep } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateFlowDto } from './dto/create-flow.dto';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { UpdateStepDto } from './dto/update-step.dto';
import {
  enrichStepUiConfigForResponse,
  prepareOnboardingUiConfig,
} from './onboarding-ui-config.normalizer';

@Injectable()
export class OnboardingFlowsService {
  constructor(private readonly prisma: PrismaService) { }

  async createFlow(dto: CreateFlowDto) {
    try {
      let version = dto.version ?? 1;
      if (dto.version === undefined) {
        const latest = await this.prisma.onboardingFlow.findFirst({
          where: { name: dto.name },
          orderBy: { version: 'desc' },
        });
        version = (latest?.version ?? 0) + 1;
      }

      const flow = await this.prisma.onboardingFlow.create({
        data: {
          name: dto.name,
          version,
          status: OnboardingFlowStatus.DRAFT,
        },
      });
      return {
        success: true,
        message: 'Flow created successfully',
        data: flow,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Flow name already exists');
        }
      }
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create flow');
    }
  }

  async listFlows() {
    try {
      const flows = await this.prisma.onboardingFlow.findMany({
        orderBy: [{ name: 'asc' }, { version: 'desc' }],
        include: { _count: { select: { steps: true } } },
      });
      const flowsWithStepsCount = flows.map((flow) => {
        const { _count, ...flowWithoutCount } = flow;
        return {
          ...flowWithoutCount,
          stepsCount: _count.steps,
        };
      });
  
      return {
        success: true,
        message: 'Flows listed successfully',
        data: flowsWithStepsCount,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to list flows');
    }
  }

  async getFlow(id: string) {
    try {
      const flow = await this.prisma.onboardingFlow.findUnique({
        where: { id },
        include: { steps: { orderBy: { orderIndex: 'asc' } } },
      });
      if (!flow) {
        throw new NotFoundException('Flow not found');
      }
      return {
        success: true,
        message: 'Flow retrieved successfully',
        data: {
          ...flow,
          steps: flow.steps.map((step) => ({
            ...step,
            uiConfig: enrichStepUiConfigForResponse(step.uiConfig),
          })),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get flow');
    }
  }

  async updateFlow(id: string, dto: UpdateFlowDto) {
    try {
      await this.ensureFlowExists(id);
      const data: Prisma.OnboardingFlowUpdateInput = {};
      if (dto.name !== undefined) {
        data.name = dto.name;
      }
      if (dto.status !== undefined) {
        data.status = dto.status as OnboardingFlowStatus;
      }
      const flow = await this.prisma.onboardingFlow.update({
        where: { id },
        data,
        include: { steps: { orderBy: { orderIndex: 'asc' } } },
      });
      return {
        success: true,
        message: 'Flow updated successfully',
        data: flow,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update flow');
    }
  }

  async deleteFlow(id: string) {
    try {
      const flow = await this.prisma.onboardingFlow.findUnique({ where: { id } });
      if (!flow) {
        throw new NotFoundException('Flow not found');
      }
      if (flow.status !== OnboardingFlowStatus.DRAFT) {
        throw new BadRequestException('Only draft flows can be deleted');
      }
      await this.prisma.onboardingFlow.delete({ where: { id } });
      return {
        success: true,
        message: 'Flow deleted successfully',
        data: { deleted: true },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete flow');
    }
  }

  async addStep(flowId: string, dto: CreateStepDto) {
    const steps = await this.upsertSteps(flowId, [dto]);
    return {
      success: true,
      message: 'Step saved successfully',
      data: steps[0],
    };
  }

  async addSteps(flowId: string, dtos: CreateStepDto[]) {
    const steps = await this.upsertSteps(flowId, dtos);
    return {
      success: true,
      message: `${steps.length} step(s) saved successfully`,
      data: steps,
    };
  }

  private async upsertSteps(flowId: string, dtos: CreateStepDto[]) {
    if (dtos.length === 0) {
      throw new BadRequestException('At least one step is required');
    }
    try {
      await this.ensureDraft(flowId);
      this.assertUniqueOrderIndexesInRequest(dtos);
      this.assertUniqueIdsInRequest(dtos);
      for (const dto of dtos) {
        try {
          prepareOnboardingUiConfig(dto.uiConfig);
        } catch (error) {
          if (error instanceof BadRequestException) {
            const detail = this.formatHttpExceptionMessage(error);
            throw new BadRequestException(
              `Step orderIndex ${dto.orderIndex}: ${detail}`,
            );
          }
          throw error;
        }
      }

      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.onboardingStep.findMany({
          where: { flowId },
          orderBy: { orderIndex: 'asc' },
        });
        const existingById = new Map(existing.map((step) => [step.id, step]));
        const existingByOrder = new Map(
          existing.map((step) => [step.orderIndex, step]),
        );

        const tempBase = 1_000_000;
        for (let i = 0; i < existing.length; i++) {
          await tx.onboardingStep.update({
            where: { id: existing[i].id },
            data: { orderIndex: tempBase + i },
          });
        }

        const results: OnboardingStep[] = [];
        const consumedIds = new Set<string>();

        for (const dto of dtos) {
          const uiConfig = prepareOnboardingUiConfig(dto.uiConfig);
          const data = {
            orderIndex: dto.orderIndex,
            title: dto.title,
            subtitle: dto.subtitle,
            uiConfig:
              uiConfig === undefined
                ? undefined
                : (uiConfig as Prisma.InputJsonValue),
          };

          let target = dto.id ? existingById.get(dto.id) : undefined;
          if (target && target.flowId !== flowId) {
            throw new BadRequestException(
              `Step ${dto.id} does not belong to this flow`,
            );
          }
          if (!target) {
            target = existingByOrder.get(dto.orderIndex);
          }
          if (target && consumedIds.has(target.id)) {
            target = undefined;
          }

          if (target) {
            consumedIds.add(target.id);
            results.push(
              await tx.onboardingStep.update({
                where: { id: target.id },
                data,
              }),
            );
            continue;
          }

          if (dto.id) {
            throw new NotFoundException(`Step not found: ${dto.id}`);
          }

          results.push(
            await tx.onboardingStep.create({
              data: {
                flowId,
                ...data,
              },
            }),
          );
        }

        return results;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Step order index already exists');
        }
      }
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to save step(s)');
    }
  }

  private assertUniqueIdsInRequest(dtos: CreateStepDto[]): void {
    const seen = new Set<string>();
    for (const dto of dtos) {
      if (!dto.id) {
        continue;
      }
      if (seen.has(dto.id)) {
        throw new BadRequestException(`Duplicate step id ${dto.id} in request`);
      }
      seen.add(dto.id);
    }
  }

  private assertUniqueOrderIndexesInRequest(dtos: CreateStepDto[]): void {
    const seen = new Set<number>();
    for (const dto of dtos) {
      if (seen.has(dto.orderIndex)) {
        throw new BadRequestException(
          `Duplicate orderIndex ${dto.orderIndex} in request`,
        );
      }
      seen.add(dto.orderIndex);
    }
  }

  async updateStep(stepId: string, dto: UpdateStepDto) {
    try {
      const step = await this.prisma.onboardingStep.findUnique({
        where: { id: stepId },
        include: { flow: true },
      });
      if (!step) {
        throw new NotFoundException('Step not found');
      }
      if (step.flow.status !== OnboardingFlowStatus.DRAFT) {
        throw new BadRequestException('Steps can only be edited on draft flows');
      }
      const data: Prisma.OnboardingStepUpdateInput = {};
      if (dto.orderIndex !== undefined) {
        data.orderIndex = dto.orderIndex;
      }
      if (dto.title !== undefined) {
        data.title = dto.title;
      }
      if (dto.subtitle !== undefined) {
        data.subtitle = dto.subtitle;
      }
      if (dto.uiConfig !== undefined) {
        const uiConfig = prepareOnboardingUiConfig(dto.uiConfig);
        data.uiConfig = uiConfig as Prisma.InputJsonValue;
      }

      const updatedStep = await this.prisma.$transaction(async (tx) => {
        if (
          dto.orderIndex !== undefined &&
          dto.orderIndex !== step.orderIndex
        ) {
          const conflict = await tx.onboardingStep.findUnique({
            where: {
              flowId_orderIndex: {
                flowId: step.flowId,
                orderIndex: dto.orderIndex,
              },
            },
          });
          if (conflict && conflict.id !== stepId) {
            await tx.onboardingStep.update({
              where: { id: conflict.id },
              data: { orderIndex: step.orderIndex },
            });
          }
        }

        return tx.onboardingStep.update({
          where: { id: stepId },
          data,
        });
      });
      return {
        success: true,
        message: 'Step updated successfully',
        data: updatedStep,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Step order index already exists');
        }
      }
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update step');
    }
  }

  async deleteStep(stepId: string) {
    try {
      const step = await this.prisma.onboardingStep.findUnique({
        where: { id: stepId },
        include: { flow: true },
      });
      if (!step) {
        throw new NotFoundException('Step not found');
      }
      if (step.flow.status !== OnboardingFlowStatus.DRAFT) {
        throw new BadRequestException('Steps can only be deleted on draft flows');
      }
      await this.prisma.onboardingStep.delete({ where: { id: stepId } });
      return {
        success: true,
        message: 'Step deleted successfully',
        data: { deleted: true },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete step');
    }
  }

  async publishFlow(flowId: string) {
    try {
      const flow = await this.prisma.onboardingFlow.findUnique({
        where: { id: flowId },
        include: { steps: true },
      });
      if (!flow) {
        throw new NotFoundException('Flow not found');
      }
      if (flow.status !== OnboardingFlowStatus.DRAFT) {
        throw new BadRequestException('Only draft flows can be published');
      }
      if (flow.steps.length === 0) {
        throw new BadRequestException('Cannot publish a flow with no steps');
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.onboardingFlow.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
        const updatedFlow = await tx.onboardingFlow.update({
          where: { id: flowId },
          data: {
            status: OnboardingFlowStatus.PUBLISHED,
            publishedAt: new Date(),
            isActive: true,
          },
          include: { steps: { orderBy: { orderIndex: 'asc' } } },
        });
        return {
          success: true,
          message: 'Flow published successfully',
          data: updatedFlow,
        };
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to publish flow');
    }
  }

  async getActivePublishedFlowForInternal() {
    try {
      const flow = await this.prisma.onboardingFlow.findFirst({
        where: {
          status: OnboardingFlowStatus.PUBLISHED,
          isActive: true,
        },
        include: { steps: { orderBy: { orderIndex: 'asc' } } },
      });
      if (!flow) {
        throw new NotFoundException('No active published onboarding flow');
      }
      return {
        success: true,
        message: 'Active published flow retrieved successfully',
        data: {
          ...flow,
          steps: flow.steps.map((step) => ({
            ...step,
            uiConfig: enrichStepUiConfigForResponse(step.uiConfig),
          })),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get active published flow');
    }
  }

  private formatHttpExceptionMessage(error: HttpException): string {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message: string | string[] }).message;
      return Array.isArray(message) ? message.join('; ') : message;
    }
    return error.message;
  }

  private async ensureFlowExists(id: string) {
    const flow = await this.prisma.onboardingFlow.findUnique({ where: { id } });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }
  }

  private async ensureDraft(flowId: string) {
    const flow = await this.prisma.onboardingFlow.findUnique({
      where: { id: flowId },
    });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }
    if (flow.status !== OnboardingFlowStatus.DRAFT) {
      throw new BadRequestException('Steps can only be added to draft flows');
    }
  }
}
