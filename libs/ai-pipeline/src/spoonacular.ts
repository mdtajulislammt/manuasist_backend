import { Logger } from '@nestjs/common';

// High-quality public domain food photos from Unsplash for robust fallbacks
export const FOOD_FALLBACKS: Record<string, string> = {
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=600&auto=format&fit=crop',
  pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=600&auto=format&fit=crop',
  burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=600&auto=format&fit=crop',
  pasta: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?q=80&w=600&auto=format&fit=crop',
  steak: 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=600&auto=format&fit=crop',
  soup: 'https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=600&auto=format&fit=crop',
  sushi: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=600&auto=format&fit=crop',
  dessert: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?q=80&w=600&auto=format&fit=crop',
  chicken: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?q=80&w=600&auto=format&fit=crop',
  fish: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?q=80&w=600&auto=format&fit=crop',
  curry: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?q=80&w=600&auto=format&fit=crop',
  sandwich: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?q=80&w=600&auto=format&fit=crop',
  taco: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?q=80&w=600&auto=format&fit=crop',
  default: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?q=80&w=600&auto=format&fit=crop',
};

export class SpoonacularClient {
  private readonly logger = new Logger(SpoonacularClient.name);

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Search for a dish image on Spoonacular. Falls back to a local high-quality stock photo mapping
   * if the search fails, has no results, or if Spoonacular is not configured.
   */
  async getDishImage(query: string, signal?: AbortSignal): Promise<string> {
    const q = query.trim();
    if (!q) {
      return FOOD_FALLBACKS.default;
    }

    if (this.apiKey) {
      try {
        const url = new URL('https://api.spoonacular.com/recipes/complexSearch');
        url.searchParams.set('apiKey', this.apiKey);
        url.searchParams.set('query', q);
        url.searchParams.set('number', '1');

        const res = await fetch(url.toString(), { signal });
        if (res.ok) {
          const data = (await res.json()) as {
            results?: {
              image?: string;
            }[];
          };
          const image = data.results?.[0]?.image;
          if (image) {
            return image;
          }
        } else {
          this.logger.warn(
            `Spoonacular API search returned non-ok status: ${res.status}`,
          );
        }
      } catch (e) {
        this.logger.warn(
          `Failed to lookup image from Spoonacular for query "${q}": ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    // Local semantic fallback
    const lowerQuery = q.toLowerCase();
    for (const [keyword, imageUrl] of Object.entries(FOOD_FALLBACKS)) {
      if (lowerQuery.includes(keyword)) {
        return imageUrl;
      }
    }

    return FOOD_FALLBACKS.default;
  }
}
