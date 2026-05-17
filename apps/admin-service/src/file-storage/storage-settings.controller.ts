import { Roles } from '@menu-assist/api-auth';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PatchStorageSettingsDto } from './dto/patch-storage-settings.dto';
import { FileStorageService } from './file-storage.service';

@Controller('storage/settings')
@ApiTags('Platform storage')
export class StorageSettingsController {
  constructor(private readonly files: FileStorageService) {}

  @Get()
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get platform file storage settings (local vs S3 default for new uploads)' })
  @ApiOkResponse({ description: 'Active provider and capability flags.' })
  getSettings() {
    return this.files.getSettings().then((data) => ({
      success: true,
      message: 'Storage settings retrieved',
      data,
    }));
  }

  @Patch()
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set default storage provider for new file uploads',
    description:
      'Does not migrate existing files. Each stored file keeps the provider it was created with.',
  })
  @ApiOkResponse({ description: 'Updated settings.' })
  patchSettings(@Body() dto: PatchStorageSettingsDto) {
    return this.files.updateSettings(dto.activeProvider).then((data) => ({
      success: true,
      message: 'Storage settings updated',
      data,
    }));
  }
}
