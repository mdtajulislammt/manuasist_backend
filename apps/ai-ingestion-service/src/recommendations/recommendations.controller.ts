import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { GetScanRecommendationsQueryDto } from './dto/get-scan-recommendations-query.dto';
import { RecommendationsService } from './recommendations.service';

@Controller()
@ApiTags('Recommendations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get('scans/:id/recommendations')
  @ApiOperation({ summary: 'Get ranked recommendations for a completed scan' })
  @ApiOkResponse({ description: 'Recommendations returned' })
  forScan(
    @CurrentUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) scanId: string,
    @Query() query: GetScanRecommendationsQueryDto,
  ) {
    return this.recommendations.getScanRecommendations(
      this.requireUserId(userId),
      scanId,
      query,
    );
  }

  @Get('recommendations/me')
  @ApiOperation({ summary: 'Cross-scan personalized top picks' })
  @ApiOkResponse({ description: 'Personal recommendations returned' })
  forMe(@CurrentUserId() userId: string | undefined) {
    return this.recommendations.getMyRecommendations(this.requireUserId(userId));
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return userId;
  }
}
