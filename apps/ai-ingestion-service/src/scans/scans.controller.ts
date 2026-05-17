import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { CreateTextScanDto } from './dto/create-text-scan.dto';
import { ScansService } from './scans.service';

type MulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('scans')
@ApiTags('Menu scans')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit a menu photo from the app',
    description:
      'Multipart upload of a menu image (JPEG/PNG/WebP). Stored server-side and processed asynchronously.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ description: 'Scan created' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  createFromImage(
    @CurrentUserId() userId: string | undefined,
    @UploadedFile() file: MulterFile | undefined,
  ) {
    const id = this.requireUserId(userId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing multipart field `file`');
    }
    return this.scans.createScanFromImage(id, file);
  }

  @Post('text')
  @ApiOperation({
    summary: 'Submit menu text (dev/test only)',
    description: 'Skips image upload and OCR. Not used by the mobile app.',
  })
  @ApiBody({ type: CreateTextScanDto })
  @ApiOkResponse({ description: 'Text scan created' })
  createFromText(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: CreateTextScanDto,
  ) {
    return this.scans.createScanFromText(this.requireUserId(userId), dto.menuText);
  }

  @Get()
  @ApiOperation({ summary: 'List my menu scans' })
  list(@CurrentUserId() userId: string | undefined) {
    return this.scans.listScansForUser(this.requireUserId(userId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single scan with dishes' })
  getOne(
    @CurrentUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) scanId: string,
  ) {
    return this.scans.getScanForUser(this.requireUserId(userId), scanId);
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return userId;
  }
}
