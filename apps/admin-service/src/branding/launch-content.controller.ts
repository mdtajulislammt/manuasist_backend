import { Public, Roles } from '@menu-assist/api-auth';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CreateLaunchContentDto } from './dto/create-launch-content.dto';
import {
  CreateLaunchContentAssetDto,
  UpdateLaunchContentAssetDto,
} from './dto/launch-content-asset.dto';
import { ReorderLaunchContentAssetsDto } from './dto/reorder-launch-content-assets.dto';
import { UpdateLaunchContentDto } from './dto/update-launch-content.dto';
import { LaunchContentService } from './launch-content.service';

type MulterInMemoryFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const launchImageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    _request: unknown,
    file: { mimetype: string },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedMimeTypes.includes((file.mimetype || '').toLowerCase())) {
      callback(
        new BadRequestException(
          'Unsupported image type. Allowed: PNG, JPEG, WebP',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};

@Controller('branding/launch-content')
@ApiTags('Admin Launch Content')
@ApiBearerAuth()
@Roles('admin')
export class LaunchContentAdminController {
  constructor(private readonly launchContent: LaunchContentService) { }

  @Post()
  @ApiOperation({ summary: 'Create a draft launch-content bundle' })
  async create(@Body() dto: CreateLaunchContentDto) {
    return this.success(
      'Launch content draft created',
      await this.launchContent.createBundle(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List launch-content bundles' })
  async list() {
    return this.success(
      'Launch content bundles listed',
      await this.launchContent.listBundles(),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Preview a launch-content bundle' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.success(
      'Launch content bundle retrieved',
      await this.launchContent.getBundle(id),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update draft launch-content metadata' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLaunchContentDto,
  ) {
    return this.success(
      'Launch content draft updated',
      await this.launchContent.updateBundle(id, dto),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft launch-content bundle' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.success(
      'Launch content draft deleted',
      await this.launchContent.deleteBundle(id),
    );
  }

  @Post(':id/assets')
  @ApiOperation({ summary: 'Upload a splash or intro-slide image to a draft' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'kind'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: ['SPLASH', 'INTRO_SLIDE'] },
        orderIndex: { type: 'integer', minimum: 0 },
        title: { type: 'string', maxLength: 120 },
        subtitle: { type: 'string', maxLength: 500 },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', launchImageMulterOptions))
  async addAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: MulterInMemoryFile | undefined,
    @Body() dto: CreateLaunchContentAssetDto,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException(
        'Missing file (use multipart field name `file`)',
      );
    }
    return this.success(
      'Launch content asset uploaded',
      await this.launchContent.addAsset(id, dto, file),
    );
  }

  @Patch(':id/assets/reorder')
  @ApiOperation({ summary: 'Reorder all intro slides in a draft' })
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderLaunchContentAssetsDto,
  ) {
    return this.success(
      'Intro slides reordered',
      await this.launchContent.reorderSlides(id, dto),
    );
  }

  @Patch(':id/assets/:assetId')
  @ApiOperation({
    summary: 'Update copy/order and optionally replace a draft asset image',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        orderIndex: { type: 'integer', minimum: 0 },
        title: { type: 'string', maxLength: 120 },
        subtitle: { type: 'string', maxLength: 500 },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', launchImageMulterOptions))
  async updateAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @UploadedFile() file: MulterInMemoryFile | undefined,
    @Body() dto: UpdateLaunchContentAssetDto,
  ) {
    return this.success(
      'Launch content asset updated',
      await this.launchContent.updateAsset(id, assetId, dto, file),
    );
  }

  @Delete(':id/assets/:assetId')
  @ApiOperation({ summary: 'Delete an asset from a draft' })
  async deleteAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.success(
      'Launch content asset deleted',
      await this.launchContent.deleteAsset(id, assetId),
    );
  }

  @Post(':id/publish')
  @ApiOperation({
    summary: 'Publish and activate a complete launch-content bundle',
  })
  async publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.success(
      'Launch content published',
      await this.launchContent.publishBundle(id),
    );
  }

  private success(message: string, data: unknown) {
    return { success: true, message, data };
  }
}

@Controller('branding')
@ApiTags('Public Launch Content')
export class LaunchContentPublicController {
  constructor(private readonly launchContent: LaunchContentService) { }

  @Get('launch-content/active')
  @Public()
  @Header('Cache-Control', 'no-cache, must-revalidate')
  @ApiOperation({ summary: 'Get active splash and onboarding intro content' })
  @ApiOkResponse({ description: 'Active published launch content.' })
  async getActive() {
    return {
      success: true,
      message: 'Active launch content retrieved',
      data: await this.launchContent.getActiveBundle(),
    };
  }

  @Get('splash')
  @Public()
  @Header('Cache-Control', 'no-cache, must-revalidate')
  @ApiOperation({ summary: 'Get the active published splash image' })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  async getSplash(): Promise<StreamableFile> {
    const { stream, contentType } =
      await this.launchContent.getPublishedSplashStream();
    return new StreamableFile(stream, {
      type: contentType,
      disposition: 'inline; filename="menu-assist-splash"',
    });
  }
}
