import {
  BadGatewayException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type BookmarkToggleResponse = {
  success: boolean;
  message: string;
  data: {
    dishId: string;
    scanId: string;
    name: string;
    isBookmarked: boolean;
    bookmarkedAt: string | null;
  };
};

type BookmarkListResponse = {
  success: boolean;
  message: string;
  data: {
    items: Array<Record<string, unknown>>;
  };
};

@Injectable()
export class AiIngestionBookmarksClientService {
  constructor(private readonly config: ConfigService) { }

  getBookmarks(userId: string): Promise<BookmarkListResponse> {
    return this.requestInternal<BookmarkListResponse>(
      'GET',
      `/internal/users/${userId}/bookmarks`,
    );
  }

  toggleBookmark(userId: string, dishId: string): Promise<BookmarkToggleResponse> {
    return this.requestInternal<BookmarkToggleResponse>(
      'PATCH',
      `/internal/users/${userId}/bookmarks/dishes/${dishId}`,
    );
  }

  private async requestInternal<T>(
    method: 'GET' | 'PATCH',
    path: string,
  ): Promise<T> {
    const base = this.config
      .getOrThrow<string>('AI_INGESTION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('INGESTION_INTERNAL_API_KEY');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: { 'x-internal-api-key': key },
      });
    } catch (error) {
      throw new BadGatewayException(
        `Could not reach ai-ingestion-service: ${String(error)}`,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      if (res.status >= 400 && res.status < 500) {
        throw new HttpException(this.parseErrorPayload(text, res.status), res.status);
      }
      throw new BadGatewayException(
        `ai-ingestion-service returned ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return res.json() as Promise<T>;
  }

  private parseErrorPayload(text: string, status: number) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        message: text || 'ai-ingestion-service request failed',
        status,
      };
    }
  }
}
