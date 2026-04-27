import type { NutritionFacts, NutritionProvider } from './types';

/**
 * Open Food Facts search (best-effort; restaurant dishes often miss).
 */
export class OpenFoodFactsProvider implements NutritionProvider {
  readonly id = 'open_food_facts';

  async lookup(
    query: string,
    signal?: AbortSignal,
  ): Promise<NutritionFacts | null> {
    const q = query.trim().slice(0, 200);
    if (!q) {
      return null;
    }
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=1`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as {
      products?: {
        nutriments?: {
          'energy-kcal_100g'?: number;
          proteins_100g?: number;
          carbohydrates_100g?: number;
          fat_100g?: number;
        };
      }[];
    };
    const p = body.products?.[0]?.nutriments;
    if (!p) {
      return null;
    }
    const kcal = p['energy-kcal_100g'] ?? 0;
    return {
      calories: Math.max(1, Math.round(kcal)),
      proteinG: p.proteins_100g,
      carbG: p.carbohydrates_100g,
      fatG: p.fat_100g,
      source: this.id,
      confidence: 0.45,
    };
  }
}
