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
import { PatchPreferencesDto } from './dto/patch-preferences.dto';
import { PatchProfileDto } from './dto/patch-profile.dto';
import { PreferencesResponseDto } from './dto/preferences-response.dto';
import { PutOnboardingAnswersDto } from './dto/put-onboarding-answers.dto';
import { PutOnboardingAnswersResponseDto } from './dto/put-onboarding-answers-response.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UsersMeService } from './users-me.service';

@Controller('users/me')
@ApiTags('Users (me)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class UsersMeController {
  constructor(private readonly usersMe: UsersMeService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  getProfile(@CurrentUserId() userId: string | undefined) {
    const id = this.requireUserId(userId);
    return this.usersMe.getProfile(id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update profile fields' })
  @ApiBody({ type: PatchProfileDto })
  @ApiOkResponse({ type: UserProfileResponseDto })
  patchProfile(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: PatchProfileDto,
  ) {
    const id = this.requireUserId(userId);
    return this.usersMe.patchProfile(id, dto);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get dietary preferences' })
  @ApiOkResponse({ type: PreferencesResponseDto })
  getPreferences(@CurrentUserId() userId: string | undefined) {
    const id = this.requireUserId(userId);
    return this.usersMe.getPreferences(id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update dietary preferences' })
  @ApiBody({ type: PatchPreferencesDto })
  @ApiOkResponse({ type: PreferencesResponseDto })
  patchPreferences(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: PatchPreferencesDto,
  ) {
    const id = this.requireUserId(userId);
    return this.usersMe.patchPreferences(id, dto);
  }

  @Put('onboarding/answers')
  @ApiOperation({
    summary: 'Submit onboarding answers for the active flow version',
    description:
      'Upserts answers per step, merges preference fields from answer values, and may set onboardingCompletedAt when required steps are done.',
  })
  @ApiBody({ type: PutOnboardingAnswersDto })
  @ApiOkResponse({ type: PutOnboardingAnswersResponseDto })
  putOnboardingAnswers(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: PutOnboardingAnswersDto,
  ) {
    const id = this.requireUserId(userId);
    return this.usersMe.putOnboardingAnswers(id, dto);
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException();
    }
    return userId;
  }
}
