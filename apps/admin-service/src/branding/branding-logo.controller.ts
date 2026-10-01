import { Public, Roles } from '@menu-assist/api-auth';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
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
import { BrandingLogoService } from './branding-logo.service';

type MulterInMemoryFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const logoMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (
    _request: unknown,
    file: { mimetype: string },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedMimeTypes.includes((file.mimetype || '').toLowerCase())) {
      callback(
        new BadRequestException(
          'Unsupported logo type. Allowed: PNG, JPEG, WebP',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};

@Controller('branding/logo')
@ApiTags('Admin Branding')
export class BrandingLogoController {
  constructor(private readonly brandingLogo: BrandingLogoService) {}

  @Get('settings')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current application logo metadata' })
  @ApiOkResponse({ description: 'Current application logo metadata.' })
  async getSettings() {
    return {
      success: true,
      message: 'Logo retrieved successfully',
      data: await this.brandingLogo.getLogo(),
    };
  }

  @Post()
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload or replace the application logo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PNG, JPEG, or WebP logo up to 2 MB.',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Application logo uploaded and activated.' })
  @UseInterceptors(FileInterceptor('file', logoMulterOptions))
  async upload(@UploadedFile() file: MulterInMemoryFile | undefined) {
    if (!file?.buffer) {
      throw new BadRequestException(
        'Missing file (use multipart field name `file`)',
      );
    }

    return {
      success: true,
      message: 'Logo uploaded successfully',
      data: await this.brandingLogo.uploadLogo(file),
    };
  }

  @Delete()
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove the current application logo' })
  @ApiOkResponse({ description: 'Application logo removed.' })
  async remove() {
    return {
      success: true,
      message: 'Logo removed successfully',
      data: await this.brandingLogo.deleteLogo(),
    };
  }

  @Get()
  @Public()
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @ApiOperation({ summary: 'Get the current application logo image' })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiOkResponse({ description: 'Current application logo image.' })
  async getLogoFile(): Promise<StreamableFile> {
    const { stream, contentType } = await this.brandingLogo.getLogoStream();
    return new StreamableFile(stream, {
      type: contentType,
      disposition: 'inline; filename="menu-assist-logo"',
    });
  }
}
