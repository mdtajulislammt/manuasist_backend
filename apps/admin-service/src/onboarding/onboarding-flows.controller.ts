import { Public, Roles } from '@menu-assist/api-auth';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { CreateFlowDto } from './dto/create-flow.dto';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { UpdateStepDto } from './dto/update-step.dto';
import { OnboardingFlowsService } from './onboarding-flows.service';

@Controller('onboarding/flows')
@Roles('admin')
export class OnboardingFlowsController {
  constructor(private readonly flows: OnboardingFlowsService) {}

  @Post()
  createFlow(@Body() dto: CreateFlowDto) {
    return this.flows.createFlow(dto);
  }

  @Get()
  listFlows() {
    return this.flows.listFlows();
  }

  @Get(':id')
  getFlow(@Param('id', ParseUUIDPipe) id: string) {
    return this.flows.getFlow(id);
  }

  @Patch(':id')
  updateFlow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFlowDto,
  ) {
    return this.flows.updateFlow(id, dto);
  }

  @Delete(':id')
  deleteFlow(@Param('id', ParseUUIDPipe) id: string) {
    return this.flows.deleteFlow(id);
  }

  @Post(':flowId/steps')
  addStep(
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() dto: CreateStepDto,
  ) {
    return this.flows.addStep(flowId, dto);
  }

  @Post(':id/publish')
  publishFlow(@Param('id', ParseUUIDPipe) id: string) {
    return this.flows.publishFlow(id);
  }
}

@Controller('onboarding/steps')
@Roles('admin')
export class OnboardingStepsController {
  constructor(private readonly flows: OnboardingFlowsService) {}

  @Patch(':stepId')
  updateStep(
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateStepDto,
  ) {
    return this.flows.updateStep(stepId, dto);
  }

  @Delete(':stepId')
  deleteStep(@Param('stepId', ParseUUIDPipe) stepId: string) {
    return this.flows.deleteStep(stepId);
  }
}

@Controller('internal/onboarding')
@Public()
@UseGuards(InternalApiKeyGuard)
export class InternalOnboardingController {
  constructor(private readonly flows: OnboardingFlowsService) {}

  @Get('active-flow')
  getActiveFlow() {
    return this.flows.getActivePublishedFlowForInternal();
  }
}
