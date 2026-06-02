import { Public } from '@menu-assist/api-auth';
import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ProfileAvatarStorageService } from './profile-avatar-storage.service';

@Controller('files')
@ApiTags('Profile files')
export class ProfileFilesController {
  constructor(private readonly avatars: ProfileAvatarStorageService) {}

  @Get('user-avatar/:storedName')
  @Public()
  @ApiOperation({ summary: 'Stream a user avatar stored by application-service' })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiOkResponse({ description: 'Avatar binary stream.' })
  async getAvatar(
    @Param('storedName') storedName: string,
  ): Promise<StreamableFile> {
    const { stream, contentType } =
      await this.avatars.getAvatarStream(storedName);
    return new StreamableFile(stream, {
      type: contentType,
      disposition: `inline; filename="${storedName}"`,
    });
  }
}
