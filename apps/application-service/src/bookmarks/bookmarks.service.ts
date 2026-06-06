import { Injectable } from '@nestjs/common';
import { AiIngestionBookmarksClientService } from './ai-ingestion-bookmarks-client.service';

@Injectable()
export class BookmarksService {
  constructor(
    private readonly aiBookmarks: AiIngestionBookmarksClientService,
  ) {}

  getBookmarks(userId: string) {
    return this.aiBookmarks.getBookmarks(userId);
  }

  toggleBookmark(userId: string, dishId: string) {
    return this.aiBookmarks.toggleBookmark(userId, dishId);
  }
}
