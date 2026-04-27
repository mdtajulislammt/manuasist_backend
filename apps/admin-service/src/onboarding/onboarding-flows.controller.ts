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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { CreateFlowDto } from './dto/create-flow.dto';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { UpdateStepDto } from './dto/update-step.dto';
import { OnboardingFlowsService } from './onboarding-flows.service';

@Controller('onboarding/flows')
@ApiTags('Admin Onboarding Flows')
@ApiBearerAuth()
@Roles('admin')
export class OnboardingFlowsController {
  constructor(private readonly flows: OnboardingFlowsService) {}

  @Post()
  @ApiOperation({ summary: 'Create onboarding flow (draft)' })
  @ApiBody({ type: CreateFlowDto })
  @ApiOkResponse({ description: 'Flow created.' })
  @ApiBadRequestResponse({ description: 'Invalid payload.' })
  createFlow(@Body() dto: CreateFlowDto) {
    return this.flows.createFlow(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List onboarding flows with steps' })
  @ApiOkResponse({ description: 'Flow list returned.' })
  listFlows() {
    return this.flows.listFlows();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get onboarding flow by id' })
  @ApiOkResponse({ description: 'Flow returned.' })
  @ApiNotFoundResponse({ description: 'Flow not found.' })
  getFlow(@Param('id', ParseUUIDPipe) id: string) {
    return this.flows.getFlow(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update onboarding flow metadata/status' })
  @ApiBody({ type: UpdateFlowDto })
  @ApiOkResponse({ description: 'Flow updated.' })
  @ApiBadRequestResponse({ description: 'Invalid update payload.' })
  @ApiNotFoundResponse({ description: 'Flow not found.' })
  updateFlow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFlowDto,
  ) {
    return this.flows.updateFlow(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete draft onboarding flow' })
  @ApiOkResponse({ description: 'Flow deleted.' })
  @ApiBadRequestResponse({ description: 'Only draft flows can be deleted.' })
  @ApiNotFoundResponse({ description: 'Flow not found.' })
  deleteFlow(@Param('id', ParseUUIDPipe) id: string) {
    return this.flows.deleteFlow(id);
  }

  @Post(':flowId/steps')
  @ApiOperation({ summary: 'Add step to a draft flow' })
  @ApiBody({ type: CreateStepDto })
  @ApiOkResponse({ description: 'Step added.' })
  @ApiBadRequestResponse({ description: 'Flow is not draft or payload invalid.' })
  @ApiNotFoundResponse({ description: 'Flow not found.' })
  addStep(
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() dto: CreateStepDto,
  ) {
    return this.flows.addStep(flowId, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish flow and mark as active' })
  @ApiOkResponse({ description: 'Flow published and activated.' })
  @ApiBadRequestResponse({ description: 'Flow invalid for publish.' })
  @ApiNotFoundResponse({ description: 'Flow not found.' })
  publishFlow(@Param('id', ParseUUIDPipe) id: string) {
    return this.flows.publishFlow(id);
  }
}

@Controller('onboarding/steps')
@ApiTags('Admin Onboarding Steps')
@ApiBearerAuth()
@Roles('admin')
export class OnboardingStepsController {
  constructor(private readonly flows: OnboardingFlowsService) {}

  @Patch(':stepId')
  @ApiOperation({ summary: 'Update onboarding step' })
  @ApiBody({ type: UpdateStepDto })
  @ApiOkResponse({ description: 'Step updated.' })
  @ApiBadRequestResponse({ description: 'Flow is not draft or payload invalid.' })
  @ApiNotFoundResponse({ description: 'Step not found.' })
  updateStep(
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateStepDto,
  ) {
    return this.flows.updateStep(stepId, dto);
  }

  @Delete(':stepId')
  @ApiOperation({ summary: 'Delete onboarding step' })
  @ApiOkResponse({ description: 'Step deleted.' })
  @ApiBadRequestResponse({ description: 'Flow is not draft.' })
  @ApiNotFoundResponse({ description: 'Step not found.' })
  deleteStep(@Param('stepId', ParseUUIDPipe) stepId: string) {
    return this.flows.deleteStep(stepId);
  }
}

@Controller('internal/onboarding')
@ApiTags('Internal Onboarding')
@Public()
@UseGuards(InternalApiKeyGuard)
export class InternalOnboardingController {
  constructor(private readonly flows: OnboardingFlowsService) {}

  @Get('active-flow')
  @ApiOperation({ summary: 'Get active published onboarding flow (internal)' })
  @ApiOkResponse({ description: 'Active flow returned.' })
  @ApiNotFoundResponse({ description: 'No active published onboarding flow.' })
  getActiveFlow() {
    return this.flows.getActivePublishedFlowForInternal();
  }
}
