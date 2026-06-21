import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { PatchPreferencesDto } from '../users-me/dto/patch-preferences.dto';
import { PreferencesResponseDto } from '../users-me/dto/preferences-response.dto';
import { PutOnboardingAnswersDto } from '../users-me/dto/put-onboarding-answers.dto';
import { PutOnboardingAnswersResponseDto } from '../users-me/dto/put-onboarding-answers-response.dto';
import { UsersMeService } from '../users-me/users-me.service';
import { AdminActiveFlowResponseDto } from './dto/admin-active-flow-response.dto';
import { OnboardingProgressResponseDto } from './dto/onboarding-progress-response.dto';

/**
 * Dietary preferences and onboarding are one flow: the active flow defines steps;
 * answers are stored per step and merged into the same preferences record.
 */
@Controller('onboarding')
@ApiTags('Onboarding')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class ApplicationOnboardingController {
  constructor(private readonly usersMe: UsersMeService) {}

  @Get('active-flow')
  @ApiOperation({
    summary: 'Get the active published onboarding flow',
    description:
      'Returns steps and flow.version from admin-service. Each step includes completed and value when the user has already answered, so the client can pre-select options. Use version with PUT /onboarding/answers.',
  })
  @ApiOkResponse({ type: AdminActiveFlowResponseDto })
  getActiveFlow(@CurrentUserId() userId: string | undefined) {
    return this.usersMe.getActiveFlowWithProgress(this.requireUserId(userId));
  }

  @Get('progress')
  @ApiOperation({
    summary: 'Onboarding progress (resume / “My Preferences”)',
    description:
      'Combines the active flow with saved answers for this user: counts (e.g. 2 of 6), personalizationPercent, nextStep to continue after skip, and canResume.',
  })
  @ApiOkResponse({ type: OnboardingProgressResponseDto })
  getOnboardingProgress(@CurrentUserId() userId: string | undefined) {
    return this.usersMe.getOnboardingProgress(this.requireUserId(userId));
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Get dietary preferences (onboarding outcome)',
    description:
      'Same persisted row updated by onboarding answers and optional direct PATCH.',
  })
  @ApiOkResponse({ type: PreferencesResponseDto })
  getPreferences(@CurrentUserId() userId: string | undefined) {
    return this.usersMe.getPreferences(this.requireUserId(userId));
  }

  @Patch('preferences')
  @ApiOperation({
    summary: 'Update dietary preferences directly',
    description:
      'Optional outside the guided flow; onboarding answers still merge into this record.',
  })
  @ApiBody({ type: PatchPreferencesDto })
  @ApiOkResponse({ type: PreferencesResponseDto })
  patchPreferences(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: PatchPreferencesDto,
  ) {
    return this.usersMe.patchPreferences(this.requireUserId(userId), dto);
  }

  @Put('answers')
  @ApiOperation({
    summary: 'Submit onboarding step answers',
    description:
      'Upserts answers for the active flow version, merges preference fields from answer payloads, and may set profile.onboardingCompletedAt when required steps are done.',
  })
  @ApiBody({ type: PutOnboardingAnswersDto })
  @ApiOkResponse({ type: PutOnboardingAnswersResponseDto })
  putOnboardingAnswers(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: PutOnboardingAnswersDto,
  ) {
    return this.usersMe.putOnboardingAnswers(this.requireUserId(userId), dto);
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException();
    }
    return userId;
  }
}
