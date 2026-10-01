import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@menu-assist/api-auth';
import { memoryStorage } from 'multer';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { InternalUploadFileBodyDto } from './dto/internal-upload-file.dto';
import { FileStorageService } from './file-storage.service';

type MulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('internal/files')
@ApiTags('Internal files')
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
export class InternalFilesController {
  constructor(private readonly files: FileStorageService) {}

  @Post()
  @ApiOperation({ summary: 'Store a file (service-to-service)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'namespace'],
      properties: {
        file: { type: 'string', format: 'binary' },
        namespace: {
          type: 'string',
          enum: [
            'ONBOARDING_ICON',
            'MENU_SCAN',
            'DISH_IMAGE',
            'SPLASH',
            'INTRO_IMAGE',
            'USER_AVATAR',
            'GENERIC',
          ],
        },
        displayName: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: 'Stored file metadata and public URL.' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: InternalUploadFileBodyDto,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Missing multipart field `file`');
    }
    const data = await this.files.storeNew(
      body.namespace,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      body.displayName,
    );
    return {
      success: true,
      message: 'File stored',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get stored file metadata by id' })
  @ApiOkResponse({ description: 'File metadata.' })
  async getMeta(@Param('id') id: string) {
    const data = await this.files.findById(id);
    return {
      success: true,
      message: 'File metadata retrieved',
      data,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete stored file by id' })
  @ApiOkResponse({ description: 'File deleted.' })
  async remove(@Param('id') id: string) {
    const data = await this.files.deleteById(id);
    return {
      success: true,
      message: 'File deleted',
      data,
    };
  }
}
