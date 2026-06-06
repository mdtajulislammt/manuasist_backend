import { Test, TestingModule } from '@nestjs/testing';
import { AiIngestionBookmarksClientService } from './ai-ingestion-bookmarks-client.service';
import { BookmarksService } from './bookmarks.service';

describe('BookmarksService', () => {
  let service: BookmarksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookmarksService,
        {
          provide: AiIngestionBookmarksClientService,
          useValue: {
            getBookmarks: jest.fn(),
            toggleBookmark: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BookmarksService>(BookmarksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
