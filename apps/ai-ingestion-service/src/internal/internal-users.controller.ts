import { Public } from '@menu-assist/api-auth';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ScansService } from '../scans/scans.service';
import { IngestionInternalApiKeyGuard } from './internal-api-key.guard';

@Controller('internal/users')
@ApiTags('Internal — ingestion users')
@Public()
@UseGuards(IngestionInternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
@ApiUnauthorizedResponse({ description: 'Invalid or missing internal API key' })
export class InternalUsersController {
  constructor(private readonly scans: ScansService) { }

  @Get(':userId/home-summary')
  @ApiOperation({ summary: 'Get home screen scan and NAI summary for a user' })
  @ApiQuery({
    name: 'trackingRange',
    required: false,
    enum: ['daily', 'weekly', 'monthly'],
    example: 'weekly',
  })
  @ApiOkResponse({ description: 'Home summary returned.' })
  getHomeSummary(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('trackingRange') trackingRange?: string,
  ) {
    return this.scans.getHomeSummaryForUser(userId, trackingRange);
  }

  @Get(':userId/completed-scans')
  @ApiOperation({ summary: 'List completed scans in a date range for analytics' })
  @ApiQuery({ name: 'from', required: true, example: '2026-06-01T00:00:00.000Z' })
  @ApiQuery({ name: 'to', required: true, example: '2026-06-24T00:00:00.000Z' })
  @ApiOkResponse({ description: 'Completed scans returned.' })
  getCompletedScans(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.scans.getCompletedScansForUser(
      userId,
      new Date(from),
      new Date(to),
    );
  }
}
