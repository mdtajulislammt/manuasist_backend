import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { OnboardingFlowStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateFlowDto } from './dto/create-flow.dto';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { UpdateStepDto } from './dto/update-step.dto';

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
        include: { steps: { orderBy: { orderIndex: 'asc' } } },
      });
      return {
        success: true,
        message: 'Flows listed successfully',
        data: flows,
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
        data: flow,
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
    try {
      await this.ensureDraft(flowId);
      const step = await this.prisma.onboardingStep.create({
        data: {
          flowId,
          orderIndex: dto.orderIndex,
          type: dto.type,
          title: dto.title,
          subtitle: dto.subtitle,
          uiConfig: dto.uiConfig === undefined ? undefined : (dto.uiConfig as Prisma.InputJsonValue),
        },
      });
      return {
        success: true,
        message: 'Step created successfully',
        data: step,
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
      throw new InternalServerErrorException('Failed to add step');
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
      if (dto.type !== undefined) {
        data.type = dto.type;
      }
      if (dto.title !== undefined) {
        data.title = dto.title;
      }
      if (dto.subtitle !== undefined) {
        data.subtitle = dto.subtitle;
      }
      if (dto.uiConfig !== undefined) {
        data.uiConfig = dto.uiConfig as Prisma.InputJsonValue;
      }
      const updatedStep = await this.prisma.onboardingStep.update({
        where: { id: stepId },
        data,
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
        data: flow,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get active published flow');
    }
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
