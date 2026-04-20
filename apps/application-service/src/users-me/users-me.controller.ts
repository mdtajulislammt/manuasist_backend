import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { PatchPreferencesDto } from './dto/patch-preferences.dto';
import { PatchProfileDto } from './dto/patch-profile.dto';
import { PutOnboardingAnswersDto } from './dto/put-onboarding-answers.dto';
import { UsersMeService } from './users-me.service';

@Controller('users/me')
export class UsersMeController {
  constructor(private readonly usersMe: UsersMeService) {}

  @Get('profile')
  getProfile(@CurrentUserId() userId: string | undefined) {
    const id = this.requireUserId(userId);
    return this.usersMe.getProfile(id);
  }

  @Patch('profile')
  patchProfile(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: PatchProfileDto,
  ) {
    const id = this.requireUserId(userId);
    return this.usersMe.patchProfile(id, dto);
  }

  @Get('preferences')
  getPreferences(@CurrentUserId() userId: string | undefined) {
    const id = this.requireUserId(userId);
    return this.usersMe.getPreferences(id);
  }

  @Patch('preferences')
  patchPreferences(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: PatchPreferencesDto,
  ) {
    const id = this.requireUserId(userId);
    return this.usersMe.patchPreferences(id, dto);
  }

  @Put('onboarding/answers')
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
