import { Public } from '@menu-assist/api-auth';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { IngestionInternalApiKeyGuard } from './internal-api-key.guard';

@Controller('internal/users')
@ApiTags('Internal — ingestion bookmarks')
@Public()
@UseGuards(IngestionInternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
@ApiUnauthorizedResponse({ description: 'Invalid or missing internal API key' })
export class InternalBookmarksController {
  constructor(private readonly recommendations: RecommendationsService) { }

  @Get(':userId/bookmarks')
  @ApiOperation({ summary: 'Get bookmarked dishes for a user' })
  @ApiOkResponse({ description: 'Bookmarks returned' })
  getBookmarks(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.recommendations.getBookmarks(userId);
  }

  @Patch(':userId/bookmarks/dishes/:dishId')
  @ApiOperation({ summary: 'Toggle bookmark state for a dish' })
  @ApiOkResponse({ description: 'Bookmark state returned' })
  toggleBookmark(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('dishId', ParseUUIDPipe) dishId: string,
  ) {
    return this.recommendations.toggleDishBookmark(userId, dishId);
  }
}
