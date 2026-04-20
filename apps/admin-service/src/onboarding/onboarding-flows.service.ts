import {
  BadRequestException,
  Injectable,
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
  constructor(private readonly prisma: PrismaService) {}

  async createFlow(dto: CreateFlowDto) {
    let version = dto.version ?? 1;
    if (dto.version === undefined) {
      const latest = await this.prisma.onboardingFlow.findFirst({
        where: { name: dto.name },
        orderBy: { version: 'desc' },
      });
      version = (latest?.version ?? 0) + 1;
    }

    return this.prisma.onboardingFlow.create({
      data: {
        name: dto.name,
        version,
        status: OnboardingFlowStatus.DRAFT,
      },
    });
  }

  listFlows() {
    return this.prisma.onboardingFlow.findMany({
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
      include: { steps: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async getFlow(id: string) {
    const flow = await this.prisma.onboardingFlow.findUnique({
      where: { id },
      include: { steps: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }
    return flow;
  }

  async updateFlow(id: string, dto: UpdateFlowDto) {
    await this.ensureFlowExists(id);
    const data: Prisma.OnboardingFlowUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.status !== undefined) {
      data.status = dto.status as OnboardingFlowStatus;
    }
    return this.prisma.onboardingFlow.update({
      where: { id },
      data,
      include: { steps: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async deleteFlow(id: string) {
    const flow = await this.prisma.onboardingFlow.findUnique({ where: { id } });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }
    if (flow.status !== OnboardingFlowStatus.DRAFT) {
      throw new BadRequestException('Only draft flows can be deleted');
    }
    await this.prisma.onboardingFlow.delete({ where: { id } });
    return { deleted: true };
  }

  async addStep(flowId: string, dto: CreateStepDto) {
    await this.ensureDraft(flowId);
    return this.prisma.onboardingStep.create({
      data: {
        flowId,
        orderIndex: dto.orderIndex,
        type: dto.type,
        title: dto.title,
        subtitle: dto.subtitle,
        uiConfig: dto.uiConfig === undefined ? undefined : (dto.uiConfig as Prisma.InputJsonValue),
      },
    });
  }

  async updateStep(stepId: string, dto: UpdateStepDto) {
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
    return this.prisma.onboardingStep.update({
      where: { id: stepId },
      data,
    });
  }

  async deleteStep(stepId: string) {
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
    return { deleted: true };
  }

  async publishFlow(flowId: string) {
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
      return tx.onboardingFlow.update({
        where: { id: flowId },
        data: {
          status: OnboardingFlowStatus.PUBLISHED,
          publishedAt: new Date(),
          isActive: true,
        },
        include: { steps: { orderBy: { orderIndex: 'asc' } } },
      });
    });
  }

  async getActivePublishedFlowForInternal() {
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
    return flow;
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
