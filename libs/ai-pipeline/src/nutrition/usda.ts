import type { NutritionFacts, NutritionProvider } from './types';

/**
 * USDA FoodData Central — general foods search.
 * https://fdc.nal.usda.gov/api-guide.html
 */
export class UsdaFdcProvider implements NutritionProvider {
  readonly id = 'usda_fdc';
  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async lookup(
    query: string,
    signal?: AbortSignal,
  ): Promise<NutritionFacts | null> {
    if (!this.apiKey) {
      return null;
    }
    const q = query.trim().slice(0, 200);
    if (!q) {
      return null;
    }
    const url = new URL(
      'https://api.nal.usda.gov/fdc/v1/foods/search',
    );
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('query', q);
    url.searchParams.set('pageSize', '1');
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as {
      foods?: {
        description?: string;
        foodNutrients?: { nutrientName?: string; value?: number }[];
      }[];
    };
    const food = body.foods?.[0];
    if (!food) {
      return null;
    }
    let calories = 0;
    let proteinG: number | undefined;
    let carbG: number | undefined;
    let fatG: number | undefined;
    for (const n of food.foodNutrients ?? []) {
      const name = (n.nutrientName ?? '').toLowerCase();
      const v = n.value ?? 0;
      if (name.includes('energy') && name.includes('kcal')) {
        calories = Math.round(v);
      }
      if (name === 'protein') {
        proteinG = v;
      }
      if (name.includes('carbohydrate')) {
        carbG = v;
      }
      if (name.includes('total lipid') || name === 'total fat') {
        fatG = v;
      }
    }
    if (calories <= 0) {
      calories = 200;
    }
    return {
      calories,
      proteinG,
      carbG,
      fatG,
      source: this.id,
      confidence: 0.65,
    };
  }
}
