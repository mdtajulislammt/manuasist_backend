import { Public, Roles } from '@menu-assist/api-auth';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { DeleteOnboardingIconQueryDto } from './dto/icons/delete-onboarding-icon-query.dto';
import { ReplaceOnboardingIconBodyDto } from './dto/icons/replace-onboarding-icon-body.dto';
import { ReplaceOnboardingIconQueryDto } from './dto/icons/replace-onboarding-icon-query.dto';
import { UploadOnboardingIconBodyDto } from './dto/icons/upload-onboarding-icon-body.dto';
import { UploadOnboardingIconQueryDto } from './dto/icons/upload-onboarding-icon-query.dto';
import {
  normalizeIconNameInput,
  OnboardingIconsService,
  type OnboardingIconUploadFile,
} from './onboarding-icons.service';

type MulterInMemoryFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const iconMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const mime = (file.mimetype || '').toLowerCase();
    const allowed = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];
    if (!allowed.includes(mime)) {
      return cb(
        new BadRequestException(
          'Unsupported image type. Allowed: PNG, JPEG, GIF, WebP, SVG',
        ),
        false,
      );
    }
    cb(null, true);
  },
};

@Controller('onboarding/icons')
@ApiTags('Admin Onboarding Icons')
export class OnboardingIconsController {
  constructor(private readonly icons: OnboardingIconsService) {}

  @Post()
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload onboarding option icon (image)',
    description:
      'Multipart: required field `file` (image). Optional **admin label** `iconName` (e.g. `Peanuts`) — put it in the form body or as a query param; body wins if both are set. That label is stored in meta and returned as `iconName` in the JSON response; the file on disk is always a UUID name (`filename` / `iconUrl`), which is separate. Optional `stepId` in body or query restricts upload to steps on DRAFT flows.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        iconName: {
          type: 'string',
          description:
            'Optional admin label (not the stored filename). Letters, digits, `_`, `-`, `.`; max 128.',
          example: 'Peanuts',
        },
        stepId: { type: 'string', format: 'uuid', description: 'Optional draft-flow step check.' },
      },
    },
  })
  @ApiOkResponse({
    description:
      'Returns stored `filename` (UUID), `iconUrl`, and optional `iconName` admin label if you set it.',
  })
  @ApiQuery({
    name: 'stepId',
    required: false,
    description: 'If set, step must belong to a DRAFT flow.',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'iconName',
    required: false,
    description:
      'Same as multipart field `iconName` if you prefer query string. When both are sent, the form body value wins.',
    example: 'spice_mild',
  })
  @UseInterceptors(FileInterceptor('file', iconMulterOptions))
  async upload(
    @UploadedFile() file: MulterInMemoryFile | undefined,
    @Query() query: UploadOnboardingIconQueryDto,
    @Body() body: UploadOnboardingIconBodyDto,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Missing file (use multipart field name `file`)');
    }
    const payload: OnboardingIconUploadFile = {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
    const stepId = body.stepId ?? query.stepId;
    const iconName = body.iconName ?? query.iconName;
    const data = await this.icons.saveNewIcon(payload, stepId, iconName);
    return {
      success: true,
      message: 'Icon uploaded successfully',
      data,
    };
  }

  @Patch(':filename')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Replace an existing onboarding icon file',
    description:
      'Same MIME family as existing extension. Path `:filename` is the stored UUID file (unchanged). Optional `iconName` / `clearIconName` / `stepId` as multipart text fields or query; body overrides query when both are set.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        iconName: { type: 'string', example: 'Peanuts' },
        clearIconName: {
          type: 'string',
          description: '`true` / `1` / `yes` to clear the admin label',
          example: 'false',
        },
        stepId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOkResponse({ description: 'Icon replaced.' })
  @ApiQuery({
    name: 'stepId',
    required: false,
    description: 'If set, step must belong to a DRAFT flow.',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'iconName',
    required: false,
    description:
      'When set, updates the **admin-assigned label** only (not `:filename`). Omit to keep the previous label.',
    example: 'spice_hot',
  })
  @ApiQuery({
    name: 'clearIconName',
    required: false,
    description:
      'If `true` or `1`, clears the stored admin label (`iconName`). Do not send a non-empty `iconName` at the same time.',
    example: 'false',
  })
  @UseInterceptors(FileInterceptor('file', iconMulterOptions))
  async update(
    @Param('filename') filename: string,
    @UploadedFile() file: MulterInMemoryFile | undefined,
    @Query() query: ReplaceOnboardingIconQueryDto,
    @Body() body: ReplaceOnboardingIconBodyDto,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Missing file (use multipart field name `file`)');
    }
    const payload: OnboardingIconUploadFile = {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
    const clear =
      body.clearIconName === true || query.clearIconName === true;
    const iconNameMerged = body.iconName ?? query.iconName;
    if (
      clear &&
      iconNameMerged !== undefined &&
      String(iconNameMerged).trim() !== ''
    ) {
      throw new BadRequestException(
        'Do not pass iconName when clearIconName is true',
      );
    }
    const stepId = body.stepId ?? query.stepId;
    const iconName = clear ? '' : normalizeIconNameInput(iconNameMerged);
    const data = await this.icons.replaceIcon(
      filename,
      payload,
      stepId,
      iconName,
    );
    return {
      success: true,
      message: 'Icon updated successfully',
      data,
    };
  }

  @Delete(':filename')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete an onboarding icon file',
    description: 'Optional query `stepId` for draft-flow check (same as upload).',
  })
  @ApiOkResponse({ description: 'Icon deleted.' })
  @ApiQuery({
    name: 'stepId',
    required: false,
    description: 'If set, step must belong to a DRAFT flow.',
    format: 'uuid',
  })
  async remove(
    @Param('filename') filename: string,
    @Query() query: DeleteOnboardingIconQueryDto,
  ) {
    const data = await this.icons.deleteIcon(filename, query.stepId);
    return {
      success: true,
      message: 'Icon deleted successfully',
      data,
    };
  }

  @Get()
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all uploaded onboarding icons',
    description:
      'Returns metadata for every stored file (UUID + extension filenames). `iconName` when present is the optional **admin label** from meta, not the filename. Use `iconUrl` in `uiConfig.options[].icon` or fetch binaries via GET `/onboarding/icons/:filename`.',
  })
  @ApiOkResponse({
    description:
      'Each entry: `filename` (stored UUID file), `iconUrl`, size, content type, and optional `iconName` (admin label from meta).',
  })
  async listAll() {
    const data = await this.icons.listAllIcons();
    return {
      success: true,
      message: 'Icons listed successfully',
      data,
    };
  }

  @Get(':filename')
  @Public()
  @ApiOperation({
    summary: 'Get onboarding icon file (binary)',
    description:
      'Public so mobile/web clients can load images referenced by `uiConfig` URLs without an admin token. Filename is an unguessable UUID.',
  })
  @ApiProduces('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml')
  @ApiOkResponse({ description: 'Image stream.' })
  async get(@Param('filename') filename: string): Promise<StreamableFile> {
    const { stream, contentType } = await this.icons.getReadStream(filename);
    return new StreamableFile(stream, {
      type: contentType,
      disposition: `inline; filename="${filename}"`,
    });
  }
}
