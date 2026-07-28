import { CurrentUserId } from '@menu-assist/api-auth';
import { Roles } from '@api-auth/roles.decorator';

import {
  Body,
  Controller,
  Get,
  Patch,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';

import { FileFieldsInterceptor } from '@nestjs/platform-express';

import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { memoryStorage } from 'multer';

import { ProfileService } from './profile.service';

import { UpdateProfileDto } from './dto/update-profile.dto';

type MulterFile = {
  buffer: Buffer;

  originalname: string;

  mimetype: string;

  size: number;
};

@Roles("admin")
@ApiBearerAuth("JWT-auth")
@ApiTags("Admin Profile")
@Controller("profile")
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get("me")
  @ApiOperation({ summary: "Get current admin user profile" })
  @ApiOkResponse({
    description: "Get current user profile",
  })
  async getCurrentUserProfile(@CurrentUserId() userId: string | undefined) {
    const id = this.requireUserId(userId);

    return this.profileService.getProfile(id);
  }

  @Patch("me/update")
  @ApiOperation({ summary: "Update admin user profile and optional avatar" })
  @ApiConsumes("application/json", "multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",

      properties: {
        fullName: { type: "string", example: "John Doe" },

        email: { type: "string", example: "john@example.com" },

        phone: { type: "string", example: "+1234567890" },

        address: { type: "string", example: "123 Main St" },

        avatar: { type: "string", format: "binary" },

        file: { type: "string", format: "binary" },
      },
    },
  })
  @ApiResponse({
    description: "Update Auth User profile.",
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "avatar", maxCount: 1 },

        { name: "file", maxCount: 1 },
      ],

      {
        storage: memoryStorage(),

        limits: { fileSize: 2 * 1024 * 1024 },
      }
    )
  )
  async updateAuthUserProfile(
    @CurrentUserId() userId: string | undefined,

    @Body() body: UpdateProfileDto,

    @UploadedFiles()
    files:
      | {
          avatar?: MulterFile[];

          file?: MulterFile[];
        }
      | undefined
  ) {
    const id = this.requireUserId(userId);

    const avatar = files?.avatar?.[0] ?? files?.file?.[0];

    return this.profileService.updateProfile(id, body, avatar);
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException();
    }

    return userId;
  }
}
