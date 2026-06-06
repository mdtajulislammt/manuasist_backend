import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { BookmarksService } from './bookmarks.service';

@Controller('bookmarks')
@ApiTags('Bookmarks')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get all bookmarked dishes for the current user' })
  @ApiOkResponse({ description: 'Bookmarks returned' })
  getBookmarks(@CurrentUserId() userId: string | undefined) {
    return this.bookmarks.getBookmarks(this.requireUserId(userId));
  }

  @Patch('dishes/:dishId')
  @ApiOperation({ summary: 'Toggle bookmark state for a recommended dish' })
  @ApiOkResponse({ description: 'Bookmark state returned' })
  toggleBookmark(
    @CurrentUserId() userId: string | undefined,
    @Param('dishId', ParseUUIDPipe) dishId: string,
  ) {
    return this.bookmarks.toggleBookmark(this.requireUserId(userId), dishId);
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return userId;
  }
}
