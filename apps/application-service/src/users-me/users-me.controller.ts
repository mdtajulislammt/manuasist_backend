import {
  Body,
  Controller,
  Get,
  Patch,
  UploadedFiles,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { PatchProfileDto } from './dto/patch-profile.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UsersMeService } from './users-me.service';

type MulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('users/me')
@ApiTags('Profile')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class UsersMeController {
  constructor(private readonly usersMe: UsersMeService) { }

  @Get('profile')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Includes profileCompletePercent (0-100) based on saved onboarding answers for the active flow.',
  })
  @ApiOkResponse({ type: UserProfileResponseDto })
  getProfile(@CurrentUserId() userId: string | undefined) {
    const id = this.requireUserId(userId);
    return this.usersMe.getProfile(id);
  }

  @Patch('profile')
  @ApiOperation({
    summary: 'Update profile fields, avatar, and contact change OTP flow',
    description:
      'Single edit-profile endpoint. Sends OTP when email/phone changes without otp fields; verifies and applies when emailOtp/phoneOtp are provided. Avatar accepts multipart field `avatar` or `file`.',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', example: 'Alex Doe' },
        email: { type: 'string', example: 'new@example.com' },
        emailOtp: { type: 'string', example: '123456' },
        phone: { type: 'string', example: '+8801712345678' },
        phoneOtp: { type: 'string', example: '123456' },
        avatar: { type: 'string', format: 'binary' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: UserProfileResponseDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'avatar', maxCount: 1 },
      { name: 'file', maxCount: 1 },
    ], {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  patchProfile(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: PatchProfileDto,
    @UploadedFiles()
    files:
      | {
        avatar?: MulterFile[];
        file?: MulterFile[];
      }
      | undefined,
  ) {
    const id = this.requireUserId(userId);
    const avatar = files?.avatar?.[0] ?? files?.file?.[0];
    return this.usersMe.patchProfile(id, dto, avatar);
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException();
    }
    return userId;
  }
}
