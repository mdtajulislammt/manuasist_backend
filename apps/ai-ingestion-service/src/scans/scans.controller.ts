import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CreateScanDto } from './dto/create-scan.dto';
import { ScansService } from './scans.service';

@Controller('scans')
@ApiTags('Menu scans')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit a menu image URL for ingestion',
    description:
      'Creates a scan in PENDING state and emits scan.submitted.v1 for async processing.',
  })
  @ApiBody({ type: CreateScanDto })
  @ApiOkResponse({ description: 'Scan created' })
  create(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: CreateScanDto,
  ) {
    const id = this.requireUserId(userId);
    return this.scans.createScan(id, dto.imageUrl);
  }

  @Get()
  @ApiOperation({ summary: 'List my menu scans' })
  list(@CurrentUserId() userId: string | undefined) {
    const id = this.requireUserId(userId);
    return this.scans.listScansForUser(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single scan with dishes' })
  getOne(
    @CurrentUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) scanId: string,
  ) {
    const id = this.requireUserId(userId);
    return this.scans.getScanForUser(id, scanId);
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException();
    }
    return userId;
  }
}
