import {
  Body,
  Controller,
  Get,
  Patch,
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
import { PatchProfileDto } from './dto/patch-profile.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UsersMeService } from './users-me.service';

@Controller('users/me')
@ApiTags('Profile')
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

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException();
    }
    return userId;
  }
}
