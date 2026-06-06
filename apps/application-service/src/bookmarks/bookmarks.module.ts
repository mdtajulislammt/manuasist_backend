import { Module } from '@nestjs/common';
import { AiIngestionBookmarksClientService } from './ai-ingestion-bookmarks-client.service';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';

@Module({
  controllers: [BookmarksController],
  providers: [BookmarksService, AiIngestionBookmarksClientService],
})
export class BookmarksModule {}
