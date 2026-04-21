import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '@menu-assist/api-auth';
import { IngestionInternalApiKeyGuard } from './internal-api-key.guard';
import { ScanProcessorService } from '../scans/scan-processor.service';
import { ScansService } from '../scans/scans.service';

@Controller('internal/scans')
@ApiTags('Internal — ingestion ops')
@Public()
@UseGuards(IngestionInternalApiKeyGuard)
@ApiHeader({
  name: 'x-internal-api-key',
  required: true,
})
@ApiUnauthorizedResponse({ description: 'Invalid or missing internal API key' })
export class InternalScansController {
  constructor(
    private readonly scans: ScansService,
    private readonly processor: ScanProcessorService,
  ) {}

  @Get('recent')
  @ApiOperation({ summary: 'List recent scans (all users)' })
  @ApiOkResponse({ description: 'Recent scans' })
  recent(@Query('limit') limitRaw?: string) {
    const n = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    const limit = Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 20;
    return this.scans.listRecentInternal(limit);
  }

  @Post(':id/reprocess')
  @ApiOperation({
    summary: 'Re-run ingestion pipeline for a scan',
    description: 'Uses stored imageUrl and userId from the scan row.',
  })
  async reprocess(@Param('id', ParseUUIDPipe) scanId: string) {
    const scan = await this.scans.getScanByIdInternal(scanId);
    await this.processor.reprocessScan(scan.id, scan.userId, scan.imageUrl);
    return { success: true, message: 'Reprocess started', data: { scanId } };
  }
}
